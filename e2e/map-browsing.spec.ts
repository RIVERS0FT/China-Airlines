import { test, expect, prepareAirportSession, type Page } from './fixture.js';
import { airport } from '../src/core/catalog.js';
import { projectGeo, type GlobeCamera } from '../src/ui/globe-geometry.js';
import { displayScale } from './display-helpers.js';
import { selectCity } from './dispatch-helpers.js';

async function ready(page: Page) {
  await prepareAirportSession(page);
  await page.clock.install({ time: new Date('2026-09-13T02:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}

for (const [width, height, zoom] of [[1440, 900, 100], [844, 390, 150], [667, 375, 100]] as const) {
  test(`city browsing and unlock stay separate from flight planning at ${width} and ${zoom}%`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width, height }, hasTouch: true });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await ready(page);
      if (zoom !== 100) {
        await page.getByRole('button', { name: '存档设置', exact: true }).click();
        await page.getByRole('button', { name: `${zoom}%`, exact: true }).click();
        await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
      }
      const order = page.getByTestId('waiting-order').first(), id = await order.getAttribute('data-order-id');
      await order.click();
      await expect(page.getByTestId('loaded-order')).toHaveCount(1);
      await page.getByRole('button', { name: '地图', exact: true }).click();
      await expect(page.getByRole('region', { name: '地图浏览', exact: true })).toBeVisible();
      await expect(page.getByTestId('map-unlocked-count')).toContainText('已解锁 2 / 50 城市');
      for (const id of ['network-summary', 'route-preview', 'dispatch']) await expect(page.getByTestId(id)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^(查看路线|路线后退|路线撤销|取消起飞)$/ })).toHaveCount(0);
      const map = page.getByTestId('map-canvas');
      await expect(map).toHaveAttribute('data-camera', /radius/);
      await expect(map).toHaveAttribute('data-range-origin', '');
      await expect(map).toHaveAttribute('data-passenger-destinations', '');
      const camera = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera;
      const city = projectGeo(airport('PVG'), camera), box = (await map.boundingBox())!, scale = await displayScale(page);
      await page.touchscreen.tap(box.x + city.x * scale, box.y + city.y * scale);
      const detail = page.getByRole('dialog', { name: '机场详情', exact: true });
      await expect(detail).toContainText('上海航空港');
      await page.clock.runFor(50);
      const selectedCamera = await map.getAttribute('data-camera');
      await detail.getByRole('button', { name: '返回地图', exact: true }).click();
      await expect(map).toHaveAttribute('data-camera', selectedCamera!);
      await expect(map).toHaveAttribute('data-preview-path', '');
      await selectCity(page, 'WUH');
      await detail.getByRole('button', { name: /^解锁机场/ }).click();
      await expect(detail).toContainText('1 级机场');
      await expect(page.getByTestId('map-unlocked-count')).toContainText('已解锁 3 / 50 城市');
      await detail.getByRole('button', { name: '返回地图', exact: true }).click();
      await expect(map).toHaveAttribute('data-preview-path', '');
      await expect(page.getByTestId('credits')).toHaveText('¥ 10,000');
      await page.screenshot({ path: `artifacts/map-browsing-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: '机场装载', exact: true }).click();
      await expect(page.locator('.plane-status')).toContainText('AC0001');
      await expect(page.locator(`[data-order-id="${id}"]`)).toHaveAttribute('data-load-state', 'loaded');
      await page.getByRole('button', { name: '制定路线', exact: true }).click();
      await expect(page.getByRole('region', { name: '起飞规划', exact: true })).toBeVisible();
      await selectCity(page, 'WUH');
      await expect(map).toHaveAttribute('data-preview-path', 'WUH');
      await expect(page.getByTestId('dispatch')).toBeEnabled();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button', { name: '取消起飞', exact: true }).click();
      await page.reload();
      await expect(page.getByTestId('credits')).toHaveText('¥ 10,000');
      await expect(page.locator(`[data-order-id="${id}"]`)).toHaveAttribute('data-load-state', 'loaded');
      await expect(page.getByTestId('flights-count')).toHaveText('0 班');
      await page.getByRole('button', { name: '制定路线', exact: true }).click();
      await expect(map).toHaveAttribute('data-preview-path', '');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test('map search and unlock work without WebGL, cancellation and insufficient funds change nothing', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type.includes('webgl') ? null : Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await ready(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('status')).toContainText('查找城市');
  await selectCity(page, 'WUH');
  await page.getByRole('button', { name: '返回地图', exact: true }).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
  await selectCity(page, 'WUH');
  await page.getByRole('button', { name: /^解锁机场/ }).click();
  await expect(page.getByRole('dialog', { name: '机场详情' })).toContainText('1 级机场');
  await page.getByRole('button', { name: '返回地图', exact: true }).click();
  await page.getByRole('button', { name: '查找城市', exact: true }).click();
  await page.getByLabel('搜索全球机场', { exact: true }).fill('不存在');
  await expect(page.getByRole('dialog', { name: '选择城市' }).getByRole('status')).toContainText('没有符合条件');
  await page.getByRole('button', { name: '清除城市筛选', exact: true }).click();
  await page.getByLabel('城市世界区域').selectOption('欧洲');
  await page.getByLabel('搜索全球机场', { exact: true }).fill('LHR');
  await expect(page.getByLabel('选择机场', { exact: true }).locator('option')).toHaveCount(2);
  await page.getByLabel('选择机场', { exact: true }).selectOption('LHR');
  await expect(page.getByRole('button', { name: /^解锁机场/ })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: '机场详情' })).toContainText('运营资金不足');
  await expect(page.getByTestId('credits')).toHaveText('¥ 10,000');
  await expect(page.getByTestId('map-unlocked-count')).toContainText('已解锁 3 / 50 城市');
  await expect(page.getByTestId('dispatch')).toHaveCount(0);
});
