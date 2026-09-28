'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('./center-artifacts.cjs');
const state = require('./delivery-state.cjs');
const { PREFIX, REPOSITORY, redact } = require('./github-api.cjs');
const { CONTRACT, validate, browserCount, proof, reusable } = require('./verification-receipt.cjs');
const { deliver, dispatch, complete, requestFor, failureDetails } = require('./delivery-controller.cjs');
const HEAD = 'a'.repeat(40), BASE = 'b'.repeat(40), MERGE = 'c'.repeat(40), TREE = 'd'.repeat(40), MAIN = 'e'.repeat(40);

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'china-airlines-delivery-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('china-airlines-delivery-test-'));
    fs.rmSync(root, { recursive: true });
  });
  const environment = { contract: CONTRACT, node: 'v22.23.3', npm: '10', platform: 'linux', lock: 'locked' };
  const receipt = { version: CONTRACT, repository: REPOSITORY, runId: '10', attempt: 1, pr: 14, head: HEAD,
    base: BASE, commit: MERGE, tree: TREE, environment, tests: { browser: 255 }, createdAt: new Date().toISOString() };
  state.write(root, 'verification-10-1.json', receipt);
  const repo = { full_name: REPOSITORY };
  const pr = { number: 14, state: 'open', draft: false, merged: false, head: { sha: HEAD, repo }, base: { sha: BASE, ref: 'main', repo } };
  const run = { id: 10, run_attempt: 1, head_sha: HEAD, head_branch: 'feature', path: '.github/workflows/ci.yml',
    event: 'pull_request', status: 'completed', conclusion: 'success', repository: repo, html_url: 'https://github.com/example/run/10' };
  const jobs = [{ id: 100, name: 'delivery-ready', status: 'completed', conclusion: 'success' }];
  const comments = [{ id: 1, user: { login: 'owner', type: 'User' }, body: `<!-- china-airlines-delivery-request:${HEAD} -->` }];
  const calls = [];
  let extraChecks = [], permission = 'admin', main = BASE, runs = [run], deploymentRuns = [];
  const request = async (method, route, body) => {
    calls.push({ method, route, body });
    const endpoint = route.split('?')[0];
    if (endpoint === `${PREFIX}/pulls/14`) return structuredClone(pr);
    if (endpoint === `${PREFIX}/issues/14/comments` && method === 'GET') return comments;
    if (endpoint === `${PREFIX}/collaborators/owner/permission`) return { permission };
    if (endpoint === `${PREFIX}/actions/workflows/ci.yml/runs`) return { workflow_runs: runs };
    if (endpoint === `${PREFIX}/actions/runs/10`) return run;
    if (endpoint === `${PREFIX}/actions/runs/10/attempts/1/jobs`) return { jobs };
    if (endpoint === `${PREFIX}/git/commits/${MERGE}`) return { tree: { sha: TREE }, parents: [{ sha: BASE }, { sha: HEAD }] };
    if (endpoint === `${PREFIX}/git/commits/${MAIN}`) return { tree: { sha: TREE }, parents: [{ sha: BASE }] };
    if (endpoint.endsWith('/check-runs')) return { check_runs: extraChecks };
    if (endpoint.endsWith('/status')) return { total_count: 0, state: 'pending' };
    if (endpoint === `${PREFIX}/git/ref/heads/main`) return { object: { sha: main } };
    if (endpoint === `${PREFIX}/pulls/14/merge` && method === 'PUT') return { merged: true, sha: MAIN };
    if (endpoint === `${PREFIX}/actions/workflows/deploy-production.yml/runs`) return { workflow_runs: deploymentRuns };
    if (endpoint === `${PREFIX}/actions/workflows/deploy-production.yml/dispatches` && method === 'POST') return null;
    if (endpoint === `${PREFIX}/issues/14/comments` && method === 'POST') return { id: 2, ...body };
    if (endpoint === `${PREFIX}/commits/${MAIN}/pulls`) return [{ ...pr, merged_at: new Date().toISOString(), merge_commit_sha: MAIN }];
    if (/\/actions\/jobs\/\d+\/logs$/.test(endpoint)) return 'Error: expected 2, received 7\n at map.spec.ts:12';
    throw new Error(`Unmocked API call ${method} ${route}`);
  };
  return { root, environment, receipt, pr, run, jobs, comments, calls, request,
    setChecks(value) { extraChecks = value; }, setPermission(value) { permission = value; },
    setMain(value) { main = value; }, setRuns(value) { runs = value; }, setDeploymentRuns(value) { deploymentRuns = value; } };
}

