import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import configuration from '../deploy/targets.json' with { type: 'json' };
import { redact } from '../.github/scripts/github-api.cjs';

const digest = data => createHash('sha256').update(data).digest('hex');
const extensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.wasm', '.mp3', '.ogg', '.wav', '.mp4', '.webm']);

export function platformOrigin(base) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Platform must be an HTTPS origin.');
  return url.origin;
}

export function publicationURL(value, base, slug) {
  const platform = new URL(platformOrigin(base));
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || !(url.hostname === platform.hostname || url.hostname.endsWith(`.${platform.hostname}`))
    || url.pathname !== `/${slug}/`) throw new Error('Platform returned an unsafe or sandboxed publication URL.');
  return url.href;
}

export function collectBuild(directory, revision) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Invalid production revision.');
  const base = path.resolve(directory);
  for (let cursor = base; ; cursor = path.dirname(cursor)) {
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Build must not contain symbolic links.');
    if (cursor === path.dirname(cursor)) break;
  }
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name;
      if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,79}$/.test(entry.name) || entry.name.includes('..') || relative.length > 180
        || /^(?:node_modules|package(?:-lock)?\.json|credentials(?:\..*)?|secrets?(?:\..*)?|service[-_]account.*|id_rsa|id_ed25519)$/i.test(entry.name)) throw new Error(`Unsafe build entry: ${relative}`);
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Build must not contain symbolic links.');
      if (entry.isDirectory()) walk(full, `${relative}/`);
      else {
        if (!entry.isFile() || !extensions.has(path.extname(entry.name).toLowerCase())) throw new Error(`Not a static build file: ${relative}`);
        const data = fs.readFileSync(full);
        files.push({ path: relative, size: data.length, sha256: digest(data), data });
      }
    }
  }
  walk(base);
  for (const required of ['index.html', 'sw.js', 'manifest.webmanifest', 'release.txt']) {
    if (!files.some(file => file.path === required && file.size > 0)) throw new Error(`Missing build file: ${required}`);
  }
  if (files.find(file => file.path === 'release.txt').data.toString('utf8').trim() !== revision) throw new Error('Package release identity mismatch.');
  return files;
}

async function readJSON(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`Empty platform response (HTTP ${response.status}).`);
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) throw new Error('Platform response exceeds 2 MiB.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error(`Invalid platform JSON (HTTP ${response.status}).`); }
}

