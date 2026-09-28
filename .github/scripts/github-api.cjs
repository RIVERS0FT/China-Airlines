'use strict';

const { repository: REPOSITORY } = require('../../deploy/targets.json');
const PREFIX = `/repos/${REPOSITORY}`;

function redact(value) {
  let text = String(value);
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'CHINA_AIRLINES_DEPLOY_KEY']) {
    if (process.env[name]) text = text.split(process.env[name]).join('[REDACTED]');
  }
  return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED KEY]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[REDACTED TOKEN]')
    .replace(/(authorization\s*[:=]\s*)(?:bearer|token|basic)\s+\S+/gi, '$1[REDACTED]')
    .replace(/((?:password|secret|access_token|refresh_token)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

async function api(method, route, body) {
  if (!route.startsWith(`${PREFIX}/`)) throw new Error('GitHub request outside this repository.');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required.');
  const response = await fetch(`https://api.github.com${route}`, {
    method, redirect: 'manual', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  // Job logs use a signed redirect. Never forward the GitHub credential to storage.
  if (response.status === 302 && method === 'GET' && /\/actions\/jobs\/\d+\/logs$/.test(route)) {
    const url = new URL(response.headers.get('location'));
    if (url.protocol !== 'https:') throw new Error('Unsafe log redirect.');
    const log = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!log.ok) throw new Error(`Job log download failed (${log.status}).`);
    return redact(await log.text());
  }
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(redact(`GitHub ${method} ${route}: ${response.status} ${text.slice(0, 700)}`));
    error.status = response.status; throw error;
  }
  if (!text) return null;
  if (/\/logs$/.test(route)) return redact(text);
  return JSON.parse(text);
}

async function pages(request, route, field) {
  const values = [];
  for (let page = 1; page <= 100; page++) {
    const result = await request('GET', `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const items = field ? result[field] : result;
    if (!Array.isArray(items)) throw new Error('Invalid paginated GitHub response.');
    values.push(...items);
    if (items.length < 100) return values;
  }
  throw new Error('GitHub pagination limit exceeded.');
}

module.exports = { api, pages, redact, REPOSITORY, PREFIX };
