import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { collectBuild, createClient, platformOrigin, publicationURL, publishBuild, verifyAssets } from './publish-riversoft.mjs';
import { redact } from '../.github/scripts/github-api.cjs';

const revision = 'a'.repeat(40), token = `rsd_${'b'.repeat(64)}`;
const config = { platformUrl: 'https://riversoft.test', project: { slug: 'china-airlines', title: '中华航空', description: '', kind: 'game', visibility: 'public' } };
const url = 'https://creator.riversoft.test/china-airlines/';
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const hash = data => createHash('sha256').update(data).digest('hex');

function build(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'airlines-platform-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('airlines-platform-'));
    fs.rmSync(directory, { recursive: true });
  });
  for (const [name, content] of Object.entries({ 'index.html': '<title>Airlines</title>', 'sw.js': '//worker', 'manifest.webmanifest': '{"start_url":"./"}', 'release.txt': revision })) fs.writeFileSync(path.join(directory, name), content);
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(path.join(directory, 'assets/game.js'), Buffer.alloc(600_000, 42));
  return directory;
}

async function platform(t, options = {}) {
  const directory = build(t), calls = [], records = [], uploaded = new Map();
  const project = { ...config.project, deploymentId: id, siteType: 'official', publicationMethod: 'upload', published: true, blocked: false, url, contentUrl: url, ...options.project };
  let manifest, active = 0, maxActive = 0;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
    const route = req.url.replace('/api/hosting', '');
    calls.push({ route, method: req.method, body, headers: req.headers });
    const reply = (data, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      if (route === '/me') return reply({ publisherType: options.user ? 'user' : 'official', uploadQuotaExempt: true, site: { subdomain: 'creator', urlPrefix: 'https://creator.riversoft.test/' } });
      if (route === '/deployments') {
        if (options.reserved) return reply({ message: 'This slug is reserved for an official website.' }, 409);
        manifest = body.files;
        // Changing disk after begin must not change the bytes in the snapshot.
        if (options.mutate) fs.writeFileSync(path.join(directory, 'index.html'), 'changed after manifest');
        return reply({ deploymentId: id, chunkBytes: 256 * 1024 });
      }
      if (route.includes('/files/')) {
        active++; maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        if (options.chunkFailure) return reply({ message: 'Chunk refused' }, 503);
        const index = Number(route.split('/').at(-1));
        const old = uploaded.get(index) || Buffer.alloc(0);
        assert.equal(body.offset, old.length);
        const data = Buffer.from(body.data, 'base64');
        assert.ok(data.length <= 256 * 1024);
        uploaded.set(index, Buffer.concat([old, data]));
        return reply({ received: old.length + data.length });
      }
      if (route.endsWith('/commit')) {
        if (options.commitFailure) return reply({ message: 'Commit response unavailable' }, 503);
        for (let index = 0; index < manifest.length; index++) {
          assert.equal(uploaded.get(index).length, manifest[index].size);
          assert.equal(hash(uploaded.get(index)), manifest[index].sha256);
        }
        return reply(project);
      }
      if (req.method === 'DELETE') { assert.equal(active, 0); return reply({ cancelled: true }); }
      if (route === '/projects/china-airlines') return reply(options.stale ? { ...project, deploymentId: 'older-release' } : project);
      if (route.startsWith('/projects?')) return reply({ projects: options.missing ? [] : [project] });
      return reply({ message: 'Unexpected route' }, 500);
    } catch (error) { reply({ message: error.message }, 500); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const request = createClient({ base: config.platformUrl, token, fetcher: (target, init) => {
    assert.equal(new URL(target).origin, config.platformUrl);
    assert.equal(init.redirect, 'error');
    return fetch(`http://127.0.0.1:${server.address().port}${new URL(target).pathname}${new URL(target).search}`, init);
  } });
  return { directory, revision, config, request, calls, records, record: value => records.push(value), maxActive: () => maxActive };
}

test('HTTPS upload commits matching bytes then requires the anonymous homepage catalog', async t => {
  const p = await platform(t, { mutate: true });
  const result = await publishBuild(p);
  assert.equal(result.url, url); assert.equal(result.fileCount, 5);
  assert.ok(p.maxActive() > 1 && p.maxActive() <= 4);
  assert.equal(p.records.at(-1).stage, 'catalog-verified');
  const begin = p.calls.find(c => c.route === '/deployments');
  assert.equal(begin.body.slug, 'china-airlines');
  assert.equal(begin.body.target, undefined, 'platform selects the mount');
  assert.equal(begin.body.files[0].data, undefined);
  assert.ok(begin.headers['idempotency-key']);
  for (const call of p.calls.filter(c => c.route.startsWith('/projects'))) assert.equal(call.headers.authorization, undefined);
});

test('a reserved project or wrong publisher never commits, changes slug, or falls back', async t => {
  for (const option of [{ reserved: true }, { user: true }]) {
    const p = await platform(t, option);
    await assert.rejects(publishBuild(p), /reserved|administrator/);
    assert.ok(!p.calls.some(c => /files|commit/.test(c.route)));
  }
});

test('failed upload and a superseded main cancel only pending data after workers finish', async t => {
  for (const chunkFailure of [true, false]) {
    const p = await platform(t, { chunkFailure });
    await assert.rejects(publishBuild({ ...p, beforeCommit() { throw new Error('Main advanced'); } }), /Chunk refused|Main advanced/);
    assert.ok(p.calls.some(c => c.method === 'DELETE'));
    assert.ok(!p.calls.some(c => c.route.endsWith('/commit')));
    assert.equal(p.records.at(-1).stage, 'uploading-failed');
  }
});

test('uncertain commit, stale catalog and missing listing fail without cancelling a published version', async t => {
  for (const option of [{ commitFailure: true }, { stale: true }, { missing: true }, { project: { url: 'https://untrusted.test/china-airlines/' } }]) {
    const p = await platform(t, option);
    await assert.rejects(publishBuild(p), /Commit outcome|identity|homepage|unsafe/);
    assert.ok(!p.calls.some(c => c.method === 'DELETE'));
  }
});

test('published files are checked by hash at the platform-selected URL', async t => {
  const directory = build(t); let corrupt = false;
  const fetcher = async (target, init) => {
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.redirect, 'error');
    assert.ok(target.href.startsWith(url));
    const name = target.pathname.slice(new URL(url).pathname.length);
    return new Response(corrupt && name === 'sw.js' ? 'wrong' : fs.readFileSync(path.join(directory, name)));
  };
  assert.equal(await verifyAssets({ directory, revision, url, config, fetcher }), 5);
  corrupt = true;
  await assert.rejects(verifyAssets({ directory, revision, url, config, fetcher }), /sw.js/);
});

