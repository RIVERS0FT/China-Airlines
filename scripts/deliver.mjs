import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import deployment from '../deploy/targets.json' with { type: 'json' };
import { CONTRACT } from '../.github/scripts/verification-receipt.cjs';

// Explicit paths only: never stage an unrelated dirty file or commit secrets.
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
const separator = args.indexOf('--');
const options = separator < 0 ? args : args.slice(0, separator);
const files = separator < 0 ? [] : args.slice(separator + 1);
const messageIndex = options.indexOf('--message');
const message = messageIndex < 0 ? '' : options[messageIndex + 1];
const release = options.includes('--auto-merge') && options.includes('--deploy');
if (options.includes('--auto-merge') !== options.includes('--deploy')) throw new Error('Use --auto-merge and --deploy together.');
if (options.some((arg, i) => !['--message', '--auto-merge', '--deploy'].includes(arg) && !(messageIndex >= 0 && i === messageIndex + 1))) throw new Error('Unknown delivery option.');
const run = (command, values) => execFileSync(command, values, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const git = (...values) => run('git', values);
const gh = (...values) => run('gh', values);
const repo = JSON.parse(gh('repo', 'view', '--json', 'nameWithOwner'));
if (repo.nameWithOwner !== deployment.repository) throw new Error('Wrong GitHub repository.');
const branch = git('branch', '--show-current');
if (!branch || branch === 'main') throw new Error('Delivery requires a feature branch.');
const remote = git('remote', 'get-url', 'origin');
if (![ `https://github.com/${deployment.repository}.git`, `git@github.com:${deployment.repository}.git` ].includes(remote)) throw new Error('Unexpected origin.');
// Verify the active credential, without failing due to an unrelated inactive account.
gh('api', `repos/${deployment.repository}`, '--jq', '.full_name');
git('fetch', 'origin', 'main');
git('merge-base', '--is-ancestor', 'origin/main', 'HEAD');
git('diff', '--check');
if (files.length) {
  if (!message || message.startsWith('--')) throw new Error('--message is required with files.');
  if (git('diff', '--cached', '--name-only')) throw new Error('Existing staged work must be committed separately.');
  for (const file of files) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).some(part => !part || part === '..')
      || file.split(/[\\/]/).some(part => /^\.env|^node_modules$|^artifacts$|^test-results$|^playwright-report$|^\.git$|\.(pem|key|p12|pfx)$/i.test(part))
      || (fs.existsSync(file) && !fs.lstatSync(file).isFile())) {
      throw new Error(`Only explicit relative source paths are accepted: ${file}`);
    }
  }
  git('add', '--', ...files);
  git('commit', '-m', message);
}
const sha = git('rev-parse', 'HEAD');
// The merge API and comments are bound to this commit, never an implicit future head.
git('push', '-u', 'origin', branch);
let pr = JSON.parse(gh('pr', 'list', '--head', branch, '--base', 'main', '--state', 'open', '--json', 'number,url'))[0];
if (!pr) {
  if (!message) throw new Error('--message is required when creating a PR.');
  const bodyFile = path.join('artifacts', 'delivery-pr-body.md');
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(bodyFile, `${message}\n\n完整类型、单元、资源、相对路径构建及一次全量浏览器验收由 Verify 执行。未完成的检查不计为通过。\n`);
  gh('pr', 'create', '--base', 'main', '--head', branch, '--title', message, '--body-file', bodyFile);
  pr = JSON.parse(gh('pr', 'view', branch, '--json', 'number,url'));
}
if (release) {
  const requestFile = path.join('artifacts', 'delivery-request.md');
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(requestFile, `<!-- china-airlines-delivery-request-v${CONTRACT}:${sha} -->\n请求对此提交完成验证、squash 合并及生产部署；失败时停止并回报日志。\n`);
  gh('pr', 'comment', String(pr.number), '--body-file', requestFile);
  // A receipt contract upgrade cannot be consumed by the old main controller.
  // Its versioned request is ignored there; the fixed-head local bridge uses
  // the new validator and the same checks until main has the new contract.
  const mainWorkflow = git('ls-tree', 'origin/main', '--', '.github/workflows/delivery.yml');
  const mainReceipt = git('ls-tree', 'origin/main', '--', '.github/scripts/verification-receipt.cjs');
  const mainContract = mainReceipt ? Number(/const CONTRACT = (\d+);/.exec(git('show', 'origin/main:.github/scripts/verification-receipt.cjs'))?.[1]) : 0;
  if (mainWorkflow && mainContract === CONTRACT) gh('workflow', 'run', 'delivery.yml', '--ref', 'main', '-f', `pr=${pr.number}`);
  else {
    const log = fs.openSync(`artifacts/delivery-${pr.number}-bootstrap.log`, 'a');
    const error = fs.openSync(`artifacts/delivery-${pr.number}-bootstrap-error.log`, 'a');
    const watcher = spawn(process.execPath, ['scripts/watch-delivery.mjs', String(pr.number), sha], {
      cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, error],
    });
    fs.closeSync(log); fs.closeSync(error);
    watcher.on('error', failure => { console.error(`Delivery bridge failed: ${failure.message}`); process.exitCode = 1; });
    watcher.unref();
    console.log(`Receipt contract ${mainContract} -> ${CONTRACT}: background delivery bridge PID ${watcher.pid}.`);
  }
}
console.log(JSON.stringify({ pr: pr.number, url: pr.url, sha, automaticDelivery: release, status: 'submitted' }, null, 2));
