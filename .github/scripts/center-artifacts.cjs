'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const deployment = require('../../deploy/targets.json');
const ROOT = deployment.artifactRoot;
const REPOSITORY = deployment.repository;
const RUNNER = deployment.runner;
const DAY = 24 * 60 * 60 * 1000;
const GROUP = /^(ci-(root|subpath)-[1-4]|production-[1-4]|ui-contracts|ci-full|production|deploy|delivery)$/;
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[1-9][0-9]*$/;
const RELEASE_FILES = ['china-airlines.tgz', 'china-airlines.tgz.sha256'];

function directory(target) {
  const resolved = path.resolve(target);
  // Check every existing ancestor too: a harmless-looking child of a symlink
  // must never redirect reads, copies or pruning outside the configured store.
  for (let cursor = resolved; ; cursor = path.dirname(cursor)) {
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe directory: ${cursor}`);
    if (cursor === path.dirname(cursor)) break;
  }
  return resolved;
}

function makeDirectory(target) {
  const missing = [];
  let cursor = path.resolve(target);
  while (!fs.existsSync(cursor)) {
    // A dangling symlink must fail rather than create its destination.
    try { fs.lstatSync(cursor); throw new Error(`Unsafe directory: ${cursor}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    missing.push(cursor); cursor = path.dirname(cursor);
  }
  directory(cursor);
  for (const part of missing.reverse()) {
    fs.mkdirSync(part, { mode: 0o700 });
    directory(part);
  }
  return directory(target);
}

function initialize(root = ROOT) {
  directory(root); // Provisioned by the administrator, never silently use _work/_temp.
  for (const kind of ['reports', 'releases']) {
    const target = path.join(root, kind);
    makeDirectory(target);
    fs.accessSync(target, fs.constants.R_OK | fs.constants.W_OK);
  }
}

function identity(env = process.env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || !ID.test(env.GITHUB_RUN_ID || '')
    || !ID.test(env.GITHUB_RUN_ATTEMPT || '') || !SHA.test(env.GITHUB_SHA || '')) {
    throw new Error('Invalid repository, run, attempt or revision.');
  }
  return { repository: REPOSITORY, runId: env.GITHUB_RUN_ID, attempt: Number(env.GITHUB_RUN_ATTEMPT), sha: env.GITHUB_SHA };
}

function nameOf(meta) {
  return `${meta.runId}-${meta.attempt}-${meta.kind === 'release' ? meta.sha : meta.group}`;
}

function digest(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${file}`);
  return { size: stat.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
}

function safeRelative(relative) {
  return typeof relative === 'string' && relative.length > 0 && !relative.includes('\\')
    && !relative.includes(':') && relative.split('/').every(part => part && !part.startsWith('.')
      && part !== 'node_modules' && !/[\x00-\x1f]/.test(part));
}

function inventory(root, prefix = '', source = false) {
  directory(root);
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!source && !prefix && entry.name === 'manifest.json') continue;
    if (source && entry.name.startsWith('.')) continue;
    const relative = prefix + entry.name;
    if (!safeRelative(relative)) throw new Error(`Unsafe artifact path: ${relative}`);
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Artifact symlink rejected: ${relative}`);
    if (entry.isDirectory()) files.push(...inventory(file, `${relative}/`, source));
    else files.push({ path: relative, ...digest(file) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function validateMeta(meta) {
  if (meta.version !== 1 || meta.repository !== REPOSITORY || !ID.test(meta.runId || '')
    || !Number.isSafeInteger(meta.attempt) || meta.attempt < 1 || !SHA.test(meta.sha || '')
    || !['report', 'release'].includes(meta.kind) || !Number.isFinite(Date.parse(meta.createdAt))
    || (meta.kind === 'report' && !GROUP.test(meta.group || '')) || !Array.isArray(meta.files)) {
    throw new Error('Invalid artifact manifest.');
  }
}

function checkRelease(target) {
  const checksum = fs.readFileSync(path.join(target, RELEASE_FILES[1]), 'utf8');
  const expected = `${digest(path.join(target, RELEASE_FILES[0])).sha256}  china-airlines.tgz`;
  if (checksum.trim() !== expected) throw new Error('Release SHA-256 mismatch.');
}

function readEntry(root, kind, name) {
  if (!['reports', 'releases'].includes(kind)) throw new Error('Invalid artifact kind.');
  if (path.basename(name) !== name || !/^[1-9][0-9]*-[1-9][0-9]*-[a-z0-9-]+$/.test(name)) throw new Error('Invalid artifact directory.');
  const target = directory(path.join(directory(root), kind, name));
  const manifestFile = path.join(target, 'manifest.json');
  digest(manifestFile);
  const meta = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  validateMeta(meta);
  if (nameOf(meta) !== name || kind !== (meta.kind === 'report' ? 'reports' : 'releases')) throw new Error('Artifact identity mismatch.');
  if (JSON.stringify(inventory(target)) !== JSON.stringify(meta.files)) throw new Error('Artifact contents changed.');
  if (meta.kind === 'release') {
    if (meta.files.map(file => file.path).join(',') !== RELEASE_FILES.join(',')) throw new Error('Unexpected release contents.');
    checkRelease(target);
  }
  return { directory: target, name, kind, meta };
}

function writeEntry(root, meta, populate) {
  initialize(root);
  meta = { ...meta, version: 1, createdAt: meta.createdAt || new Date().toISOString(), files: [] };
  validateMeta(meta);
  const kind = meta.kind === 'release' ? 'releases' : 'reports';
  const parent = directory(path.join(root, kind));
  const target = path.join(parent, nameOf(meta));
  if (fs.existsSync(target)) throw new Error('This run/attempt artifact already exists; refusing to overwrite it.');
  const stage = fs.mkdtempSync(path.join(parent, '.pending-'));
  try {
    populate(stage);
    meta.files = inventory(stage);
    if (!meta.files.length) throw new Error('Empty artifact.');
    if (meta.kind === 'release') checkRelease(stage);
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(meta, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    // A complete manifest appears atomically; interrupted copies never replace
    // the previous usable failure evidence or release.
    fs.renameSync(stage, target);
    return readEntry(root, kind, nameOf(meta));
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true });
  }
}

function copyFile(source, target) {
  digest(source);
  makeDirectory(path.dirname(target));
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, 0o600);
}

