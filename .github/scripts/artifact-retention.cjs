'use strict';

const store = require('./center-artifacts.cjs');
const failed = new Set(['failure', 'timed_out']);
const workflows = {
  '.github/workflows/ci.yml': /^(ci-(root|subpath)-[1-4]|ci-full)$/,
  '.github/workflows/ui-contracts.yml': /^ui-contracts$/,
  '.github/workflows/deploy-production.yml': /^(production-[1-4]|production|deploy)$/,
};

function retentionPlan(entries, now = Date.now()) {
  const completed = entries.filter(entry => entry.run.status === 'completed' && entry.latest.status === 'completed');
  const failures = completed.filter(entry => entry.meta.kind === 'report' && failed.has(entry.run.conclusion));
  const key = entry => `${entry.meta.runId}:${entry.meta.attempt}`;
  failures.sort((a, b) => Date.parse(b.run.updated_at) - Date.parse(a.run.updated_at)
    || Number(b.meta.runId) - Number(a.meta.runId) || b.meta.attempt - a.meta.attempt);
  const keep = failures.length ? key(failures[0]) : null;
  return completed.filter(entry => entry.meta.kind === 'release'
    ? entry.latest.conclusion === 'success' || now - Date.parse(entry.meta.createdAt) >= store.DAY
    : !failed.has(entry.run.conclusion) || key(entry) !== keep || now - Date.parse(entry.meta.createdAt) >= 90 * store.DAY);
}

async function prune({ github, context, core, root = store.ROOT, dryRun = false, now = Date.now() }) {
  const { owner, repo } = context.repo;
  if (`${owner}/${repo}` !== store.REPOSITORY) throw new Error('Unexpected artifact retention repository.');
  const entries = [], runs = new Map(), attempts = new Map();
  for (const entry of store.listEntries(root, message => core.warning(message))) {
    const run_id = Number(entry.meta.runId), attempt_number = entry.meta.attempt;
    const key = `${run_id}:${attempt_number}`;
    try {
      if (!runs.has(run_id)) runs.set(run_id, (await github.rest.actions.getWorkflowRun({ owner, repo, run_id })).data);
      if (!attempts.has(key)) attempts.set(key, (await github.rest.actions.getWorkflowRunAttempt({ owner, repo, run_id, attempt_number })).data);
    } catch (error) {
      if (error.status !== 404) throw error;
      core.warning(`Preserving ${entry.name}: workflow run no longer available.`);
      continue;
    }
    const run = attempts.get(key), latest = runs.get(run_id);
    if (run.id !== run_id || run.run_attempt !== attempt_number || latest.id !== run_id
      || !workflows[run.path] || !Number.isFinite(Date.parse(run.updated_at))) continue;
    if (entry.meta.kind === 'report' && !workflows[run.path].test(entry.meta.group)) continue;
    if (entry.meta.kind === 'release' && (run.path !== '.github/workflows/deploy-production.yml'
      || run.head_sha !== entry.meta.sha || run.head_branch !== 'main')) continue;
    entries.push({ ...entry, run, latest });
  }
  const deleted = [];
  for (const entry of retentionPlan(entries, now)) {
    const latest = (await github.rest.actions.getWorkflowRun({ owner, repo, run_id: Number(entry.meta.runId) })).data;
    // Recheck right before deletion, including attempts started after inventory.
    if (latest.status !== 'completed' || latest.run_attempt !== entry.latest.run_attempt) continue;
    if (!dryRun) store.removeEntry(root, entry);
    deleted.push(entry.name);
    core.info(`${dryRun ? 'Would remove' : 'Removed'} center artifact: ${entry.name}`);
  }
  core.info(`${dryRun ? 'Selected' : 'Removed'} ${deleted.length} center artifacts; active runs and unknown files preserved.`);
  return deleted;
}

module.exports = { retentionPlan, prune };
