import { displayScale } from './display-helpers.js';
import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`airport keeps scene-first railway-inspired hierarchy at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');

    const hud = page.locator('.game-hud');
    const scene = page.getByTestId('airport-scene');
    const title = page.locator('.airport-titlebar');
    const orders = page.locator('.apron-queue');
    const dock = page.locator('.game-dock');
    const depart = page.getByRole('button', { name: '制定路线', exact: true });

    await expect(hud).toBeVisible();
    await expect(scene).toBeVisible();
    await expect(title).toBeVisible();
    await expect(orders).toBeVisible();
    await expect(dock).toBeVisible();
    await expect(page.getByTestId('waiting-order').first()).toBeVisible();
    await expect(page.getByTestId('credits')).toBeVisible();
    await expect(page.getByTestId('flights-count')).toBeVisible();

    const sceneBox = (await scene.boundingBox())!;
    const titleBox = (await title.boundingBox())!;
    const orderBox = (await orders.boundingBox())!;
    const dockBox = (await dock.boundingBox())!;
    const departBox = (await depart.boundingBox())!;

    // Airport and aircraft information is now an overlay, not a row that steals scene height.
    expect(titleBox.y).toBeGreaterThanOrEqual(sceneBox.y - 1);
    expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(sceneBox.y + sceneBox.height + 1);
    expect(sceneBox.y + sceneBox.height).toBeLessThanOrEqual(orderBox.y + 1);

    // User-selected placement: the departure action is anchored to the bottom right.
    expect(departBox.width).toBeGreaterThanOrEqual(44 * await displayScale(page) - .02);
    expect(departBox.height).toBeGreaterThanOrEqual(44 * await displayScale(page) - .02);
    expect(departBox.y).toBeGreaterThanOrEqual(dockBox.y);
    expect(departBox.y).toBeGreaterThanOrEqual(orderBox.y + orderBox.height);
    const nextBox = (await page.getByRole('button', { name: '下一组客货', exact: true }).boundingBox())!;
    expect(viewport.width - nextBox.x - nextBox.width).toBeLessThanOrEqual(16);
    expect(departBox.y + departBox.height).toBeLessThanOrEqual(dockBox.y + dockBox.height);
    expect(viewport.height - departBox.y - departBox.height).toBeLessThanOrEqual(16);
    expect(departBox.x + departBox.width).toBeLessThanOrEqual(viewport.width + 1);

    for (const name of ['机场装载', '地图', '机场目录', '机队管理', '飞机商店']) {
      const button = page.getByRole('button', { name, exact: true });
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44 * await displayScale(page) - .02);
      expect(box.height).toBeGreaterThanOrEqual(44 * await displayScale(page) - .02);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `artifacts/railway-inspired-airport-${viewport.width}.png`, fullPage: true });
  });
}