function saveFailure(root, workspace, meta, group) {
  if (!GROUP.test(group)) throw new Error('Invalid evidence group.');
  directory(workspace);
  return writeEntry(root, { ...meta, kind: 'report', group }, stage => {
    for (const relative of ['artifacts', 'playwright-report', 'test-results']) {
      const source = path.join(workspace, relative);
      if (!fs.existsSync(source)) continue;
      for (const file of inventory(source, '', true)) copyFile(path.join(source, ...file.path.split('/')), path.join(stage, relative, ...file.path.split('/')));
    }
    fs.writeFileSync(path.join(stage, 'failure-context.json'), JSON.stringify({ ...meta, group }) + '\n', { flag: 'wx', mode: 0o600 });
  });
}

function saveRelease(root, source, meta) {
  directory(source);
  return writeEntry(root, { ...meta, kind: 'release' }, stage => {
    for (const name of RELEASE_FILES) copyFile(path.join(source, name), path.join(stage, name));
  });
}

function listEntries(root, warn = console.warn) {
  initialize(root);
  const entries = [];
  for (const kind of ['reports', 'releases']) {
    for (const name of fs.readdirSync(path.join(root, kind))) {
      try { entries.push(readEntry(root, kind, name)); }
      catch (error) { warn(`Preserving unrecognized/incomplete artifact ${kind}/${name}: ${error.message}`); }
    }
  }
  return entries;
}

function restoreRelease(root, destination, meta, now = Date.now()) {
  initialize(root);
  const names = fs.readdirSync(path.join(root, 'releases')).filter(name => {
    const match = /^([1-9][0-9]*)-([1-9][0-9]*)-([a-f0-9]{40})$/.exec(name);
    return match && match[1] === meta.runId && match[3] === meta.sha && Number(match[2]) <= meta.attempt;
  }).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  // Do not fall back to an older package when the newest matching one is corrupt.
  const selected = names.length ? readEntry(root, 'releases', names[0]) : null;
  if (!selected || now - Date.parse(selected.meta.createdAt) > DAY) throw new Error('No matching unexpired center release; rerun verification shard 1.');
  // Earlier successful shard 1 is reusable when only another shard/deploy is rerun.
  makeDirectory(destination);
  for (const name of RELEASE_FILES) copyFile(path.join(selected.directory, name), path.join(destination, name));
  checkRelease(destination);
  return selected;
}

function removeEntry(root, entry) {
  const fresh = readEntry(root, entry.kind, entry.name);
  if (JSON.stringify(fresh.meta) !== JSON.stringify(entry.meta)) throw new Error('Artifact changed during retention.');
  fs.rmSync(fresh.directory, { recursive: true });
}

function summary(entry, env) {
  const message = `Center artifact: ${entry.directory}\n`;
  console.log(message.trim());
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `\n- ${message}`);
}

function main(args, env = process.env) {
  if (env.RUNNER_NAME !== RUNNER) throw new Error('Artifacts must be stored on the center runner.');
  const meta = identity(env);
  const [command, group] = args;
  if (command === 'check') { initialize(); console.log(`Center artifact store ready: ${ROOT}`); return; }
  if (command === 'save-failure') { summary(saveFailure(ROOT, env.GITHUB_WORKSPACE, meta, group), env); return; }
  if (env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/.github/workflows/deploy-production.yml@refs/heads/main`) {
    throw new Error('Only the main production workflow can save or restore releases.');
  }
  if (command === 'save-release') summary(saveRelease(ROOT, env.RUNNER_TEMP, meta), env);
  else if (command === 'restore-release') summary(restoreRelease(ROOT, path.join(env.RUNNER_TEMP, 'china-airlines-artifact'), meta), env);
  else throw new Error('Unknown center artifact command.');
}

module.exports = { ROOT, REPOSITORY, RUNNER, DAY, directory, makeDirectory, digest, initialize, identity, saveFailure, saveRelease, restoreRelease, listEntries, readEntry, removeEntry };
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
