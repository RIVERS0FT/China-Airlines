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
    await expect(page.locator('.game-dock .depart-button')).toBeHidden();

    for (const label of ['放大地图', '缩小地图', '重置地图视角']) {
      const button = page.getByRole('button', { name: label, exact: true });
      await expect(button).toBeInViewport();
      await button.click();
    }

    const city = page.getByLabel('选择机场', { exact: true });
    await expect(city).toBeInViewport();
    await city.selectOption('PEK');
    await city.selectOption('PVG');
    await expect(page.getByTestId('network-destination')).toHaveText('上海');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'PVG');
    await expect(page.getByTestId('plan-summary')).toContainText('1 段');

    const undo = page.getByRole('button', { name: '撤销末段', exact: true });
    const clear = page.getByRole('button', { name: '清空路线', exact: true });
    const cancel = page.getByRole('button', { name: '取消路线规划', exact: true });
    const dispatch = page.getByRole('button', { name: '确认起飞', exact: true });
    for (const button of [undo, clear, cancel, dispatch]) await expect(button).toBeInViewport();

    const mapBounds = await page.locator('.network-map').boundingBox();
    const zoomBounds = await page.getByRole('button', { name: '重置地图视角', exact: true }).boundingBox();
    const undoBounds = await undo.boundingBox();
    const clearBounds = await clear.boundingBox();
    const cancelBounds = await cancel.boundingBox();
    const dispatchBounds = await dispatch.boundingBox();
    expect(mapBounds).not.toBeNull();
    expect(zoomBounds).not.toBeNull();
    expect(undoBounds).not.toBeNull();
    expect(clearBounds).not.toBeNull();
    expect(cancelBounds).not.toBeNull();
    expect(dispatchBounds).not.toBeNull();
    expect(mapBounds!.height).toBeGreaterThanOrEqual(viewport.height * 0.4);
    expect(zoomBounds!.x + zoomBounds!.width).toBeLessThan(undoBounds!.x);
    expect(undoBounds!.x).toBeLessThan(clearBounds!.x);
    expect(clearBounds!.x).toBeLessThan(cancelBounds!.x);
    expect(Math.abs(undoBounds!.y - cancelBounds!.y)).toBeLessThanOrEqual(4);
    expect(undoBounds!.y).toBeGreaterThanOrEqual(mapBounds!.y);
    expect(undoBounds!.y + undoBounds!.height).toBeLessThanOrEqual(mapBounds!.y + mapBounds!.height + 2);
    expect(dispatchBounds!.y).toBeGreaterThanOrEqual(mapBounds!.y);
    expect(dispatchBounds!.y + dispatchBounds!.height).toBeLessThanOrEqual(mapBounds!.y + mapBounds!.height + 2);
    expect(mapBounds!.x + mapBounds!.width - (dispatchBounds!.x + dispatchBounds!.width)).toBeLessThanOrEqual(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/route-dispatch-reference-${viewport.width}.png` });
    expect(errors).toEqual([]);
  });
}
