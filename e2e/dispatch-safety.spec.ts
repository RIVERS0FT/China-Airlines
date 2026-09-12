import { test, expect } from '@playwright/test';
import { GameCore } from '../src/core/game.js';
import { selectCity } from './dispatch-helpers.js';

const NOW = Date.parse('2026-09-12T00:00:00Z');

test('hidden fleet markers do not hide the selected aircraft or mutate flight accounts', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const core = new GameCore(NOW);
  core.execute({ type: 'buy', modelId: 'lark-f', airportId: 'PEK' }, NOW);
  core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  core.execute({ type: 'load-destination', planeId: 'AC0002', to: 'PVG' }, NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0002', to: 'PVG', auto: false }, NOW);
  const saved = core.snapshot(), credits = `¥ ${saved.credits.toLocaleString('zh-CN')}`;
  await page.clock.install({ time: new Date(NOW) }); await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', d => void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'two-planes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.getByRole('button', { name: '航线地图', exact: true }).click();
  const canvas = page.getByTestId('map-canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready');
  await page.clock.runFor(50); // Permit a real render frame under the paused test clock.
  await expect(canvas).toHaveAttribute('data-visible-planes', 'AC0001,AC0002');
  await expect(page.getByRole('button', { name: '返回航班', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消起飞', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '隐藏其他飞机', exact: true }).click();
  await page.clock.runFor(50);
  await expect(canvas).toHaveAttribute('data-visible-planes', 'AC0001');
  await page.getByRole('button', { name: '显示其他飞机', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-renderer', 'ready');
  await page.clock.runFor(50); // Permit a real render frame under the paused test clock.
  await expect(canvas).toHaveAttribute('data-visible-planes', 'AC0001,AC0002');
  await expect(canvas).toHaveAttribute('data-preview-path', '');
  await expect(page.getByTestId('network-cost')).toHaveText(`¥ ${saved.fleet[0]!.flight!.cost.toLocaleString('zh-CN')}`);
  await expect(page.getByTestId('credits')).toHaveText(credits);
  await page.getByRole('button', { name: '返回航班', exact: true }).click();
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await expect(page.getByTestId('flights-count')).toHaveText('0 班');
  expect(errors).toEqual([]);
});

test('a real autosave write failure remains visible with a recovery entry on the minimal map', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(NOW) }); await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '航线地图', exact: true }).click(); await selectCity(page, 'PVG');
  const canvas = page.getByTestId('map-canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'ready');
  await page.clock.runFor(50); // Canvas attributes are produced by the real Pixi ticker.
  await expect(canvas).toHaveAttribute('data-preview-path', 'PVG');
  // Fault injection at the storage boundary, not injection of expected UI state.
  // There are no economic commands in this test; the automatic save must report it.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'saves') throw new DOMException('dispatch-save-test', 'QuotaExceededError');
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await page.clock.fastForward(11000);
  await expect(page.locator('.error-toast')).toContainText('dispatch-save-test');
  await page.locator('.error-toast').getByRole('button', { name: '存档设置', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('dispatch-save-test');
  await expect(page.getByRole('button', { name: '导出存档', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-preview-path', 'PVG');
  await expect(page.getByTestId('credits')).toHaveText('¥ 180,000');
  await page.reload(); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await expect(page.getByTestId('credits')).toHaveText('¥ 180,000');
  expect(errors).toEqual([]);
});

test('touching a city on the canvas selects it once and preserves automatic mode on a repeated tap', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 844, height: 390 }, hasTouch: true });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
    await page.getByRole('button', { name: '制定路线', exact: true }).click();
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toHaveAttribute('data-renderer', 'ready');
    await expect(canvas).toHaveAttribute('data-camera', /scale/);
    const tapShanghai = async () => {
      const camera = JSON.parse((await canvas.getAttribute('data-camera'))!) as import('../src/ui/globe-geometry.js').GlobeCamera;
      const bounds = (await canvas.boundingBox())!;
      // Project real latitude/longitude through the current sphere, then send a real touch.
      const { airport } = await import('../src/core/catalog.js');
      const { projectGeo } = await import('../src/ui/globe-geometry.js');
      const city = projectGeo(airport('PVG'), camera);
      expect(city.visible).toBe(true);
      await page.touchscreen.tap(bounds.x + city.x, bounds.y + city.y);
    };
    await tapShanghai(); await expect(canvas).toHaveAttribute('data-preview-path', 'PVG');
    await page.getByRole('button', { name: '查看路线', exact: true }).click();
    await page.getByRole('checkbox', { name: /自动往返/ }).check();
    await page.getByRole('button', { name: '关闭路线详情', exact: true }).click();
    await tapShanghai();
    await expect(canvas).toHaveAttribute('data-preview-path', 'PVG');
    await expect(page.getByTestId('auto-route-badge')).toHaveText('自动往返');
    await expect(page.getByTestId('credits')).toHaveText('¥ 180,000');
    await page.getByTestId('dispatch').click();
    await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
    await expect(page.getByRole('button', { name: '停止自动往返', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