export function createClient({ base, token, fetcher = fetch }) {
  const origin = platformOrigin(base);
  if (!/^rsd_[a-f0-9]{64}$/.test(token || '')) throw new Error('A valid production RIVERSOFT_TOKEN is required.');
  return async (route, { method = 'GET', body, key, publicRequest = false } = {}) => {
    if (!/^\/[a-zA-Z0-9/?=&%._-]+$/.test(route) || route.includes('..') || route.startsWith('//')) throw new Error('Invalid hosting API route.');
    const response = await fetcher(`${origin}/api/hosting${route}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache',
        ...(!publicRequest ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = await readJSON(response);
    if (!response.ok) throw new Error(redact(`RIVERSOFT ${method} ${route} HTTP ${response.status}: ${String(result.message || 'Request failed').slice(0, 1000)}`));
    return result;
  };
}

function checkProject(project, config, id) {
  if (project?.slug !== config.project.slug || project.deploymentId !== id || project.siteType !== 'official'
    || project.publicationMethod !== 'upload' || project.visibility !== 'public' || project.published !== true
    || project.blocked !== false || project.kind !== 'game' || project.listed === false) throw new Error('Platform project identity or visibility does not match this upload.');
  const url = publicationURL(project.url, config.platformUrl, config.project.slug);
  if (project.contentUrl !== url) throw new Error('Platform did not return a direct public game URL.');
  return url;
}

export async function verifyCatalog(request, config, publication) {
  const project = await request(`/projects/${config.project.slug}`, { publicRequest: true });
  if (checkProject(project, config, publication.deploymentId) !== publication.url) throw new Error('Catalog URL differs from the publication.');
  const listing = await request(`/projects?search=${encodeURIComponent(config.project.slug)}&page=1`, { publicRequest: true });
  if (!Array.isArray(listing.projects) || !listing.projects.some(item => item.slug === config.project.slug
    && item.deploymentId === publication.deploymentId && item.url === publication.url)) throw new Error('This deployment is missing from the homepage catalog.');
}

export async function publishBuild({ directory, revision, config = configuration, request, beforeCommit = async () => {}, record = () => {} }) {
  // Snapshot once: the manifest hashes and every uploaded byte must agree.
  const files = collectBuild(directory, revision);
  const me = await request('/me');
  if (me.publisherType !== 'official' || me.uploadQuotaExempt !== true) throw new Error('RIVERSOFT_TOKEN must belong to an active administrator publisher.');
  if (!me.site?.subdomain || !me.site.urlPrefix) throw new Error('Configure the publishing account subdomain in riversoft.top before deploying.');
  publicationURL(new URL(`${config.project.slug}/`, me.site.urlPrefix).href, config.platformUrl, config.project.slug);
  const upload = await request('/deployments', { method: 'POST', key: randomUUID(),
    body: { ...config.project, consent: true, files: files.map(({ data, ...file }) => file) } });
  if (!/^[a-f0-9-]{36}$/i.test(upload.deploymentId || '')) throw new Error('Platform returned an invalid upload ID.');
  const id = upload.deploymentId;
  let stage = 'uploading';
  record({ stage, revision, deploymentId: id });
  try {
    const chunkBytes = upload.chunkBytes || 256 * 1024;
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 256 * 1024) throw new Error('Platform returned an invalid chunk size.');
    // Four independent files at most; chunks of each file remain sequential.
    let next = 0, failed;
    const workers = Array.from({ length: Math.min(4, files.length) }, async () => {
      try {
        while (!failed && next < files.length) {
          const index = next++; const file = files[index];
          for (let offset = 0; offset < file.size && !failed; offset += chunkBytes) {
            const bytes = file.data.subarray(offset, offset + chunkBytes);
            const progress = await request(`/deployments/${id}/files/${index}`, { method: 'PUT', body: { offset, data: bytes.toString('base64') } });
            if (progress.received !== offset + bytes.length) throw new Error(`Upload acknowledgement mismatch: ${file.path}`);
          }
        }
      } catch (error) { failed ||= error; }
    });
    await Promise.all(workers);
    if (failed) throw failed;
    await beforeCommit();
    stage = 'committing'; record({ stage, revision, deploymentId: id });
    const project = await request(`/deployments/${id}/commit`, { method: 'POST', body: {} });
    const url = checkProject(project, config, id);
    const publication = { revision, deploymentId: id, url, fileCount: files.length, bytes: files.reduce((n, f) => n + f.size, 0) };
    stage = 'published'; record({ stage, ...publication });
    await verifyCatalog(request, config, publication);
    record({ stage: 'catalog-verified', ...publication });
    return publication;
  } catch (error) {
    let cleanup;
    if (stage === 'uploading') {
      try { await request(`/deployments/${id}`, { method: 'DELETE' }); cleanup = 'pending upload cancelled'; }
      catch (cancelError) { cleanup = redact(cancelError.message); }
    }
    record({ stage: `${stage}-failed`, revision, deploymentId: id, error: redact(error.message), ...(cleanup ? { cleanup } : {}) });
    throw new Error(redact(`${stage}: ${error.message}${stage === 'committing' ? ' Commit outcome may be unknown; inspect platform versions before retrying.' : ''}`));
  }
}

export async function verifyAssets({ directory, revision, url, config = configuration, fetcher = fetch }) {
  const base = publicationURL(url, config.platformUrl, config.project.slug);
  const files = collectBuild(directory, revision);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
    while (next < files.length) {
      const file = files[next++];
      const target = new URL(file.path.split('/').map(encodeURIComponent).join('/'), base);
      target.searchParams.set('release', revision);
      const response = await fetcher(target, { redirect: 'error', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== file.sha256) throw new Error(`Public asset differs from release: ${file.path}`);
    }
  }));
  return files.length;
}

async function main() {
  const revision = process.env.GITHUB_SHA;
  if (process.env.GITHUB_REPOSITORY !== configuration.repository || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.RUNNER_NAME !== configuration.runner) throw new Error('Publication requires the main production workflow on center.');
  const directory = process.env.RELEASE_DIRECTORY;
  if (!directory) throw new Error('RELEASE_DIRECTORY is required.');
  const request = createClient({ base: configuration.platformUrl, token: process.env.RIVERSOFT_TOKEN });
  fs.mkdirSync('artifacts', { recursive: true });
  const result = await publishBuild({ directory, revision, request,
    beforeCommit() {
      const latest = execFileSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], { encoding: 'utf8' }).split(/\s/)[0];
      if (latest !== revision) throw new Error('Main advanced during upload; publication cancelled.');
    },
    record(value) { fs.writeFileSync('artifacts/platform-publication.json', JSON.stringify(value, null, 2) + '\n'); },
  });
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `PUBLIC_URL=${result.url}\nPLAYWRIGHT_BASE_URL=${result.url}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `public_url=${result.url}\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
