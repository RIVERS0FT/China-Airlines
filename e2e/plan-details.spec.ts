import { selectCity, routeDetails, closeRouteDetails } from './dispatch-helpers.js';
import { test, expect } from './fixture.js';

for (const width of [1440, 844]) {
  test(`plan breakdown shows click-order legs without route construction at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 390 });
    await page.clock.install({ time: new Date('2026-09-11T00:00:00Z') });
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
    await page.getByRole('button', { name: '制定路线', exact: true }).click();
    await selectCity(page, 'WUH');
    await page.getByRole('button', { name: /^解锁机场/ }).click();
    await expect(page.getByTestId('credits')).toHaveText('¥ 10,000');
    const credits = await page.getByTestId('credits').textContent();
    await selectCity(page, 'PEK');
    await selectCity(page, 'PVG');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH,PEK,PVG');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
    const mapBounds = await page.locator('.network-map').boundingBox();
    expect(mapBounds?.height ?? 0).toBeGreaterThanOrEqual(width === 844 ? 160 : 90);
    await expect(page.locator('.map-controls')).toHaveCount(0);
    const globe = page.getByTestId('map-canvas');
    const cameraBeforeZoom = await globe.getAttribute('data-camera');
    await globe.locator('canvas').focus(); await page.keyboard.press('+');
    await expect(globe).not.toHaveAttribute('data-camera', cameraBeforeZoom!);
    await page.keyboard.press('-');
    await expect(globe).toHaveAttribute('data-camera', cameraBeforeZoom!);
    if (width === 844) {
      await expect(page.getByRole('img', { name: /机场航线示意图，当前选择上海/ })).toBeVisible();
      await page.screenshot({ path: 'artifacts/landscape-map-readable.png' });
    }
    await routeDetails(page);
    const legs = page.getByTestId('plan-leg');
    await expect(legs).toHaveCount(3);
    await expect(legs.nth(0)).toContainText('北京 → 武汉');
    await expect(legs.nth(1)).toContainText('武汉 → 北京');
    await expect(legs.nth(2)).toContainText('北京 → 上海');
    for (let i = 0; i < 3; i++) {
      await expect(legs.nth(i).locator('td')).toHaveCount(3);
      await expect(legs.nth(i).locator('td').nth(1)).not.toHaveText('¥ 0');
    }
    await expect(page.getByRole('columnheader',{name:'航线建设',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/^(开通航线|开通计划航线)/})).toHaveCount(0);
    await expect(page.getByTestId('credits')).toHaveText(credits!);
    await page.screenshot({ path: `artifacts/plan-details-${width}.png` });
    await closeRouteDetails(page);
    await expect(page.getByRole('button', { name: '检票起飞', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
