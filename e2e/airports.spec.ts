import { test, expect, type Page } from '@playwright/test';
let errors: string[];
test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => expect(errors).toEqual([]));
async function ready(page: Page) {
  await page.clock.install({ time: new Date('2026-09-11T00:00:00Z') });
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}
async function detail(page: Page, city: string) {
  await page.getByRole('button', { name: '机场目录', exact: true }).click();
  await page.getByRole('button', { name: `查看${city}机场`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: '机场详情', exact: true })).toBeVisible();
}
async function chooseCityAfterDifferentValue(page: Page, cityId: string, differentId: string) {
  const select = page.getByLabel('选择机场', { exact:true });
  await select.selectOption(differentId);
  const dialog = page.getByRole('dialog', { name:'机场详情', exact:true });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name:'返回航线地图', exact:true }).click();
  await select.selectOption(cityId);
}
for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  test(`empty-airport browsing is read-only and leaves aircraft elsewhere at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await ready(page);
    const credits = await page.getByTestId('credits').textContent();
    await expect(page.getByRole('button', { name: '机场目录', exact: true })).toBeInViewport();
    await detail(page, '上海');
    await expect(page.getByTestId('airport-traffic-summary')).toContainText('140 人');
    await expect(page.getByTestId('airport-parked').getByRole('listitem')).toHaveCount(0);
    await page.screenshot({ path: `artifacts/airport-detail-${width}.png` });
    await page.getByRole('button', { name: '进入候机大厅', exact: true }).click();
    await expect(page.locator('.gate-sign')).toContainText('上海航空港');
    await expect(page.getByTestId('plane-art')).toHaveCount(0);
    await expect(page.getByTestId('waiting-order')).toHaveCount(12);
    for (const card of await page.getByTestId('waiting-order').all()) await expect(card).toBeDisabled();
    await expect(page.getByRole('button', { name: '同目的地装载', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '选择航线起飞', exact: true })).toBeDisabled();
    await expect(page.getByTestId('credits')).toHaveText(credits!);
    await expect(page.getByTestId('flights-count')).toHaveText('0 班');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/empty-airport-${width}.png` });
    await page.getByRole('button', { name: '返回所选飞机 AC0001', exact: true }).click();
    await expect(page.locator('.gate-sign')).toContainText('北京航空港');
    await expect(page.getByTestId('plane-art')).toBeVisible();
    await expect(page.getByTestId('onboard-count')).toHaveText('0');
  });
}
test('airport search, locked information, unlock and upgrade use existing commands', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: '机场目录', exact: true }).click();
  await page.getByLabel('搜索机场', { exact: true }).fill(' pVg ');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('搜索机场', { exact: true }).fill('不存在');
  await expect(page.getByRole('status')).toContainText('没有符合条件');
  await page.getByLabel('搜索机场', { exact: true }).fill('武汉');
  await page.getByRole('button', { name: /^未开放/ }).click();
  await page.getByRole('button', { name: '查看武汉机场', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入候机大厅' })).toHaveCount(0);
  await page.getByRole('button', { name: /^解锁机场/ }).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 148,000');
  await expect(page.getByRole('button', { name: /^解锁机场/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^升级机场/ }).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 88,000');
  await expect(page.locator('.airport-detail-hero')).toContainText('2 级机场');
  await page.getByRole('button', { name: '进入候机大厅', exact: true }).click();
  await expect(page.locator('.gate-sign')).toContainText('武汉航空港');
  await expect(page.getByTestId('plane-art')).toHaveCount(0);
  await page.reload(); await detail(page, '武汉');
  await expect(page.locator('.airport-detail-hero')).toContainText('2 级机场');
});
test('purchase into an empty inspected airport enables only local aircraft loading and departure', async ({ page }) => {
  await ready(page); await detail(page, '上海');
  await page.getByRole('button', { name: '进入候机大厅', exact: true }).click();
  await page.getByRole('button', { name: '飞机商店', exact: true }).click();
  await expect(page.getByLabel('交付机场', { exact: true })).toHaveValue('PVG');
  await page.getByRole('button', { name: '购买云雀 70', exact: true }).click();
  await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  await page.getByRole('button', { name: '关闭飞机商店' }).click();
  await expect(page.locator('.plane-status')).toContainText('AC0002');
  await page.getByRole('button', { name: '同目的地装载', exact: true }).click();
  await expect(page.getByTestId('onboard-count')).not.toHaveText('0');
  await page.getByRole('button', { name: '选择航线起飞', exact: true }).click();
  await chooseCityAfterDifferentValue(page, 'PEK', 'WUH');
  await expect(page.locator('.network-summary')).toContainText('上海 → 北京');
  await page.getByTestId('dispatch').click();
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await page.getByRole('button', { name: '上一架飞机', exact: true }).click();
  await expect(page.locator('.plane-status')).toContainText('AC0001');
  await expect(page.locator('.gate-sign')).toContainText('北京航空港');
  await expect(page.getByTestId('onboard-count')).toHaveText('0');
});
test('incoming and outbound boards track real arrival while pinned to an airport', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: '同目的地装载', exact: true }).click();
  await page.getByRole('button', { name: '选择航线起飞', exact: true }).click();
  await chooseCityAfterDifferentValue(page, 'PVG', 'WUH'); await page.getByTestId('dispatch').click();
  await detail(page, '北京');
  await expect(page.getByTestId('airport-parked').getByRole('listitem')).toHaveCount(0);
  await expect(page.getByTestId('airport-outgoing').getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: '关闭机场详情' }).click();
  await detail(page, '上海');
  await expect(page.getByTestId('airport-incoming').getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: '进入候机大厅' }).click();
  await expect(page.getByTestId('plane-art')).toHaveCount(0);
  await page.clock.fastForward(200000);
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.getByTestId('plane-art')).toBeVisible();
  const resume = page.getByRole('button', { name: '继续经营', exact: true });
  if (await resume.count()) await resume.click();
  await page.getByRole('button', { name: '当前机场详情' }).click();
  await expect(page.getByTestId('airport-incoming').getByRole('listitem')).toHaveCount(0);
  await expect(page.getByTestId('airport-parked').getByRole('listitem')).toHaveCount(1);
});
test('opening airport details from a map preserves a click-order draft', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await chooseCityAfterDifferentValue(page, 'PVG', 'WUH');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'PVG');
  const money = await page.getByTestId('credits').textContent();
  await page.getByRole('button', { name: '查看上海机场详情', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '机场详情' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'PVG');
  await expect(page.getByTestId('credits')).toHaveText(money!);
});
test('route planning from an empty airport uses the selected aircraft real origin', async ({ page }) => {
  await ready(page); await detail(page, '上海');
  await page.getByRole('button', { name: '进入候机大厅', exact: true }).click();
  await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await chooseCityAfterDifferentValue(page, 'PVG', 'WUH');
  await expect(page.locator('.network-summary')).toContainText('北京 → 上海');
  await expect(page.getByTestId('flights-count')).toHaveText('0 班');
});
