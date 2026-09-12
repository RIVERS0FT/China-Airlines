import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
  test(`route dispatch keeps reference controls usable at ${viewport.width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: '选择航线起飞', exact: true }).click();

    await expect(page.getByTestId('network-summary')).toBeVisible();
    await expect(page.getByTestId('network-destination')).toHaveText('—');
    await expect(page.getByTestId('network-profit')).toBeVisible();
    await expect(page.getByTestId('network-cost')).toBeVisible();
    await expect(page.getByTestId('network-revenue')).toBeAttached();
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-range-plane', 'AC0001');

    for (const label of ['放大地图', '缩小地图', '重置地图视角']) {
      const button = page.getByRole('button', { name: label, exact: true });
      await expect(button).toBeInViewport();
      await button.click();
    }

    const city = page.getByLabel('选择机场', { exact: true });
    await city.selectOption('PEK');
    await city.selectOption('PVG');
    await expect(page.getByTestId('network-destination')).toHaveText('上海');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'PVG');
    await expect(page.getByTestId('plan-summary')).toContainText('1 段');

    for (const label of ['撤销末段', '清空路线', '取消路线规划', '确认起飞']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeInViewport();
    }
    const mapBounds = await page.locator('.network-map').boundingBox();
    expect(mapBounds?.height ?? 0).toBeGreaterThanOrEqual(90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/route-dispatch-reference-${viewport.width}.png` });
    expect(errors).toEqual([]);
  });
}
