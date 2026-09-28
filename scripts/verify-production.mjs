import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const deployment = JSON.parse(fs.readFileSync(new URL('../deploy/targets.json', import.meta.url), 'utf8'));
const sha = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(sha || '')) throw new Error('Invalid production revision.');
const packageDirectory = path.join(process.env.RUNNER_TEMP, 'china-airlines-artifact');
const archive = path.join(packageDirectory, 'china-airlines.tgz');
const destination = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'china-airlines-public-check-'));
execFileSync('tar', ['-xzf', archive, '-C', destination]);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = [];
function walk(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlink in production package.');
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) walk(path.join(directory, entry.name), `${relative}/`);
    else if (entry.isFile()) files.push(relative);
    else throw new Error('Unsupported production entry.');
  }
}
walk(destination);
if (fs.readFileSync(path.join(destination, 'release.txt'), 'utf8').trim() !== sha) throw new Error('Package release identity mismatch.');
for (const file of files) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), process.env.PLAYWRIGHT_BASE_URL || deployment.publicUrl);
  url.searchParams.set('release', sha);
  const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== hash(fs.readFileSync(path.join(destination, file)))) {
    throw new Error(`Public asset differs from release: ${file}`);
  }
}
console.log(`Public release ${sha}: all ${files.length} files match SHA-256.`);
