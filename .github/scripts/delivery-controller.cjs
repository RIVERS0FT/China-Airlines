'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { api, pages, redact, REPOSITORY, PREFIX } = require('./github-api.cjs');
const store = require('./center-artifacts.cjs');
const state = require('./delivery-state.cjs');
const { CONTRACT, proof } = require('./verification-receipt.cjs');
const REQUEST = new RegExp(`^<!-- china-airlines-delivery-request(?:-v${CONTRACT})?:([a-f0-9]{40}) -->$`, 'm');
const STATUS = '<!-- china-airlines-delivery-status -->';

async function requestFor(request, pr) {
  const comments = await pages(request, `${PREFIX}/issues/${pr.number}/comments`);
  const intent = comments.slice().reverse().find(c => REQUEST.exec(c.body || '')?.[1] === pr.head.sha);
  if (!intent) return null;
  const permission = await request('GET', `${PREFIX}/collaborators/${encodeURIComponent(intent.user.login)}/permission`);
  if (!['admin', 'maintain', 'write'].includes(permission.permission)) return null;
  return intent;
}

async function comment(request, pr, body) {
  const comments = await pages(request, `${PREFIX}/issues/${pr}/comments`);
  const existing = comments.find(c => (c.user?.login === 'github-actions[bot]' || c.user?.login === REPOSITORY.split('/')[0])
    && c.body?.startsWith(STATUS));
  const value = { body: `${STATUS}\n${redact(body).slice(0, 58000)}` };
  if (existing) await request('PATCH', `${PREFIX}/issues/comments/${existing.id}`, value);
  else await request('POST', `${PREFIX}/issues/${pr}/comments`, value);
}