test('unsafe files, links and mismatched release identities cannot be uploaded', t => {
  const directory = build(t);
  assert.throws(() => collectBuild(directory, 'c'.repeat(40)), /identity mismatch/);
  fs.writeFileSync(path.join(directory, '.env'), 'never-upload');
  assert.throws(() => collectBuild(directory, revision), /Unsafe/);
  fs.unlinkSync(path.join(directory, '.env'));
  fs.writeFileSync(path.join(directory, 'credentials.json'), '{}');
  assert.throws(() => collectBuild(directory, revision), /Unsafe/);
  fs.unlinkSync(path.join(directory, 'credentials.json'));
  fs.symlinkSync(path.join(directory, 'assets'), path.join(directory, 'linked'), 'junction');
  assert.throws(() => collectBuild(directory, revision), /symbolic/);
});

test('public URLs reject external hosts, sandbox paths and injected environment values', () => {
  assert.equal(publicationURL(url, config.platformUrl, config.project.slug), url);
  for (const value of ['http://creator.riversoft.test/china-airlines/', 'https://riversoft.test.evil.test/china-airlines/', 'https://riversoft.test/p/china-airlines', 'https://user:pass@riversoft.test/china-airlines/', `${url}?other=1`]) assert.throws(() => publicationURL(value, config.platformUrl, config.project.slug));
  assert.throws(() => platformOrigin('https://riversoft.test/api'));
  assert.throws(() => createClient({ base: config.platformUrl, token: '' }), /RIVERSOFT_TOKEN/);
});

test('platform errors remain actionable and publishing tokens are removed from failure logs', async () => {
  const request = createClient({ base: config.platformUrl, token, fetcher: async () => Response.json({ message: `Denied ${token}` }, { status: 403 }) });
  await assert.rejects(request('/me'), error => /HTTP 403/.test(error.message) && !error.message.includes(token));
  assert.equal(redact(token), '[REDACTED TOKEN]');
  const oversized = createClient({ base: config.platformUrl, token, fetcher: async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)) });
  await assert.rejects(oversized('/me'), /exceeds/);
});
