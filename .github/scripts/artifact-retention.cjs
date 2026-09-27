'use strict';

const workflows = new Set(['.github/workflows/ci.yml', '.github/workflows/deploy-production.yml', '.github/workflows/ui-contracts.yml']);
const failed = new Set(['failure', 'timed_out']);

function classify(repository, artifact) {
  const current = /^failure-evidence-(\d+)-(\d+)-[a-z0-9-]+$/.exec(artifact.name);
  if (current) return Number(current[1]) === artifact.workflow_run?.id && Number(current[2]) > 0
    ? { type: 'report', attempt: Number(current[2]) } : null;
  if (repository === 'riversoft.top') {
    if (artifact.name === 'browser-previews' || /^production-browser-previews-[a-f0-9]{40}-\d+$/.test(artifact.name)) return { type: 'report' };
    if (/^production-release-[a-f0-9]{40}-\d+$/.test(artifact.name)) return { type: 'release' };
  }
  if (repository === 'China-Airlines') {
    if (['ui-contract-reports', 'ui-contract-evidence'].includes(artifact.name)) return { type: 'report' };
    if (/^china-airlines-(?:reports|verification)-(?:root|subpath)-[1-4]$/.test(artifact.name)
      || /^china-airlines-production-(?:reports|failure)-[a-f0-9]{40}-\d+-[1-4]$/.test(artifact.name)) return { type: 'report' };
    if (/^china-airlines-production-[a-f0-9]{40}-\d+$/.test(artifact.name)) return { type: 'release' };
  }
  return null;
}

function retentionPlan(entries) {
  const completed = entries.filter(entry => entry.run.status === 'completed');
  // One failed attempt includes all its matrix shards. Only replace evidence once
  // a newer failed attempt has actually uploaded artifacts; successful runs add none.
  const failures = completed.filter(entry => entry.type === 'report' && failed.has(entry.run.conclusion));
  const key = entry => `${entry.run.id}:${entry.run.run_attempt}`;
  const time = entry => Date.parse(entry.run.updated_at);
  failures.sort((a, b) => time(b) - time(a) || b.run.id - a.run.id || b.run.run_attempt - a.run.run_attempt);
  const keep = failures.length ? key(failures[0]) : null;
  return completed.filter(entry => entry.type === 'release'
    ? entry.run.conclusion === 'success'
    : !failed.has(entry.run.conclusion) || key(entry) !== keep).map(entry => entry.artifact.id);
}

async function prune({ github, context, core, dryRun = false }) {
  const { owner, repo } = context.repo;
  if (owner !== 'meviu523' || !['riversoft.top', 'China-Airlines'].includes(repo)) throw new Error('Unexpected artifact retention repository.');
  const artifacts = await github.paginate(github.rest.actions.listArtifactsForRepo, { owner, repo, per_page: 100 });
  const entries = [], runs = new Map();
  for (const artifact of artifacts) {
    const classification = classify(repo, artifact);
    if (!classification || !Number.isSafeInteger(artifact.workflow_run?.id)) continue;
    const run_id = artifact.workflow_run.id;
    const cacheKey = `${run_id}:${classification.attempt || 'latest'}`;
    if (!runs.has(cacheKey)) {
      const result = classification.attempt
        ? await github.rest.actions.getWorkflowRunAttempt({ owner, repo, run_id, attempt_number: classification.attempt })
        : await github.rest.actions.getWorkflowRun({ owner, repo, run_id });
      runs.set(cacheKey, result.data);
    }
    const run = runs.get(cacheKey);
    // Never trust artifact names alone or execute/download artifact contents.
    if (run.id !== run_id || !workflows.has(run.path) || !Number.isSafeInteger(run.run_attempt)
      || !Number.isFinite(Date.parse(run.updated_at))) continue;
    entries.push({ artifact, run, ...classification });
  }
  const selected = new Set(retentionPlan(entries));
  const deleted = [];
  for (const entry of entries) {
    if (!selected.has(entry.artifact.id)) continue;
    // A rerun may have started since the inventory. Its artifacts remain protected.
    const latest = (await github.rest.actions.getWorkflowRun({ owner, repo, run_id: entry.run.id })).data;
    if (latest.status !== 'completed') continue;
    if (entry.type === 'release' && latest.conclusion !== 'success') continue;
    if (!dryRun) await github.rest.actions.deleteArtifact({ owner, repo, artifact_id: entry.artifact.id });
    deleted.push(entry.artifact.id);
    core.info(`${dryRun ? 'Would remove' : 'Removed'} ${entry.artifact.id}: ${entry.artifact.name}`);
  }
  core.info(`${dryRun ? 'Selected' : 'Removed'} ${deleted.length} artifacts; latest failure, active runs, logs and unknown artifacts preserved.`);
  return deleted;
}

module.exports = { classify, retentionPlan, prune };
