import { test, expect, type Page } from '@playwright/test';
let errors: string[];
test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => expect(errors).toEqual([]));
async function ready(page: Page) {
  await page.clock.install({ time: new Date('2026-09-11T00:00:00Z') });
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}
for (const [width, height] of [[1440,900],[844,390],[667,375]]) {
  test(`loading queue scroll, keyboard and filter bounds at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await ready(page);
    const queue = page.getByRole('region', { name:'候运客货列表', exact:true });
    const prev = page.getByRole('button', { name:'上一组客货', exact:true });
    const next = page.getByRole('button', { name:'下一组客货', exact:true });
    await expect(prev).toBeDisabled(); await expect(next).toBeEnabled();
    await next.click(); await expect.poll(() => queue.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await queue.focus(); await page.keyboard.press('Home'); await expect(prev).toBeDisabled();
    await page.keyboard.press('End'); await expect(next).toBeDisabled();
    await page.getByLabel('客货分类', { exact:true }).selectOption('cargo');
    await expect(page.getByTestId('waiting-order')).toHaveCount(4);
    await expect(prev).toBeDisabled(); await expect(next).toBeDisabled();
    await page.getByLabel('客货分类', { exact:true }).selectOption('all');
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
  test(`map draws numbered multi-stop draft and clears it at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! }); await ready(page);
    await page.getByRole('button', { name:'航线地图', exact:true }).click();
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toHaveAttribute('data-renderer','ready');
    await expect(canvas).toHaveAttribute('data-preview-path','PVG');
    await expect(page.getByTestId('route-preview')).toContainText('须先开通航线');
    await page.getByLabel('选择机场', { exact:true }).selectOption('WUH');
    await page.getByRole('button', { name:/^解锁机场/ }).click();
    // Await the persisted unlock result before measuring read-only draft edits.
    await expect(page.getByRole('button', { name:/^解锁机场/ })).toHaveCount(0);
    await expect(page.getByTestId('credits')).toHaveText('¥ 148,000');
    const money = await page.getByTestId('credits').textContent();
    await page.getByRole('button', { name:'多段计划', exact:true }).click();
    await expect(canvas).toHaveAttribute('data-preview-path','');
    await page.getByRole('button', { name:'添加武汉航段', exact:true }).click();
    await page.getByLabel('选择机场', { exact:true }).selectOption('PEK');
    await page.getByRole('button', { name:'添加北京航段', exact:true }).click();
    await page.getByLabel('选择机场', { exact:true }).selectOption('PVG');
    await page.getByRole('button', { name:'添加上海航段', exact:true }).click();
    await expect(canvas).toHaveAttribute('data-preview-path','WUH,PEK,PVG');
    await expect(page.getByTestId('route-preview')).toHaveAttribute('data-legs','3');
    await expect(page.getByTestId('route-preview')).toContainText('2. 武汉→北京');
    await expect(page.getByTestId('credits')).toHaveText(money!);
    await page.screenshot({ path:`artifacts/route-preview-${width}.png` });
    await page.getByRole('button', { name:'撤销末段', exact:true }).click();
    await expect(canvas).toHaveAttribute('data-preview-path','WUH,PEK');
    await page.getByRole('button', { name:'清空计划', exact:true }).click();
    await expect(canvas).toHaveAttribute('data-preview-path','');
    await page.getByRole('button', { name:'单段派航', exact:true }).click();
    await page.getByLabel('选择机场', { exact:true }).selectOption('URC');
    await expect(page.getByTestId('route-preview')).toContainText('解锁');
    await expect(canvas).toHaveAttribute('data-preview-path','URC');
    await expect(page.getByTestId('credits')).toHaveText(money!);
    await expect(page.getByTestId('flights-count')).toHaveText('0 班');
  });
}
test('in-flight manifest explains why unload is unavailable', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name:'同目的地装载', exact:true }).click();
  await page.getByRole('button', { name:'选择航线起飞', exact:true }).click();
  await page.getByRole('button', { name:/^开通航线/ }).click(); await page.getByTestId('dispatch').click();
  const job = page.getByTestId('loaded-order').first();
  await expect(job).toBeDisabled(); await expect(job.locator('.job-state')).toHaveText('飞行中，不能装卸');
  await expect(page.getByRole('button', { name:'同目的地装载', exact:true })).toHaveCount(0);
  await expect(page.getByRole('group', { name:'当前航班收支', exact:true })).toBeVisible();
  const cost = await page.getByTestId('flight-cost').textContent();
  const revenue = await page.getByTestId('flight-revenue').textContent();
  await page.reload(); await expect(page.getByTestId('loaded-order').first().locator('.job-state')).toHaveText('飞行中，不能装卸');
  await expect(page.getByTestId('flight-cost')).toHaveText(cost!);
  await expect(page.getByTestId('flight-revenue')).toHaveText(revenue!);
});
