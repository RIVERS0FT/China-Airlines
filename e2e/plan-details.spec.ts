import { test, expect } from '@playwright/test';

for (const width of [1440, 844]) {
  test(`plan breakdown shows each leg and charges shared routes once at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 390 });
    await page.clock.install({ time: new Date('2026-09-11T00:00:00Z') });
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: '同目的地装载', exact: true }).click();
    await page.getByRole('button', { name: '选择航线起飞', exact: true }).click();
    await page.getByLabel('选择机场', { exact: true }).selectOption('WUH');
    await page.getByRole('button', { name: /^解锁机场/ }).click();
    await page.getByRole('button', { name: '多段计划', exact: true }).click();
    await page.getByRole('button', { name: '添加武汉航段' }).click();
    await page.getByLabel('选择机场', { exact: true }).selectOption('PEK');
    await page.getByRole('button', { name: '添加北京航段' }).click();
    await page.getByLabel('选择机场', { exact: true }).selectOption('PVG');
    await page.getByRole('button', { name: '添加上海航段' }).click();
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
    const mapBounds = await page.locator('.network-map').boundingBox();
    expect(mapBounds?.height ?? 0).toBeGreaterThanOrEqual(90);
    await page.getByText('逐段费用与交付', { exact: true }).click();
    const legs = page.getByTestId('plan-leg');
    await expect(legs).toHaveCount(3);
    await expect(legs.nth(0)).toContainText('北京 → 武汉');
    await expect(legs.nth(1)).toContainText('复用前段航线 · 不重复收费');
    await expect(legs.nth(2)).toContainText('北京 → 上海');
    await expect(legs.nth(0).locator('td').nth(2)).toHaveText('¥ 0');
    await expect(legs.nth(2).locator('td').nth(2)).not.toHaveText('¥ 0');
    await page.screenshot({ path: `artifacts/plan-details-${width}.png` });
    await page.getByText('逐段费用与交付', { exact: true }).click();
    await page.getByRole('button', { name: /^开通计划航线/ }).click();
    await expect(page.getByRole('button', { name: '执行运输计划', exact: true })).toBeInViewport();
    await page.getByText('逐段费用与交付', { exact: true }).click();
    for (let i = 0; i < 3; i++) await expect(legs.nth(i).locator('td').last()).toHaveText('已开通');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
