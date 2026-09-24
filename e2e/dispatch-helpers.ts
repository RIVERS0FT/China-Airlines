import { expect, type Page } from '@playwright/test';
import { airport } from '../src/core/catalog.js';
import { projectGeo, wrapLongitude, type GlobeCamera } from '../src/ui/globe-geometry.js';
import { displayScale } from './display-helpers.js';

/** Exercise visible entry points and never force-click a hidden control. */
export async function closeRouteDetails(page: Page) {
  const dialog = page.getByRole('dialog', { name: '路线详情', exact: true });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: '关闭路线详情', exact: true }).click();
}
export async function openCities(page: Page) {
  await closeRouteDetails(page);
  if (!await page.getByRole('dialog', { name: '选择城市', exact: true }).isVisible())
    await page.getByRole('button', { name: /^(选择目的城市|选择城市)$/, exact: true }).click();
}
export async function selectCity(page: Page, id: string) {
  if (await page.locator('.world-map-view').isVisible()) {
    const map = page.getByTestId('map-canvas');
    if (await map.getAttribute('data-renderer') === 'ready') {
      await expect(map).toHaveAttribute('data-camera', /radius/);
      const target = airport(id), scale = await displayScale(page);
      for (let attempt = 0; attempt < 5; attempt++) {
        const camera = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera;
        const point = projectGeo(target, camera), box = (await map.boundingBox())!;
        if (point.visible) {
          await page.mouse.click(box.x + point.x * scale, box.y + point.y * scale);
          return;
        }
        const lon = Math.max(-60, Math.min(60, wrapLongitude(target.lon - camera.lon)));
        const lat = Math.max(-40, Math.min(40, target.lat - camera.lat));
        const x = box.x + camera.cx * scale, y = box.y + camera.cy * scale;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - lon * camera.radius * camera.scale / 70 * scale,
          y + lat * camera.radius * camera.scale / 70 * scale, { steps: 10 });
        await page.mouse.up();
      }
      throw new Error(`Could not rotate ${id} onto the visible globe`);
    }
  }
  await openCities(page);
  await page.getByLabel('选择机场', { exact: true }).selectOption(id);
  await expect(page.getByRole('dialog', { name: '选择城市', exact: true })).toHaveCount(0);
}
export async function inspectCity(page: Page, name: string) {
  await openCities(page);
  await page.getByRole('button', { name, exact: true }).click();
}
export async function routeDetails(page: Page) {
  const dialog = page.getByRole('dialog', { name: '路线详情', exact: true });
  if (!await dialog.isVisible()) await page.getByRole('button', { name: '查看路线', exact: true }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function detailValue(page: Page, id: string) {
  await routeDetails(page);
  return page.getByTestId(id);
}
export async function launchRoute(page: Page) {
  await closeRouteDetails(page);
  await page.getByTestId('dispatch').click();
  // A click starts an async save; navigation follows only its successful result.
  await expect(page.locator('.route-dispatch-view')).toHaveCount(0);
  await expect(page.locator('.game-hud')).toBeVisible();
}
export async function leaveMap(page: Page) {
  await closeRouteDetails(page);
  if (await page.locator('.route-dispatch-view').isVisible()) {
    const back = await page.locator('.world-map-view').isVisible()
      ? page.getByRole('button', { name: '机场装载', exact: true })
      : page.getByRole('button', { name: /^(取消起飞|返回航班)$/, exact: true });
    await back.click();
    // Returning can wait on the same persisted UI transition as dispatch. Always
    // settle the scene before callers assert on airport-only controls.
    await expect(page.locator('.route-dispatch-view')).toHaveCount(0);
    await expect(page.locator('.game-hud')).toBeVisible();
  }
}
export async function openGlobal(page: Page, name: string) {
  await leaveMap(page);
  await page.getByRole('button', { name, exact: true }).click();
}