test('same-revision full verification permits squash and explicit deployment exactly once', async t => {
  const f = fixture(t);
  const result = await deliver({ ...f, prNumber: 14, env: {} });
  assert.equal(result.status, '已合并，部署已提交');
  assert.deepEqual(f.calls.find(c => c.route.endsWith('/merge')).body, { sha: HEAD, merge_method: 'squash' });
  assert.deepEqual(f.calls.find(c => c.route.endsWith('/dispatches')).body, { ref: 'main', inputs: { expected_sha: MAIN, delivery_pr: '14' } });
  assert.equal(state.read(f.root, 'result-10-1.json').pr, 14);
  assert.ok(f.calls.find(c => c.method === 'POST' && c.route.endsWith('/comments')).body.body.includes('部署和公开验收完成前'));
});

test('permission, explicit current-head intent, drafts and foreign repositories gate automation', async t => {
  for (const change of [f => f.comments.splice(0), f => f.setPermission('read'), f => { f.comments[0].body = `<!-- china-airlines-delivery-request:${BASE} -->`; }]) {
    const f = fixture(t); change(f);
    assert.equal((await deliver({ ...f, prNumber: 14, env: {} })).status, 'not-requested');
    assert.ok(!f.calls.some(c => c.method === 'PUT'));
  }
  const f = fixture(t); f.pr.head.repo = { full_name: 'someone/fork' };
  await assert.rejects(deliver({ ...f, prNumber: 14, env: {} }), /same-repository/);
});

test('current contract delivery requests are accepted but other versions cannot authorize a merge', async t => {
  const f = fixture(t);
  f.comments[0].body = `<!-- china-airlines-delivery-request-v${CONTRACT}:${HEAD} -->`;
  assert.equal((await requestFor(f.request, f.pr)).id, 1);
  f.comments[0].body = `<!-- china-airlines-delivery-request-v99:${HEAD} -->`;
  assert.equal(await requestFor(f.request, f.pr), null);
});

test('failed, cancelled, skipped or missing required checks never merge', async t => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) {
    const f = fixture(t); f.jobs[0].conclusion = conclusion;
    await assert.rejects(deliver({ ...f, prNumber: 14, env: {} }), /missing or not successful/);
    assert.ok(!f.calls.some(c => c.method === 'PUT'));
  }
  const f = fixture(t); f.jobs.splice(0);
  await assert.rejects(proof(f.request, f.receipt), /missing/);
});

test('other pending checks, newer attempts, stale main and changed head cannot use previous success', async t => {
  const pending = fixture(t); pending.setChecks([{ status: 'in_progress', conclusion: null }]);
  assert.equal((await deliver({ ...pending, prNumber: 14, env: {} })).status, 'other-checks-not-successful');
  const attempt = fixture(t); attempt.run.run_attempt = 2;
  await assert.rejects(proof(attempt.request, attempt.receipt), /does not match/);
  const moved = fixture(t); moved.setMain(MAIN);
  await assert.rejects(deliver({ ...moved, prNumber: 14, env: {} }), /Main advanced/);
  const head = fixture(t); head.pr.head.sha = BASE;
  assert.equal(await requestFor(head.request, head.pr), null);
  for (const f of [pending, attempt, moved, head]) assert.ok(!f.calls.some(c => c.method === 'PUT'));
});

test('failure notifications preserve useful errors and never start deployment', async t => {
  const f = fixture(t); f.run.conclusion = 'failure'; f.jobs[0].conclusion = 'failure';
  f.jobs[0].steps = [{ name: 'Full browser verification', conclusion: 'failure' }];
  const result = await deliver({ ...f, prNumber: 14, env: {} });
  assert.match(result.failures[0].log, /expected 2, received 7/);
  assert.deepEqual(result.failures[0].steps, ['Full browser verification']);
  assert.ok(!f.calls.some(c => c.method === 'PUT' || c.route.endsWith('/dispatches')));
});

test('production reuses only identical tree, runtime, merged identity and successful latest run', async t => {
  const f = fixture(t);
  assert.equal((await reusable({ ...f, sha: MAIN, fingerprint: f.environment, tree: TREE })).reused, true);
  assert.equal((await reusable({ ...f, sha: MAIN, fingerprint: { ...f.environment, node: 'v24' }, tree: TREE })).reused, false);
  assert.equal((await reusable({ ...f, sha: MAIN, fingerprint: f.environment, tree: HEAD })).reused, false);
  f.setRuns([{ ...f.run, id: 11, conclusion: 'failure' }, f.run]);
  assert.equal((await reusable({ ...f, sha: MAIN, fingerprint: f.environment, tree: TREE })).reused, false);
});

