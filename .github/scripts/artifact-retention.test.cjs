const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, retentionPlan, prune } = require('./artifact-retention.cjs');

const entry = (id, runId, conclusion, time, type = 'report', attempt = 1, status = 'completed') => ({
  artifact: { id }, type,
  run: { id: runId, run_attempt: attempt, conclusion, status, updated_at: time, path: '.github/workflows/ci.yml' },
});
test('keeps every shard of the newest failed attempt, across workflows, while successful runs create no replacement', () => {
  const entries = [entry(1, 10, 'failure', '2026-09-25'), entry(2, 11, 'failure', '2026-09-26'),
    entry(3, 11, 'failure', '2026-09-26'), entry(4, 12, 'success', '2026-09-27'),
    entry(5, 13, null, '2026-09-28', 'report', 1, 'in_progress')];
  assert.deepEqual(retentionPlan(entries), [1, 4]);
  assert.deepEqual(retentionPlan([entries[1], entries[2], entry(6, 11, 'failure', '2026-09-28', 'report', 2)]), [2, 3]);
});
test('only successful completed releases are removed; pending and failed deployment packages remain usable', () => {
  assert.deepEqual(retentionPlan([entry(1, 10, 'success', '2026-09-25', 'release'),
    entry(2, 11, 'failure', '2026-09-26', 'release'), entry(3, 12, null, '2026-09-27', 'release', 1, 'in_progress')]), [1]);
});
test('strict artifact allowlist cannot confuse release packages, unrelated data or a spoofed run identity with reports', () => {
  assert.equal(classify('riversoft.top', { name: 'failure-evidence-12-1-browser', workflow_run: { id: 13 } }), null);
  assert.equal(classify('riversoft.top', { name: 'database-backup' }), null);
  assert.equal(classify('riversoft.top', { name: 'production-release-' + 'a'.repeat(40) + '-1' }).type, 'release');
  assert.equal(classify('China-Airlines', { name: 'china-airlines-production-' + 'a'.repeat(40) + '-123' }).type, 'release');
});
test('API pagination, attempt lookup, upload failure preservation and rerun race protect data from deletion', async () => {
  const artifacts = [1, 2, 3].map(id => ({ id, name: `failure-evidence-${id}-1-browser`, workflow_run: { id } }));
  const deleted = [], inspected = [];
  const actions = {
    listArtifactsForRepo: () => {},
    getWorkflowRunAttempt: async ({ run_id, attempt_number }) => {
      inspected.push([run_id, attempt_number]);
      return { data: entry(0, run_id, run_id === 1 ? 'success' : 'failure', `2026-09-2${run_id}`).run };
    },
    getWorkflowRun: async ({ run_id }) => ({ data: { status: run_id === 2 ? 'in_progress' : 'completed', conclusion: 'success' } }),
    deleteArtifact: async ({ artifact_id }) => { deleted.push(artifact_id); },
  };
  const github = { rest: { actions }, paginate: async (method, options) => { assert.equal(method, actions.listArtifactsForRepo); assert.equal(options.per_page, 100); return artifacts; } };
  await prune({ github, context: { repo: { owner: 'meviu523', repo: 'riversoft.top' } }, core: { info() {} } });
  assert.deepEqual(inspected, [[1, 1], [2, 1], [3, 1]]);
  assert.deepEqual(deleted, [1]);
  assert.deepEqual(retentionPlan([entry(4, 20, 'failure', '2026-09-20')]), [], 'A failed newer upload with no artifact cannot destroy the previous evidence');
});
