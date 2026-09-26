import { test, expect } from '@playwright/test';
import { GameCore } from '../helpers/configured-game.js';
import { airport } from '../../src/core/catalog.js';
import { projectGeo, type GlobeCamera } from '../../src/ui/globe-geometry.js';
import { displayScale } from '../helpers/display-helpers.js';

test('title enters the directory then opens the map, keeps Map leftmost, and switches the core flow to English', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: '进入游戏', exact: true })).toBeFocused();
  await expect(page.locator('.start-aircraft')).toHaveCSS('animation-name', 'start-aircraft-cruise');

  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('button', { name: 'Enter Game', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter Game', exact: true }).click();
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step', 'unlock');
  await page.getByRole('button', { name: 'Skip Tutorial', exact: true }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();

  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
  const labels = await page.locator('.game-dock>button>span').allTextContents();
  expect(labels.slice(0, 7)).toEqual(['Map', 'Airport', 'Directory', 'Fleet', 'Aircraft Shop', 'Organization', 'Operations']);
  await expect(page.locator('.game-dock>button').first()).toHaveClass(/active/);

  await expect(page.getByRole('button', { name: 'Find City', exact: true })).toHaveCount(0);
  const map = page.getByTestId('map-canvas');
  const camera = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera;
  const point = projectGeo(airport('PVG'), camera), box = (await map.boundingBox())!, scale = await displayScale(page);
  expect(point.visible).toBe(true);
  await page.mouse.click(box.x + point.x * scale, box.y + point.y * scale);
  await expect(page.getByRole('dialog', { name: 'Airport Details', exact: true })).toContainText('Shanghai Airport');
  await page.getByRole('button', { name: 'Back to Map', exact: true }).click();
  await page.getByRole('button', { name: 'Airport', exact: true }).click();
  await expect(page.getByTestId('airport-scene')).toBeVisible();
  await expect(page.locator('.gate-sign')).toContainText('Beijing Airport');
});

test('an in-flight scene keeps its default animation in reduced-motion previews', async ({ page }) => {
  const now = Date.now(), core = new GameCore(now);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, now);

  await page.goto('./');
  await page.getByRole('button', { name: '进入游戏', exact: true }).click();
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'flying.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(core.snapshot())) });
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.getByRole('button', { name: '机场装载', exact: true }).click();

  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await expect(page.getByTestId('aircraft-sprite')).toHaveAttribute('href', /aircraft-heron-p-exterior-v8\.png/);
  await expect(page.locator('.is-flying .airplane-display>svg')).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expect(page.locator('.is-flying .flight-clouds-near')).toHaveCSS('animation-name', 'flight-cloud-drift');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.is-flying .airplane-display>svg')).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expect(page.locator('.is-flying .flight-clouds-near')).toHaveCSS('animation-name', 'flight-cloud-drift');
});

for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`title and English map controls fit a ${viewport.width} landscape`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Enter Game', exact: true }).click();
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step', 'unlock');
  await page.getByRole('button', { name: 'Skip Tutorial', exact: true }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
    await expect(page.getByRole('button', { name: 'Operations', exact: true })).toBeInViewport();
    await expect(page.locator('.world-map-toolbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Find City', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/start-map-en-${viewport.width}.png` });
  });
}

test('portrait keeps the rotate prompt above the title scene', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.locator('.rotate-screen')).toBeVisible();
  await expect(page.locator('.rotate-screen')).toContainText('请旋转设备');
});
