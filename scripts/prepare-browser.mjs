import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Use the lockfile-matched full Chromium in new headless mode. CI and local
// tests use channel: 'chromium', so a second headless-shell download is unused.
// OS libraries and CJK fonts are provisioned once on the self-hosted runner;
// fail explicitly when missing rather than requesting sudo or skipping tests.
execFileSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'install', '--no-shell', 'chromium'], {
  stdio: 'inherit', timeout: 30 * 60_000,
});
if (process.platform === 'linux') {
  let families;
  try { families = execFileSync('fc-list', [':lang=zh', 'family'], { encoding: 'utf8', timeout: 10_000 }).trim(); }
  catch { throw new Error('Runner is missing fontconfig. Provision browser OS dependencies and CJK fonts before running verification.'); }
  if (!families) throw new Error('Runner has no Chinese font. Provision fonts-noto-cjk before running verification.');
  console.log('Chinese fonts available:', [...new Set(families.split('\n'))].join('; '));
}
const browser = await chromium.launch({ channel: 'chromium', timeout: 30_000 });
try {
  const page = await browser.newPage();
  await page.setContent('<html lang="zh-CN"><body>中华航空 · 公司组织</body></html>');
  if (await page.locator('body').innerText() !== '中华航空 · 公司组织') throw new Error('Browser smoke check failed.');
  console.log('Locked Chromium and system dependencies verified:', browser.version());
} finally { await browser.close(); }
