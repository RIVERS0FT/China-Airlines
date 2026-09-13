import { expect, test } from '@playwright/test';

async function ready(page: import('@playwright/test').Page) {
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await expect(page.getByTestId('airport-scene')).toBeVisible();
}

async function expectMobileHeightBudget(page: import('@playwright/test').Page, viewportHeight: number) {
  const hud = await page.locator('.game-hud').boundingBox();
  const scene = await page.locator('.scene-wrap').boundingBox();
  const queue = await page.locator('.apron-queue').boundingBox();
  const dock = await page.locator('.game-dock').boundingBox();
  expect(hud).not.toBeNull();
  expect(scene).not.toBeNull();
  expect(queue).not.toBeNull();
  expect(dock).not.toBeNull();

  expect(scene!.height / viewportHeight).toBeGreaterThanOrEqual(0.44);
  expect(queue!.height / viewportHeight).toBeLessThanOrEqual(0.30);
  expect(dock!.height / viewportHeight).toBeLessThanOrEqual(0.15);

  const previous = await page.getByRole('button', { name: '上一组客货', exact: true }).boundingBox();
  const next = await page.getByRole('button', { name: '下一组客货', exact: true }).boundingBox();
  const loading = await page.getByRole('button', { name: '机场装载', exact: true }).boundingBox();
  const launch = await page.getByRole('button', { name: '制定路线', exact: true }).boundingBox();
  expect(previous).not.toBeNull();
  expect(next).not.toBeNull();
  expect(loading).not.toBeNull();
  expect(launch).not.toBeNull();
  expect(previous!.height).toBeGreaterThanOrEqual(44);
  expect(next!.height).toBeGreaterThanOrEqual(44);
  expect(loading!.height).toBeGreaterThanOrEqual(44);
  expect(launch!.height).toBeGreaterThanOrEqual(44);
  expect(next!.y + next!.height).toBeLessThanOrEqual(dock!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('desktop airport uses the polished game hierarchy without changing real data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);

  await expect(page.locator('.game-hud')).toBeVisible();
  await expect(page.locator('.gate-sign')).toContainText('北京航空港');
  await expect(page.getByTestId('waiting-order')).toHaveCount(12);
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 3 人');

  const launch = page.getByRole('button', { name: '制定路线', exact: true });
  await expect(launch).toBeVisible();
  const box = await launch.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(120);
  expect(box!.height).toBeGreaterThan(60);

  const background = await launch.evaluate(element => getComputedStyle(element).backgroundImage);
  expect(background).toContain('linear-gradient');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/airport-mobile-game-polish-1440.png', fullPage: true });
});

test('844x390 landscape gives the aircraft scene the primary height share', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await ready(page);

  const launch = page.getByRole('button', { name: '制定路线', exact: true });
  await expect(launch).toBeInViewport();
  const box = await launch.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(140);

  await expectMobileHeightBudget(page, 390);
  await page.screenshot({ path: 'artifacts/airport-mobile-game-polish-844.png', fullPage: true });
});

test('667x375 landscape keeps the same mobile height budget and touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await ready(page);

  await expectMobileHeightBudget(page, 375);
  await page.screenshot({ path: 'artifacts/airport-mobile-height-667.png', fullPage: true });
});
