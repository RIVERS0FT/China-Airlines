import { selectCity, detailValue, launchRoute } from './dispatch-helpers.js';
import { test, expect, type Page } from './fixture.js';
let errors: string[];
test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => expect(errors).toEqual([]));
async function ready(page: Page) {
  await page.clock.install({ time: new Date('2026-09-11T00:00:00Z') });
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}
async function chooseShanghai(page: Page) {

  await selectCity(page, 'PEK');
  await selectCity(page, 'PVG');
  await expect(await detailValue(page, 'plan-summary')).toContainText('1 段');
}
for (const [width, height] of [[1440,900],[844,390],[667,375]]) {
  test(`loading queue scroll, keyboard and filter bounds at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await ready(page);
    const queue = page.getByRole('region', { name:'客货列表', exact:true });
    expect(await queue.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none');
    const prev = page.getByRole('button', { name:'上一组客货', exact:true });
    const next = page.getByRole('button', { name:'下一组客货', exact:true });
    await expect(prev).toBeDisabled(); await expect(next).toBeEnabled();
    await next.click(); await expect.poll(() => queue.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await queue.focus(); await page.keyboard.press('Home'); await expect(prev).toBeDisabled();
    await page.keyboard.press('End'); await expect(next).toBeDisabled();
    await page.keyboard.press('Home'); await expect(prev).toBeDisabled();
    await expect(page.locator('.order-toolbar')).toHaveCount(0);
    const first = page.getByTestId('waiting-order').first();
    const id = await first.getAttribute('data-order-id');
    const position = await first.boundingBox();
    await first.click();
    const loaded = page.locator(`[data-order-id="${id}"]`);
    await expect(loaded.locator('.job-state')).toHaveText('已装机 · 卸载');
    expect((await loaded.boundingBox())!.x).toBeCloseTo(position!.x, 0);
    await loaded.click();
    await expect(page.getByTestId('waiting-order')).toHaveCount(12);
    await expect(prev).toBeDisabled(); await expect(next).toBeEnabled();
    const card = page.getByTestId('waiting-order').first(), label = card.locator('.job-state');
    const b = await card.boundingBox(), t = await label.boundingBox();
    expect(b).not.toBeNull(); expect(t).not.toBeNull();
    expect(t!.y + t!.height).toBeLessThanOrEqual(b!.y + b!.height + 1);
    expect(t!.x + t!.width).toBeLessThanOrEqual(b!.x + b!.width + 1);
    expect(await label.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width! < 1000) {
      const bodyWidth = await page.getByTestId('plane-art').locator('svg').evaluate(el => 810 * Math.abs((el as SVGSVGElement).getScreenCTM()!.a));
      expect(bodyWidth).toBeGreaterThan(width! * .4);
    }
    await page.screenshot({ path:`artifacts/loading-queue-${width}.png` });
  });
}
for (const [width, height] of [[1440,900],[844,390]]) {
  test(`map draws numbered click-order draft and clears it at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await ready(page);
    await page.getByRole('button', { name:'制定路线', exact:true }).click();
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toHaveAttribute('data-renderer','ready');
    await expect(canvas).toHaveAttribute('data-preview-path','');
    await expect(page.getByTestId('route-preview')).toContainText('尚未选择路线城市');
    await expect(page.getByLabel('选择机场', { exact: true })).toHaveCount(0);
    await selectCity(page, 'WUH');
    await expect(canvas).toHaveAttribute('data-preview-path','');
    const detail = page.getByRole('dialog', { name:'机场详情', exact:true });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name:/^解锁机场/ }).click();
    // Unlocking from route planning closes the transient detail and appends the city.
    await expect(detail).toHaveCount(0);
    await expect(page.getByTestId('credits')).toHaveText('¥ 10,000');
    await expect(canvas).toHaveAttribute('data-preview-path','WUH');
    const money = await page.getByTestId('credits').textContent();
    await selectCity(page, 'PEK');
    await selectCity(page, 'PVG');
    await expect(canvas).toHaveAttribute('data-preview-path','WUH,PEK,PVG');
    await expect(page.getByTestId('route-preview')).toHaveAttribute('data-legs','3');
    await expect(page.getByTestId('route-preview')).toContainText('2. 武汉→北京');
    await expect(page.getByTestId('credits')).toHaveText(money!);
    await page.screenshot({ path:`artifacts/route-preview-${width}.png` });
    await page.getByRole('button', { name:'路线后退', exact:true }).click();
    await expect(canvas).toHaveAttribute('data-preview-path','WUH,PEK');
    await page.getByRole('button', { name:'路线撤销', exact:true }).click();
    await expect(canvas).toHaveAttribute('data-preview-path','');
    await selectCity(page, 'URC');
    await expect(canvas).toHaveAttribute('data-preview-path','');
    const lockedDetail = page.getByRole('dialog', { name:'机场详情', exact:true });
    await expect(lockedDetail).toBeVisible();
    await expect(page.locator('.network-controls')).toHaveCount(0);
    await expect(lockedDetail.getByRole('button', { name:/^解锁机场/ })).toBeVisible();
    await lockedDetail.getByRole('button', { name:'返回制定路线', exact:true }).click();
    await expect(page.getByTestId('credits')).toHaveText(money!);
    await expect(page.getByTestId('flights-count')).toHaveText('0 班');
  });
}
test('flight hides loading area and restores it after arrival', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await page.getByRole('button', { name:'制定路线', exact:true }).click();await chooseShanghai(page);await launchRoute(page);
  await expect(page.locator('.apron-queue')).toHaveCount(0);
  await expect(page.getByTestId('loaded-order')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^同目的地装载：/ }).first()).toHaveCount(0);
  await expect(page.getByRole('group', { name:'当前航班收支', exact:true })).toBeVisible();
  const cost = await page.getByTestId('flight-cost').textContent();
  const revenue = await page.getByTestId('flight-revenue').textContent();
  await page.reload(); await expect(page.locator('.apron-queue')).toHaveCount(0);
  await expect(page.getByTestId('flight-cost')).toHaveText(cost!);
  await expect(page.getByTestId('flight-revenue')).toHaveText(revenue!);
  await page.clock.fastForward(400_000);
  await expect(page.locator('.apron-queue')).toBeVisible();
  await expect(page.locator('.scene-flight-summary')).toHaveCount(0);
});
