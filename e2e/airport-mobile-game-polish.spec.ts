import { expect, test } from '@playwright/test';

async function ready(page: import('@playwright/test').Page) {
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await expect(page.getByTestId('airport-scene')).toBeVisible();
}

test('desktop airport uses the polished game hierarchy without changing real data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);

  await expect(page.locator('.game-hud')).toBeVisible();
  await expect(page.locator('.gate-sign')).toContainText('北京航空港');
  await expect(page.getByTestId('waiting-order')).toHaveCount(12);
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 6 人');

  const launch = page.getByRole('button', { name: '选择航线起飞', exact: true });
  await expect(launch).toBeVisible();
  const box = await launch.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(60);

  const background = await launch.evaluate(element => getComputedStyle(element).backgroundImage);
  expect(background).toContain('linear-gradient');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/airport-mobile-game-polish-1440.png', fullPage: true });
});

test('compact landscape keeps queue controls clear of the launch action', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await ready(page);

  const launch = page.getByRole('button', { name: '选择航线起飞', exact: true });
  await expect(launch).toBeInViewport();
  const box = await launch.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThan(100);

  const next = page.getByRole('button', { name: '下一组客货', exact: true });
  await expect(next).toBeVisible();
  const launchBox = box!, nextBox = (await next.boundingBox())!;
  expect(nextBox.x + nextBox.width).toBeLessThanOrEqual(launchBox.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/airport-mobile-game-polish-844.png', fullPage: true });
});
