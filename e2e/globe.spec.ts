import { displayScale } from './display-helpers.js';
import { test, expect, type Page } from '@playwright/test';
import { AIRPORTS, airport } from '../src/core/catalog.js';
import { GameCore } from '../src/core/game.js';
import { projectGeo, type GlobeCamera } from '../src/ui/globe-geometry.js';
import { selectCity, launchRoute, routeDetails } from './dispatch-helpers.js';
const NOW = Date.parse('2026-09-12T00:00:00Z');
async function ready(page: Page) { await page.clock.install({ time: new Date(NOW) }); await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架'); }
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.exposeFunction('globeErrors', () => errors);
});
test.afterEach(async ({ page }) => expect(await page.evaluate(() => (window as unknown as { globeErrors: () => Promise<string[]> }).globeErrors())).toEqual([]));
for (const [width, height] of [[1440, 900], [844, 390], [667, 375]]) {
  test(`rotatable globe and foreign unlock/flight are usable at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await ready(page);
    await page.getByRole('button', { name: '航线地图', exact: true }).click();
    const host = page.getByTestId('map-canvas'); await expect(host).toHaveAttribute('data-renderer', 'ready');
    await expect(host).toHaveAttribute('data-projection', 'orthographic'); await expect(host).toHaveAttribute('data-camera', /radius/);
    const camera = await host.getAttribute('data-camera'), bounds = (await host.boundingBox())!;
    await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
    await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .4); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .48, { steps: 8 }); await page.mouse.up();
    await expect(host).not.toHaveAttribute('data-camera', camera!); await expect(host).toHaveAttribute('data-preview-path', '');
    await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
    const frames = Number(await host.getAttribute('data-render-count'));
    await host.locator('canvas').focus(); await page.keyboard.press('Home');
    await expect.poll(async () => Number(await host.getAttribute('data-render-count'))).toBeGreaterThan(frames);
    await page.screenshot({ path: `artifacts/globe-asia-${width}.png` });
    await page.getByRole('button', { name: '选择目的城市', exact: true }).click();
    await page.getByLabel('搜索全球机场', { exact: true }).fill(' iCn ');
    await expect(page.getByLabel('选择机场', { exact: true }).locator('option')).toHaveCount(2);
    await page.getByLabel('选择机场', { exact: true }).selectOption('ICN');
    await expect(page.getByRole('dialog', { name: '机场详情', exact: true })).toContainText('首尔');
    await page.getByRole('button', { name: /^解锁机场/ }).click();
    await expect(host).toHaveAttribute('data-preview-path', 'ICN'); await expect(page.getByTestId('credits')).toHaveText('¥ 9,000');
    await expect(page.getByTestId('network-destination')).toHaveText('首尔▾');
    await expect(page.getByTestId('dispatch')).toBeEnabled();
    page.once('dialog', d => void d.accept()); await launchRoute(page);
    await expect(page.locator('.gate-sign')).toContainText('北京 → 首尔');
    await page.reload(); await expect(page.locator('.gate-sign')).toContainText('首尔');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('global directory keeps continent and country searches across inspection', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: '机场目录', exact: true }).click();
  await page.getByRole('button', { name: /^全部 50/ }).click();
  await page.getByLabel('机场世界区域', { exact: true }).selectOption('南美洲'); await page.getByLabel('搜索机场', { exact: true }).fill('巴西');
  await expect(page.getByRole('status')).toContainText('找到 1 座'); await page.getByRole('button', { name: '查看圣保罗机场', exact: true }).click();
  await expect(page.getByTestId('airport-parked').getByRole('listitem')).toHaveCount(0);
  await page.getByRole('button', { name: '返回机场目录', exact: true }).click();
  await expect(page.getByLabel('机场世界区域', { exact: true })).toHaveValue('南美洲'); await expect(page.getByLabel('搜索机场', { exact: true })).toHaveValue('巴西');
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
});
test('far-side markers are not clickable and rotation/cancel never changes the draft', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
  const host = page.getByTestId('map-canvas'); await expect(host).toHaveAttribute('data-camera', /radius/);
  const camera = JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera, bounds = (await host.boundingBox())!;
  const screenScale = await displayScale(page);
  const projected = AIRPORTS.map(a => ({ ...projectGeo(a, camera), id: a.id }));
  const hidden = projected.find(a => !a.visible && a.x > 160 && a.x < bounds.width / screenScale - 150 && a.y > 80 && a.y < bounds.height / screenScale - 130 &&
    projected.filter(b => b.visible).every(b => Math.hypot(b.x - a.x, b.y - a.y) > 30));
  expect(hidden).toBeDefined(); await page.mouse.click(bounds.x + hidden!.x * screenScale, bounds.y + hidden!.y * screenScale);
  await expect(host).toHaveAttribute('data-preview-path', ''); await expect(page.getByRole('dialog')).toHaveCount(0);
  // Cancel an actual pointer stream. The later pointerup must not become a city click.
  const city = projectGeo(airport('PVG'), camera);
  await page.mouse.move(bounds.x + city.x * screenScale, bounds.y + city.y * screenScale); await page.mouse.down();
  await host.locator('canvas').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true }); await page.mouse.up();
  await expect(host).toHaveAttribute('data-preview-path', ''); await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
});
test('two-finger zoom never appends a destination on finger release', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
  const host = page.getByTestId('map-canvas'); await expect(host).toHaveAttribute('data-camera', /radius/);
  const old = JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera, b = (await host.boundingBox())!, x = b.x + old.cx * await displayScale(page), y = b.y + old.cy * await displayScale(page);
  const client = await page.context().newCDPSession(page);
  const touches = (gap: number) => [{ x: x - gap, y, id: 1 }, { x: x + gap, y, id: 2 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(30) });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(65) });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera).scale).toBeGreaterThan(old.scale);
  await expect(host).toHaveAttribute('data-preview-path', ''); await client.detach();
});
test('Pacific multi-leg arcs and global selection preserve camera and read-only previews', async ({ page }) => {
  const s = new GameCore(NOW).snapshot(); s.credits = 5000000; s.career.xp=20000; const c = new GameCore(NOW, s);
  for (const id of ['NRT', 'ANC', 'YVR']) { c.execute({ type: 'unlock', airportId: id }, NOW); c.execute({ type: 'upgrade', airportId: id }, NOW); c.execute({ type: 'upgrade', airportId: id }, NOW); }
  c.execute({ type: 'buy', modelId: 'aurora-m', airportId: 'NRT' }, NOW);
  await ready(page); await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', d => void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'global-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(c.snapshot())) });
  await expect(page.getByTestId('fleet-count')).toHaveText('2 架'); await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.getByRole('button', { name: '航班运行表', exact: true }).click(); await page.getByRole('button', { name: '查看AC0002飞机', exact: true }).click();
  await page.getByRole('button', { name: '航线地图', exact: true }).click(); await selectCity(page, 'ANC'); await selectCity(page, 'YVR');
  const host = page.getByTestId('map-canvas'); await expect(host).toHaveAttribute('data-preview-path', 'ANC,YVR');
  const camera = await host.getAttribute('data-camera'), credits = await page.getByTestId('credits').textContent();
  await routeDetails(page); await expect(page.getByTestId('plan-leg')).toHaveCount(2); await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-camera', camera!); await expect(page.getByTestId('credits')).toHaveText(credits!);
  await page.screenshot({ path: 'artifacts/globe-pacific-route.png' });
});
test('world search and foreign flight remain usable when WebGL fails', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type.includes('webgl') ? null : Reflect.apply(get, this, [type, ...args]);
    } as typeof get;
  });
  await ready(page); await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'fallback');
  await page.getByRole('button', { name: '选择目的城市', exact: true }).click(); await page.getByLabel('搜索全球机场', { exact: true }).fill('不存在');
  await expect(page.getByRole('dialog', { name: '选择城市' }).getByRole('status')).toContainText('没有符合条件');
  await page.getByRole('button', { name: '清除城市筛选', exact: true }).click();
  await page.getByLabel('选择机场', { exact: true }).selectOption('ICN'); await page.getByRole('button', { name: /^解锁机场/ }).click();
  await expect(page.getByTestId('dispatch')).toBeEnabled(); page.once('dialog', d => void d.accept()); await launchRoute(page);
  await expect(page.locator('.gate-sign')).toContainText('北京 → 首尔');
});

test('an idle globe does not redraw for clock-only updates, but camera input paints a new frame', async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) }); await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '航线地图', exact: true }).click();
  const host = page.getByTestId('map-canvas'); await expect(host).toHaveAttribute('data-renderer', 'ready');
  await page.clock.runFor(100);
  const frames = Number(await host.getAttribute('data-render-count')); expect(frames).toBeGreaterThan(0);
  await page.clock.runFor(500);
  await expect(host).toHaveAttribute('data-render-count', String(frames));
  await host.locator('canvas').focus(); await page.keyboard.press('ArrowRight'); await page.clock.runFor(50);
  expect(Number(await host.getAttribute('data-render-count'))).toBeGreaterThan(frames);
  await expect(host).toHaveAttribute('data-preview-path', '');
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
});
