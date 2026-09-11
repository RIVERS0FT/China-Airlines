import { test, expect } from '@playwright/test';

for (const width of [1440, 844]) {
  test(`plan breakdown shows click-order legs without route construction at ${width}px`, async ({ page }) => {
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
    const credits = await page.getByTestId('credits').textContent();
    await page.getByLabel('选择机场', { exact: true }).selectOption('PEK');
    await page.getByLabel('选择机场', { exact: true }).selectOption('PVG');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH,PEK,PVG');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
    const mapBounds = await page.locator('.network-map').boundingBox();
    expect(mapBounds?.height ?? 0).toBeGreaterThanOrEqual(90);
    for (const label of ['放大地图', '缩小地图', '重置地图视角']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeInViewport();
      await page.getByRole('button', { name: label, exact: true }).click();
    }
    if (width === 844) {
      await expect(page.locator('.map-area')).toHaveClass(/is-compact/);
      await expect(page.getByRole('img', { name: /机场航线示意图，当前选择上海/ })).toBeVisible();
      await page.screenshot({ path: 'artifacts/landscape-map-readable.png' });
    }
    await page.getByText('逐段费用与交付', { exact: true }).click();
    const legs = page.getByTestId('plan-leg');
    await expect(legs).toHaveCount(3);
    await expect(legs.nth(0)).toContainText('北京 → 武汉');
    await expect(legs.nth(1)).toContainText('武汉 → 北京');
    await expect(legs.nth(2)).toContainText('北京 → 上海');
    for (let i = 0; i < 3; i++) {
      await expect(legs.nth(i).locator('td')).toHaveCount(3);
      await expect(legs.nth(i).locator('td').nth(1)).not.toHaveText('¥ 0');
    }
    await expect(page.getByText(/建设费|开通计划航线|须先开通航线/)).toHaveCount(0);
    await expect(page.getByTestId('credits')).toHaveText(credits!);
    await page.screenshot({ path: `artifacts/plan-details-${width}.png` });
    await page.getByText('逐段费用与交付', { exact: true }).click();
    await expect(page.getByRole('button', { name: '确认路线起飞', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
