import { test, expect } from './fixture.js';
import { readFileSync } from 'node:fs';
const artManifest = JSON.parse(readFileSync(new URL('../art/manifest.json', import.meta.url), 'utf8')) as { file: string }[];

test('local art decodes and remains available after offline reload', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.getByTestId('airport-scene')).toBeVisible();
  const backdrop = page.locator('.airport-backdrop image');
  expect(await page.locator('.apron-queue').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('apron-platform-v1.jpg');
  await expect(backdrop).toHaveCount(1);
  const urls = await page.locator('.job-art').evaluateAll(elements => elements.map(el => (el as HTMLImageElement).src));
  urls.push((await backdrop.getAttribute('href'))!);
  // Include every variant, even if the initial queue does not happen to show it.
  const base = new URL((await backdrop.getAttribute('href'))!, page.url());
  for (const { file } of artManifest) {
    urls.push(new URL(file, base).href);
  }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('waiting-order')).toHaveCount(12);
  const decoded = await page.evaluate(async sources => Promise.all([...new Set(sources)].map(async src => {
    const image = new Image(); image.src = src; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  })), urls);
  expect(decoded.every(image => image.width >= 256 && image.height >= 256)).toBe(true);
  await page.getByTestId('waiting-order').first().click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  expect(await page.locator('.toast').allTextContents()).toEqual([]);
  await expect(page.getByTestId('aircraft-sprite')).toHaveAttribute('href', /aircraft-light-passenger-v2\.png$/);
  // Task art stays at the upper-left entrance; organization has its own painted dock entry.
  await expect(page.getByRole('button', { name: '任务中心', exact: true }).locator('img.painted-icon')).toHaveCount(1);
  const dock = page.getByRole('navigation', { name: '主导航' });
  await expect(dock.locator('img.painted-icon')).toHaveCount(8);
  await expect(dock.getByRole('button', { name: '公司组织', exact: true }).locator('img.painted-icon')).toHaveCount(1);
  await expect(dock.getByRole('button', { name: '经营中心', exact: true }).locator('img.painted-icon')).toHaveCount(1);
});