async function failureDetails(request, run) {
  const jobs = await pages(request, `${PREFIX}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
  const failures = [];
  for (const job of jobs.filter(j => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(j.conclusion))) {
    let tail;
    try {
      const log = await request('GET', `${PREFIX}/actions/jobs/${job.id}/logs`);
      const lines = redact(log).replace(/\x1b\[[0-9;]*m/g, '').split('\n');
      const errors = lines.filter(line => /error|fail|expected|received|timeout|at .*:\d+/i.test(line));
      tail = (errors.length ? errors.slice(-45) : lines.slice(-45)).join('\n').slice(-12000);
    } catch (error) { tail = `日志暂时不可下载：${error.message}；请打开任务链接。`; }
    failures.push({ job: job.name, url: job.html_url, steps: job.steps?.filter(s => s.conclusion === 'failure').map(s => s.name) || [], log: tail });
  }
  return failures;
}

function format(result) {
  const text = [`**交付状态：${result.status}**`, '', `- 提交：\`${result.sha}\``, `- 工作流：${result.url}`];
  if (result.message) text.push(`- ${result.message}`);
  if (result.evidence) text.push(`- 结果记录：\`${result.evidence}\`（${result.storage}）`);
  for (const failure of result.failures || []) {
    text.push('', `失败任务：[${failure.job}](${failure.url})`, `失败步骤：${failure.steps.join('、') || '见任务日志'}`,
      '', '```text', failure.log.replace(/```/g, "'''"), '```');
  }
  return text.join('\n');
}

async function report({ request, root, run, pr, status, message, failures = [], env }) {
  const name = `result-${run.id}-${run.run_attempt}.json`;
  const result = { version: 1, repository: REPOSITORY, pr, runId: run.id, attempt: run.run_attempt,
    sha: run.head_sha, status, message, url: run.html_url, failures,
    storage: root === store.ROOT ? '相对 center 构件根目录' : '相对本地仓库',
    evidence: root === store.ROOT ? path.posix.join('delivery', name) : path.relative(process.cwd(), path.join(root, 'delivery', name)).replaceAll('\\', '/') };
  state.write(root, name, result);
  const body = format(result);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${body}\n`);
  if (pr) await comment(request, pr, body);
  console.log(JSON.stringify({ status, pr, sha: result.sha, url: result.url, result: result.evidence }));
  return result;
}

async function deliver({ request = api, root = store.ROOT, prNumber, env = process.env, dispatchDeployment = true }) {
  if (!Number.isSafeInteger(prNumber) || prNumber < 1) throw new Error('Invalid PR number.');
  const pr = await request('GET', `${PREFIX}/pulls/${prNumber}`);
  if (pr.base.repo.full_name !== REPOSITORY || pr.head.repo?.full_name !== REPOSITORY || pr.base.ref !== 'main' || pr.draft) {
    throw new Error('Only ready same-repository PRs into main are eligible.');
  }
  if (!await requestFor(request, pr)) return { status: 'not-requested' };
  if (pr.merged) {
    // Recovery after a merge succeeded but explicit dispatch failed. Main may
    // have advanced; never deploy an older revision as a side effect of retry.
    const main = await request('GET', `${PREFIX}/git/ref/heads/main`);
    if (main.object.sha !== pr.merge_commit_sha) return { status: 'superseded' };
    if (dispatchDeployment) await dispatch(request, pr.merge_commit_sha, prNumber);
    return { status: 'deployment-requested', sha: pr.merge_commit_sha };
  }
  if (pr.state !== 'open') return { status: 'closed' };
  const runs = await pages(request, `${PREFIX}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}`, 'workflow_runs');
  const run = runs.sort((a, b) => b.id - a.id)[0];
  if (!run || run.status !== 'completed') return { status: 'pending' };
  if (run.conclusion !== 'success') {
    return report({ request, root, run, pr: prNumber, env, status: '验证失败，未合并',
      message: '后续部署已停止；失败、取消、超时或未执行均不计为通过。', failures: await failureDetails(request, run) });
  }
  const receipt = state.read(root, `verification-${run.id}-${run.run_attempt}.json`);
  if (receipt.pr !== prNumber || receipt.head !== pr.head.sha || receipt.base !== pr.base.sha) throw new Error('PR changed since full verification.');
  await proof(request, receipt);
  // Treat any additional check as a gate as well; no cancelled/skipped checks
  // are accepted. Check both the source head and GitHub's tested merge commit.
  for (const sha of [...new Set([pr.head.sha, receipt.commit])]) {
    const checks = await pages(request, `${PREFIX}/commits/${sha}/check-runs?filter=latest`, 'check_runs');
    if (checks.some(c => c.status !== 'completed' || c.conclusion !== 'success')) return { status: 'other-checks-not-successful' };
    const statuses = await request('GET', `${PREFIX}/commits/${sha}/status`);
    if (statuses.total_count && statuses.state !== 'success') return { status: 'commit-status-not-successful' };
  }
  const main = await request('GET', `${PREFIX}/git/ref/heads/main`);
  if (main.object.sha !== receipt.base) throw new Error('Main advanced; refresh the PR and verify again.');
  const fresh = await request('GET', `${PREFIX}/pulls/${prNumber}`);
  if (fresh.head.sha !== receipt.head || fresh.base.sha !== receipt.base || fresh.state !== 'open' || fresh.draft) throw new Error('PR changed before merge.');
  const merged = await request('PUT', `${PREFIX}/pulls/${prNumber}/merge`, { sha: receipt.head, merge_method: 'squash' });
  if (!merged.merged) throw new Error(`Squash merge refused: ${merged.message}`);
  const mergedContent = await request('GET', `${PREFIX}/git/commits/${merged.sha}`);
  if (mergedContent.tree.sha !== receipt.tree) throw new Error('Main changed during merge; deployment stopped pending full verification.');
  if (dispatchDeployment) await dispatch(request, merged.sha, prNumber);
  return report({ request, root, run, pr: prNumber, env, status: dispatchDeployment ? '已合并，部署已提交' : '已合并，等待生产工作流',
    message: `合并提交 ${merged.sha}。部署和公开验收完成前不视为上线。` });
}

async function dispatch(request, sha, pr) {
  const runs = await pages(request, `${PREFIX}/actions/workflows/deploy-production.yml/runs?head_sha=${sha}`, 'workflow_runs');
  // An explicit controller retry must not launch a duplicate deployment.
  if (runs.length) return;
  await request('POST', `${PREFIX}/actions/workflows/deploy-production.yml/dispatches`, {
    ref: 'main', inputs: { expected_sha: sha, delivery_pr: String(pr) },
  });
}

async function complete({ request = api, root = store.ROOT, run, env = process.env }) {
  if (run.path !== '.github/workflows/deploy-production.yml' || run.head_branch !== 'main') throw new Error('Unexpected deployment run.');
  const prs = await pages(request, `${PREFIX}/commits/${run.head_sha}/pulls`);
  const pr = prs.find(p => p.merge_commit_sha === run.head_sha && p.merged_at && p.base.ref === 'main');
  return report({ request, root, run, pr: pr?.number, env,
    status: run.conclusion === 'success' ? '已上线，公开验收通过' : '部署失败或未完成',
    message: run.conclusion === 'success' ? '已通过 riversoft.top 发布并验证首页目录；实际入口见生产工作流 Summary。'
      : '请查看失败阶段。平台提交失败不会报告上线；提交后的目录、文件或浏览器验收失败会报告失败，不能据此声称已回滚。',
    failures: run.conclusion === 'success' ? [] : await failureDetails(request, run) });
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.RUNNER_NAME !== store.RUNNER) throw new Error('Wrong delivery repository or runner.');
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let prNumber = Number(process.env.DELIVERY_PR || event.inputs?.pr || 0);
  try {
    if (event.workflow_run) {
      const run = await api('GET', `${PREFIX}/actions/runs/${event.workflow_run.id}`);
      if (run.status !== 'completed' || run.run_attempt !== event.workflow_run.run_attempt) return;
      if (run.path === '.github/workflows/deploy-production.yml') return await complete({ run });
      if (run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request') throw new Error('Unexpected verification event.');
      prNumber = run.pull_requests?.[0]?.number || 0;
      if (!prNumber) {
        const prs = await pages(api, `${PREFIX}/commits/${run.head_sha}/pulls`);
        prNumber = prs.find(p => p.head.sha === run.head_sha && p.base.ref === 'main')?.number || 0;
      }
    }
    if (prNumber) console.log(await deliver({ prNumber }));
  } catch (error) {
    try {
      const run = { id: Number(process.env.GITHUB_RUN_ID), run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
        head_sha: process.env.GITHUB_SHA, html_url: `https://github.com/${REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` };
      await report({ request: api, root: store.ROOT, run, pr: prNumber || undefined, env: process.env,
        status: '自动交付停止', message: redact(error.message) });
    } catch (reportError) { console.error(`Failure notification failed: ${redact(reportError.message)}`); }
    throw error;
  }
}

module.exports = { REQUEST, STATUS, requestFor, comment, failureDetails, format, report, deliver, dispatch, complete };
if (require.main === module) main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