test('expired, incomplete and altered receipt identities are refused', async t => {
  const f = fixture(t);
  for (const value of [{ ...f.receipt, createdAt: '2020-01-01' }, { ...f.receipt, tests: { browser: 0 } },
    { ...f.receipt, version: 1, environment: { ...f.environment, contract: 1 }, tests: { root: 255, subpath: 255 } },
    { ...f.receipt, tree: '../outside' }, { ...f.receipt, repository: 'someone/else' }]) assert.throws(() => validate(value), /Invalid/);
  await assert.rejects(proof(f.request, { ...f.receipt, tree: HEAD }), /content or parents/);
});

test('one complete relative-path browser report is sufficient; incomplete results never qualify', () => {
  const report = { stats: { expected: 255, unexpected: 0, flaky: 0, skipped: 0 }, errors: [] };
  assert.equal(browserCount(report), 255);
  for (const stats of [{ expected: 0 }, { unexpected: 1 }, { flaky: 1 }, { skipped: 1 }]) {
    assert.throws(() => browserCount({ ...report, stats: { ...report.stats, ...stats } }), /Incomplete/);
  }
  assert.throws(() => browserCount({ ...report, errors: [{ message: 'Global teardown failed' }] }), /Incomplete/);
});

test('delivery state writes are atomic, immutable and reject path traversal and symlinks', t => {
  const f = fixture(t);
  state.write(f.root, 'verification-10-1.json', f.receipt);
  assert.throws(() => state.write(f.root, 'verification-10-1.json', { changed: true }), /overwrite/);
  assert.throws(() => state.read(f.root, '../../elsewhere'), /Invalid/);
  fs.symlinkSync(path.join(f.root, 'delivery'), path.join(f.root, 'linked'), 'junction');
  assert.throws(() => state.read(path.join(f.root, 'linked'), 'verification-10-1.json'), /Unsafe/);
});

test('deployment recovery does not repeat successful, running or failed releases', async t => {
  const f = fixture(t);
  for (const conclusion of ['success', 'failure', null]) {
    f.setDeploymentRuns([{ status: conclusion ? 'completed' : 'in_progress', conclusion }]);
    await dispatch(f.request, MAIN, 14);
  }
  assert.ok(!f.calls.some(c => c.route.endsWith('/dispatches')));
});

test('public acceptance failure stays failed and does not claim rollback', async t => {
  const f = fixture(t);
  const run = { ...f.run, id: 20, head_sha: MAIN, head_branch: 'main', path: '.github/workflows/deploy-production.yml', conclusion: 'cancelled' };
  const request = (method, route, body) => route.includes('/actions/runs/20/attempts/1/jobs') ? { jobs: [] } : f.request(method, route, body);
  const result = await complete({ ...f, request, run, env: {} });
  assert.equal(result.status, '部署失败或未完成');
  assert.match(result.message, /不能据此声称已回滚/);
});

test('download errors are reported and common secrets are removed', async t => {
  const f = fixture(t); f.jobs[0].conclusion = 'failure';
  const request = (method, route) => route.endsWith('/logs') ? Promise.reject(new Error('not ready')) : f.request(method, route);
  assert.match((await failureDetails(request, f.run))[0].log, /not ready/);
  assert.equal(redact('Authorization: Bearer abc\npassword=private\nghp_123abc'), 'Authorization: [REDACTED]\npassword=[REDACTED]\n[REDACTED TOKEN]');
});

test('receipt/result retention preserves active runs, unknown files and unavailable identities', async t => {
  const f = fixture(t);
  const file = state.target(f.root, 'verification-10-1.json');
  fs.utimesSync(file, new Date('2020-01-01'), new Date('2020-01-01'));
  await state.prune({ ...f, request: async () => ({ status: 'in_progress', run_attempt: 1 }), log() {} });
  assert.ok(fs.existsSync(file));
  await state.prune({ ...f, request: async () => { const e = new Error('gone'); e.status = 404; throw e; }, log() {} });
  assert.ok(fs.existsSync(file));
  await state.prune({ ...f, request: async () => ({ status: 'completed', run_attempt: 1 }), log() {} });
  assert.ok(!fs.existsSync(file));
});

test('bootstrap can merge with a user credential while leaving the push-triggered deployment to GitHub', async t => {
  const f = fixture(t);
  const result = await deliver({ ...f, prNumber: 14, env: {}, dispatchDeployment: false });
  assert.equal(result.status, '已合并，等待生产工作流');
  assert.ok(!f.calls.some(c => c.route.endsWith('/dispatches')));
});
