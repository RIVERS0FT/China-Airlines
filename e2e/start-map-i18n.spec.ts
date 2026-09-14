import { test, expect } from '@playwright/test';
import { GameCore } from '../src/core/game.js';

test('title enters the map, keeps Map leftmost, and switches the core flow to English', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: '进入游戏', exact: true })).toBeFocused();
  await expect(page.locator('.start-aircraft')).toHaveCSS('animation-name', 'start-aircraft-cruise');

  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('button', { name: 'Enter Game', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter Game', exact: true }).click();

  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
  const labels = await page.locator('.game-dock>button>span').allTextContents();
  expect(labels.slice(0, 6)).toEqual(['Map', 'Airport', 'Directory', 'Fleet', 'Aircraft Shop', 'Operations']);
  await expect(page.locator('.game-dock>button').first()).toHaveClass(/active/);

  await page.getByRole('button', { name: 'Find City', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search Airports', exact: true }).fill('London');
  await expect(page.getByLabel('Choose City', { exact: true }).locator('option')).toContainText(['Choose a city', 'London · LHR · Europe · Locked']);
  await page.getByRole('button', { name: 'Close Choose City', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Choose City', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Airport', exact: true }).click();
  await expect(page.getByTestId('airport-scene')).toBeVisible();
  await expect(page.locator('.gate-sign')).toContainText('Beijing Airport');
});

test('an in-flight scene animates visually and respects reduced motion', async ({ page }) => {
  const now = Date.now(), core = new GameCore(now);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, now);

  await page.goto('./');
  await page.getByRole('button', { name: '进入游戏', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'flying.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(core.snapshot())) });
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.getByRole('button', { name: '机场装载', exact: true }).click();

  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await expect(page.getByTestId('aircraft-sprite')).toHaveAttribute('href', /aircraft-flight-v1\.png/);
  await expect(page.locator('.is-flying .airplane-display>svg')).toHaveCSS('animation-name', 'flight-aircraft-cruise');
  await expect(page.locator('.is-flying .flight-clouds-near')).toHaveCSS('animation-name', 'flight-cloud-drift');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.is-flying .airplane-display>svg')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.is-flying .flight-clouds-near')).toHaveCSS('animation-name', 'none');
});

for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`title and English map controls fit a ${viewport.width} landscape`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Enter Game', exact: true }).click();
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
    await expect(page.getByRole('button', { name: 'Operations', exact: true })).toBeInViewport();
    expect(await page.locator('.world-map-toolbar').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
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
