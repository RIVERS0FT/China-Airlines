'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const store = require('./center-artifacts.cjs');
const state = require('./delivery-state.cjs');
const { api, pages, PREFIX, REPOSITORY } = require('./github-api.cjs');
const SHA = /^[a-f0-9]{40}$/;
const CONTRACT = 1;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function environment(workspace = process.cwd()) {
  const pw = path.join(workspace, 'node_modules', 'playwright-core');
  return {
    contract: CONTRACT, node: process.version, platform: process.platform, arch: process.arch,
    npm: execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'],
      { encoding: 'utf8', shell: process.platform === 'win32' }).trim(),
    kernel: require('node:os').release(),
    lock: store.digest(path.join(workspace, 'package-lock.json')).sha256,
    playwright: JSON.parse(fs.readFileSync(path.join(pw, 'package.json'), 'utf8')).version,
    browsers: store.digest(path.join(pw, 'browsers.json')).sha256,
  };
}

function validate(receipt, now = Date.now()) {
  if (receipt.version !== CONTRACT || receipt.repository !== REPOSITORY
    || !/^[1-9][0-9]*$/.test(receipt.runId) || !Number.isSafeInteger(receipt.attempt) || receipt.attempt < 1
    || !Number.isSafeInteger(receipt.pr) || receipt.pr < 1
    || ![receipt.head, receipt.base, receipt.commit, receipt.tree].every(s => SHA.test(s || ''))
    || !Number.isFinite(Date.parse(receipt.createdAt)) || now - Date.parse(receipt.createdAt) > store.DAY
    || Date.parse(receipt.createdAt) > now + 300_000 || receipt.environment?.contract !== CONTRACT
    || !['root', 'subpath'].every(name => Number.isSafeInteger(receipt.tests?.[name]) && receipt.tests[name] > 0)) {
    throw new Error('Invalid or expired full-verification receipt.');
  }
  return receipt;
}

function save(env = process.env, root = store.ROOT) {
  if (env.RUNNER_NAME !== store.RUNNER || env.GITHUB_EVENT_NAME !== 'pull_request'
    || !new RegExp(`^${REPOSITORY}/\\.github/workflows/ci\\.yml@refs/pull/[1-9][0-9]*/merge$`).test(env.GITHUB_WORKFLOW_REF || '')) {
    throw new Error('Only PR Verify on center may record full verification.');
  }
  const identity = store.identity(env), event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  if (pr.head.repo.full_name !== REPOSITORY || pr.base.repo.full_name !== REPOSITORY || pr.base.ref !== 'main') throw new Error('Untrusted PR.');
  const tests = {};
  for (const name of ['root', 'subpath']) {
    const stats = JSON.parse(fs.readFileSync(`artifacts/browser-${name}.json`, 'utf8')).stats;
    if (!stats || stats.expected < 1 || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0) {
      throw new Error(`Incomplete browser verification: ${name}`);
    }
    tests[name] = stats.expected;
  }
  if (git('rev-parse', 'HEAD') !== env.GITHUB_SHA) throw new Error('Checkout does not match the tested revision.');
  const receipt = validate({ version: CONTRACT, ...identity, createdAt: new Date().toISOString(), pr: pr.number,
    head: pr.head.sha, base: pr.base.sha, commit: env.GITHUB_SHA, tree: git('rev-parse', 'HEAD^{tree}'),
    environment: environment(), tests });
  const file = state.write(root, `verification-${identity.runId}-${identity.attempt}.json`, receipt);
  console.log(`Full verification recorded: ${file}`);
}

async function proof(request, receipt) {
  validate(receipt);
  const run = await request('GET', `${PREFIX}/actions/runs/${receipt.runId}`);
  if (run.path !== '.github/workflows/ci.yml' || run.event !== 'pull_request' || run.status !== 'completed'
    || run.conclusion !== 'success' || run.run_attempt !== receipt.attempt || run.head_sha !== receipt.head
    || run.repository?.full_name !== REPOSITORY) throw new Error('Full verification run does not match receipt.');
  const jobs = await pages(request, `${PREFIX}/actions/runs/${receipt.runId}/attempts/${receipt.attempt}/jobs`, 'jobs');
  if (jobs.length !== 1 || jobs[0].name !== 'delivery-ready' || jobs[0].status !== 'completed' || jobs[0].conclusion !== 'success') {
    throw new Error('Required delivery-ready check is missing or not successful.');
  }
  const commit = await request('GET', `${PREFIX}/git/commits/${receipt.commit}`);
  if (commit.tree.sha !== receipt.tree || commit.parents.length !== 2
    || ![receipt.base, receipt.head].every(sha => commit.parents.some(parent => parent.sha === sha))) {
    throw new Error('Tested merge content or parents do not match the PR.');
  }
  return run;
}

async function reusable({ request = api, root = store.ROOT, sha, fingerprint = environment(), tree = git('rev-parse', 'HEAD^{tree}') }) {
  if (!SHA.test(sha || '')) throw new Error('Invalid production revision.');
  const pulls = await pages(request, `${PREFIX}/commits/${sha}/pulls`);
  const pr = pulls.find(pr => pr.merged_at && pr.merge_commit_sha === sha && pr.base.ref === 'main'
    && pr.head.repo?.full_name === REPOSITORY && pr.base.repo.full_name === REPOSITORY);
  if (!pr) return { reused: false, reason: 'No merged PR for this exact production commit.' };
  const runs = await pages(request, `${PREFIX}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}`, 'workflow_runs');
  // Only the latest attempt/run is eligible. Never fall back past a failed rerun.
  const run = runs.sort((a, b) => b.id - a.id)[0];
  if (!run || run.conclusion !== 'success' || run.status !== 'completed') return { reused: false, reason: 'Latest PR verification is not successful.' };
  let receipt;
  try {
    receipt = validate(state.read(root, `verification-${run.id}-${run.run_attempt}.json`));
    if (receipt.pr !== pr.number || receipt.head !== pr.head.sha || receipt.tree !== tree
      || JSON.stringify(receipt.environment) !== JSON.stringify(fingerprint)) throw new Error('Source tree or verification environment changed.');
    await proof(request, receipt);
  } catch (error) {
    return { reused: false, reason: error.message };
  }
  return { reused: true, reason: `PR #${pr.number}, Verify ${run.id}/${run.run_attempt}, identical source tree and environment.`, receipt };
}

async function main() {
  if (process.argv[2] === 'save') return save();
  if (process.argv[2] !== 'reuse' || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.RUNNER_NAME !== store.RUNNER || process.env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error('Invalid receipt command.');
  const result = await reusable({ sha: process.env.GITHUB_SHA });
  console.log(`Reuse full verification: ${result.reused}. ${result.reason}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `reused=${result.reused}\n`);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\nFull verification reused: ${result.reused}. ${result.reason}\n`);
}

module.exports = { CONTRACT, environment, validate, proof, reusable, save };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
