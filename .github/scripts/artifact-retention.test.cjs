'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const store = require('./center-artifacts.cjs');
const { retentionPlan, prune } = require('./artifact-retention.cjs');
const NOW = Date.parse('2026-09-28T12:00:00Z');
const entry = (id, conclusion, createdAt = '2026-09-28T10:00:00Z', kind = 'report', attempt = 1, group = 'ci-root-1') => ({
  name: `${id}-${attempt}-${group}`,
  meta: { runId: String(id), attempt, kind, group, createdAt },
  run: { id, run_attempt: attempt, conclusion, status: 'completed', updated_at: createdAt },
  latest: { id, run_attempt: attempt, conclusion, status: 'completed' },
});
const names = items => items.map(item => item.name);

test('keeps all shards of the latest failed attempt across workflows, without replacing them after success or failed saves', () => {
  const entries = [entry(10, 'failure'), entry(11, 'failure'), entry(11, 'failure', undefined, 'report', 1, 'ci-root-2'), entry(12, 'success')];
  assert.deepEqual(names(retentionPlan(entries, NOW)), [entries[0].name, entries[3].name]);
  assert.deepEqual(retentionPlan([entries[0]], NOW), []);
  assert.deepEqual(names(retentionPlan([entries[0], entry(10, 'failure', undefined, 'report', 2)], NOW)), [entries[0].name]);
});

test('90-day evidence expiry and one-day failed-package expiry never delete active runs', () => {
  const old = entry(10, 'failure', '2026-01-01');
  const release = entry(11, 'failure', '2026-09-26', 'release');
  const recent = entry(12, 'failure', undefined, 'release');
  const active = entry(13, 'failure', '2026-01-01'); active.latest.status = 'in_progress';
  assert.deepEqual(names(retentionPlan([old, release, recent, active], NOW)), [old.name, release.name]);
  const successfulRelease = entry(14, 'success', undefined, 'release');
  assert.deepEqual(names(retentionPlan([successfulRelease], NOW)), [successfulRelease.name]);
});

test('GitHub attempt provenance and a last-moment rerun protect stored data; pruning never calls artifact deletion APIs', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'china-airlines-retention-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('china-airlines-retention-test-'));
    fs.rmSync(base, { recursive: true });
  });
  const root = path.join(base, 'store'), work = path.join(base, 'work'); fs.mkdirSync(root); fs.mkdirSync(work);
  const saved = [10, 11, 12, 13].map(id => store.saveFailure(root, work, {
    repository: store.REPOSITORY, runId: String(id), attempt: 1, sha: 'a'.repeat(40), createdAt: '2026-09-28T10:00:00Z',
  }, 'ci-root-1'));
  const reads = new Map();
  const run = id => ({ ...entry(id, id === 13 ? 'success' : 'failure').run, path: '.github/workflows/ci.yml' });
  const actions = {
    getWorkflowRun: async ({ run_id }) => {
      const count = (reads.get(run_id) || 0) + 1; reads.set(run_id, count);
      return { data: { ...run(run_id), status: run_id === 10 && count > 1 ? 'in_progress' : 'completed' } };
    },
    getWorkflowRunAttempt: async ({ run_id, attempt_number }) => {
      assert.equal(attempt_number, 1);
      return { data: { ...run(run_id), path: run_id === 11 ? '.github/workflows/untrusted.yml' : '.github/workflows/ci.yml' } };
    },
  };
  const deleted = await prune({ github: { rest: { actions } }, context: { repo: { owner: 'meviu523', repo: 'China-Airlines' } },
    core: { info() {}, warning() {} }, root, now: NOW });
  assert.deepEqual(deleted, [saved[3].name]);
  for (const entry of saved.slice(0, 3)) assert.ok(fs.existsSync(entry.directory));
  assert.ok(!fs.existsSync(saved[3].directory));
});

test('an unrelated repository cannot invoke center pruning', async () => {
  await assert.rejects(prune({ context: { repo: { owner: 'meviu523', repo: 'riversoft.top' } } }), /Unexpected/);
});
