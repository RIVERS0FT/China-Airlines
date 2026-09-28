'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const store = require('./center-artifacts.cjs');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'china-airlines-artifacts-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('china-airlines-artifacts-test-'));
    fs.rmSync(base, { recursive: true });
  });
  const root = path.join(base, 'store'), work = path.join(base, 'work');
  fs.mkdirSync(root); fs.mkdirSync(work);
  const meta = { repository: store.REPOSITORY, runId: '100', attempt: 1, sha: 'a'.repeat(40) };
  function put(relative, body) {
    const target = path.join(work, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body);
  }
  function release(body = 'verified package') {
    put('china-airlines.tgz', body);
    put('china-airlines.tgz.sha256', crypto.createHash('sha256').update(body).digest('hex') + '  china-airlines.tgz\n');
  }
  return { base, root, work, meta, put, release };
}

test('evidence survives workspace cleanup and includes only explicit report roots, with all shard groups isolated', t => {
  const f = fixture(t);
  f.put('artifacts/unit.json', '{"passed":1}'); f.put('playwright-report/index.html', 'report');
  f.put('test-results/case/trace.zip', 'trace'); f.put('test-results/.last-run.json', 'hidden');
  f.put('.env', 'secret'); f.put('source.ts', 'source');
  const first = store.saveFailure(f.root, f.work, f.meta, 'ci-root-1');
  const second = store.saveFailure(f.root, f.work, f.meta, 'ci-root-2');
  assert.notEqual(first.directory, second.directory);
  assert.deepEqual(first.meta.files.map(file => file.path), [
    'artifacts/unit.json', 'failure-context.json', 'playwright-report/index.html', 'test-results/case/trace.zip',
  ]);
  fs.unlinkSync(path.join(f.work, 'artifacts/unit.json'));
  assert.equal(store.readEntry(f.root, 'reports', first.name).meta.files.length, 4);
});

test('early failures still produce useful context, and duplicate attempt writes cannot replace prior evidence', t => {
  const f = fixture(t);
  const entry = store.saveFailure(f.root, f.work, f.meta, 'production-1');
  assert.equal(entry.meta.files.length, 1);
  assert.throws(() => store.saveFailure(f.root, f.work, f.meta, 'production-1'), /already exists/);
  assert.equal(store.listEntries(f.root).length, 1);
});

test('release handoff restores identical bytes after producer temp cleanup and reuses shard 1 across reruns', t => {
  const f = fixture(t); f.release();
  const entry = store.saveRelease(f.root, f.work, f.meta);
  fs.unlinkSync(path.join(f.work, 'china-airlines.tgz'));
  const destination = path.join(f.base, 'deploy-temp');
  const restored = store.restoreRelease(f.root, destination, { ...f.meta, attempt: 2 });
  assert.equal(restored.name, entry.name);
  assert.equal(fs.readFileSync(path.join(destination, 'china-airlines.tgz'), 'utf8'), 'verified package');
});

test('release identity, expiry and checksum reject wrong run, revision, future attempt and damaged files', t => {
  const f = fixture(t); f.release();
  const entry = store.saveRelease(f.root, f.work, f.meta);
  for (const meta of [{ ...f.meta, runId: '101' }, { ...f.meta, sha: 'b'.repeat(40) }, { ...f.meta, attempt: 0 }]) {
    assert.throws(() => store.restoreRelease(f.root, path.join(f.base, 'deploy'), meta), /No matching/);
  }
  assert.throws(() => store.restoreRelease(f.root, path.join(f.base, 'deploy'), f.meta,
    Date.parse(entry.meta.createdAt) + store.DAY + 1), /unexpired/);
  fs.writeFileSync(path.join(entry.directory, 'china-airlines.tgz'), 'corrupt');
  assert.throws(() => store.restoreRelease(f.root, path.join(f.base, 'deploy'), f.meta), /contents changed/);
});

test('a successful new shard 1 replaces selection, but a corrupt newest package never falls back silently', t => {
  const f = fixture(t); f.release('old'); store.saveRelease(f.root, f.work, f.meta);
  f.release('new'); const second = store.saveRelease(f.root, f.work, { ...f.meta, attempt: 2 });
  store.restoreRelease(f.root, path.join(f.base, 'deploy'), { ...f.meta, attempt: 3 });
  assert.equal(fs.readFileSync(path.join(f.base, 'deploy/china-airlines.tgz'), 'utf8'), 'new');
  fs.writeFileSync(path.join(second.directory, 'china-airlines.tgz'), 'corrupt');
  assert.throws(() => store.restoreRelease(f.root, path.join(f.base, 'deploy-again'), { ...f.meta, attempt: 3 }), /contents changed/);
});

test('a mismatched checksum aborts atomically and leaves previous evidence untouched', t => {
  const f = fixture(t); const evidence = store.saveFailure(f.root, f.work, f.meta, 'ui-contracts');
  f.release(); f.put('china-airlines.tgz.sha256', 'bad checksum');
  assert.throws(() => store.saveRelease(f.root, f.work, f.meta), /SHA-256 mismatch/);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'releases')), []);
  assert.equal(store.readEntry(f.root, 'reports', evidence.name).name, evidence.name);
});

test('path traversal and secret directories are rejected before publication', t => {
  const f = fixture(t);
  assert.throws(() => store.saveFailure(f.root, f.work, f.meta, '../../elsewhere'), /Invalid evidence/);
  assert.throws(() => store.saveFailure(f.root, f.work, { ...f.meta, runId: '../100' }, 'ci-root-1'), /Invalid artifact/);
  f.put('artifacts/node_modules/secret.txt', 'secret');
  assert.throws(() => store.saveFailure(f.root, f.work, f.meta, 'ci-root-1'), /Unsafe artifact/);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'reports')), []);
});

test('symlinked source, store and restore destination cannot read or overwrite outside data', t => {
  const f = fixture(t); const outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  fs.symlinkSync(outside, path.join(f.work, 'artifacts'), 'junction');
  assert.throws(() => store.saveFailure(f.root, f.work, f.meta, 'ci-root-1'), /Unsafe directory/);
  fs.symlinkSync(outside, path.join(f.base, 'linked-store'), 'junction');
  assert.throws(() => store.initialize(path.join(f.base, 'linked-store')), /Unsafe directory/);
  f.release(); store.saveRelease(f.root, f.work, f.meta);
  fs.symlinkSync(outside, path.join(f.base, 'linked-deploy'), 'junction');
  assert.throws(() => store.restoreRelease(f.root, path.join(f.base, 'linked-deploy'), f.meta), /Unsafe directory/);
  assert.throws(() => store.restoreRelease(f.root, path.join(f.base, 'linked-deploy/new-child'), f.meta), /Unsafe directory/);
  assert.deepEqual(fs.readdirSync(outside), ['keep.txt']);
});

test('unknown directories are preserved and mutated artifacts cannot be pruned', t => {
  const f = fixture(t); const entry = store.saveFailure(f.root, f.work, f.meta, 'ci-root-1');
  fs.mkdirSync(path.join(f.root, 'reports', 'manual-backup'));
  fs.writeFileSync(path.join(entry.directory, 'unexpected'), 'keep');
  assert.throws(() => store.removeEntry(f.root, entry), /contents changed/);
  const warnings = []; assert.deepEqual(store.listEntries(f.root, value => warnings.push(value)), []);
  assert.equal(warnings.length, 2); assert.ok(fs.existsSync(entry.directory));
});
