// Optional first-installation bridge. Polling happens in this ordinary process,
// not in the assistant. Normal deliveries use GitHub completion events instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { api, pages, PREFIX, redact } from '../.github/scripts/github-api.cjs';
import { deliver, complete, dispatch, comment } from '../.github/scripts/delivery-controller.cjs';
import state from '../.github/scripts/delivery-state.cjs';
import deployment from '../deploy/targets.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const [prArg, sha] = process.argv.slice(2);
const prNumber = Number(prArg);
if (!Number.isSafeInteger(prNumber) || prNumber < 1 || !/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Usage: node scripts/watch-delivery.mjs <PR> <expected-head-SHA>');
if (!process.env.GH_TOKEN) process.env.GH_TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const localStore = path.join(root, 'artifacts', `delivery-${prNumber}`);
fs.mkdirSync(localStore, { recursive: true });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const startingBranch = git('branch', '--show-current');
let previous = '', mergedAt = 0;
function status(value) {
  if (value !== previous) { console.log(`${new Date().toISOString()} ${value}`); previous = value; }
}
try {
  for (const deadline = Date.now() + 4 * 60 * 60_000; Date.now() < deadline;) {
    const pr = await api('GET', `${PREFIX}/pulls/${prNumber}`);
    if (pr.head.sha !== sha) throw new Error('PR head changed; bootstrap stopped without following the new commit.');
    if (!pr.merged) {
      if (pr.state !== 'open') throw new Error('PR was closed without merging.');
      const runs = await pages(api, `${PREFIX}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${sha}`, 'workflow_runs');
      const run = runs.sort((a, b) => b.id - a.id)[0];
      if (run?.status === 'completed') {
        if (run.conclusion === 'success') {
          const name = `verification-${run.id}-${run.run_attempt}.json`;
          if (!/^verification-[1-9][0-9]*-[1-9][0-9]*\.json$/.test(name)) throw new Error('Invalid verification identity.');
          const remote = `${deployment.artifactRoot}/delivery/${name}`;
          if (!/^\/[a-zA-Z0-9/_-]+\.json$/.test(remote)) throw new Error('Unsafe remote receipt path.');
          const receipt = JSON.parse(execFileSync('ssh', ['-o', 'BatchMode=yes', 'center', 'cat', remote], { encoding: 'utf8', timeout: 30_000 }));
          state.write(localStore, name, receipt);
        }
        const result = await deliver({ prNumber, root: localStore, dispatchDeployment: false, env: {} });
        status(result.status);
        if (run.conclusion !== 'success') { process.exitCode = 1; break; }
        if (!result.status.startsWith('已合并')) throw new Error(`Delivery did not advance: ${result.status}`);
        mergedAt = Date.now();
      } else status(`CI ${run?.status || 'pending'}: ${run?.html_url || pr.html_url}`);
    } else {
      if (!mergedAt) mergedAt = Date.now();
      const runs = await pages(api, `${PREFIX}/actions/workflows/deploy-production.yml/runs?head_sha=${pr.merge_commit_sha}`, 'workflow_runs');
      const run = runs.sort((a, b) => b.id - a.id)[0];
      if (run?.status === 'completed') {
        const result = await complete({ run, root: localStore, env: {} });
        status(result.status);
        process.exitCode = run.conclusion === 'success' ? 0 : 1;
        if (run.conclusion === 'success' && startingBranch && startingBranch !== 'main'
          && git('branch', '--show-current') === startingBranch && git('rev-parse', 'HEAD') === sha && !git('status', '--porcelain')) {
          git('fetch', 'origin', 'main', '--prune');
          git('switch', 'main');
          git('merge', '--ff-only', 'origin/main');
          git('branch', '-D', startingBranch);
          console.log('Local main synchronized; the merged feature branch was removed.');
        }
        break;
      }
      if (!run && Date.now() - mergedAt > 120_000) await dispatch(api, pr.merge_commit_sha, prNumber);
      status(`Production ${run?.status || 'pending'}: ${run?.html_url || pr.html_url}`);
    }
    await sleep(120_000);
  }
  if (!/已上线|失败/.test(previous)) throw new Error('Delivery watch timed out; inspect PR and Actions.');
} catch (error) {
  const message = `自动交付引导停止：${redact(error.message)}`;
  console.error(message);
  fs.writeFileSync(path.join(localStore, 'bootstrap-error.log'), `${message}\n`);
  try { await comment(api, prNumber, message); } catch (notifyError) { console.error(redact(notifyError.message)); }
  process.exitCode = 1;
}
