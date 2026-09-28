'use strict';
const fs = require('node:fs');
const path = require('node:path');
const store = require('./center-artifacts.cjs');

function target(root, name) {
  if (!/^(verification|result)-[1-9][0-9]*-[1-9][0-9]*\.json$/.test(name)) throw new Error('Invalid delivery record name.');
  const parent = path.join(store.directory(root), 'delivery');
  store.makeDirectory(parent);
  return path.join(parent, name);
}

function write(root, name, value) {
  const file = target(root, name);
  const json = JSON.stringify(value, null, 2) + '\n';
  if (fs.existsSync(file)) {
    store.digest(file);
    if (fs.readFileSync(file, 'utf8') === json) return file;
    throw new Error('Delivery record already exists; refusing to overwrite it.');
  }
  const stage = path.join(path.dirname(file), `.pending-${require('node:crypto').randomUUID()}`);
  try {
    fs.writeFileSync(stage, json, { flag: 'wx', mode: 0o600 });
    // link provides no-replace publication, including concurrent controllers.
    fs.linkSync(stage, file);
  } finally { if (fs.existsSync(stage)) fs.unlinkSync(stage); }
  return file;
}

function read(root, name) {
  const file = target(root, name);
  const info = store.digest(file);
  if (info.size > 256 * 1024) throw new Error('Delivery record is too large.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function prune({ request, root = store.ROOT, now = Date.now(), log = console.log }) {
  const { PREFIX } = require('./github-api.cjs');
  const parent = path.dirname(target(root, 'result-1-1.json'));
  for (const name of fs.readdirSync(parent)) {
    const match = /^(verification|result)-([1-9][0-9]*)-([1-9][0-9]*)\.json$/.exec(name);
    if (!match) continue;
    const file = target(root, name);
    let record;
    try { record = read(root, name); } catch { continue; }
    if (record.repository !== store.REPOSITORY || String(record.runId) !== match[2] || String(record.attempt) !== match[3]) continue;
    const age = now - fs.lstatSync(file).mtimeMs;
    if (age < (match[1] === 'verification' ? 2 : 90) * store.DAY) continue;
    let run;
    try { run = await request('GET', `${PREFIX}/actions/runs/${match[2]}`); }
    catch (error) { if (error.status === 404) continue; throw error; }
    if (run.status !== 'completed' || run.run_attempt < Number(match[3])) continue;
    if (JSON.stringify(read(root, name)) !== JSON.stringify(record)) continue;
    fs.unlinkSync(file);
    log(`Removed expired delivery record: ${name}`);
  }
}

module.exports = { write, read, target, prune };
