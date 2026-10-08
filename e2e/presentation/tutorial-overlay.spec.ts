import { test, expect, startNewCompany, exportCompany, clickGuideMask, buyFirstAircraft } from '../helpers/new-company.js';
import { airport } from '../../src/core/catalog.js';
import { projectGeo, type GlobeCamera } from '../../src/ui/globe-geometry.js';

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`wide tutorial keeps portrait inside, allows overflow and routes real clicks at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startNewCompany(page);
    const initial = await exportCompany(page);
    const guide = page.getByTestId('tutorial'), dialogue = guide.locator('.tutorial-dialogue'), portrait = guide.locator('img');
    await portrait.evaluate((image: HTMLImageElement) => image.decode());
    const frame = (await dialogue.boundingBox())!, person = (await portrait.boundingBox())!;
    expect(frame.width).toBeGreaterThanOrEqual(Math.min(1040, viewport.width - 24) - 1);
    expect(person.x).toBeGreaterThan(frame.x);
    expect(person.x + person.width).toBeLessThan(frame.x + frame.width);
    expect(person.y).toBeLessThan(frame.y);
    expect(person.y).toBeGreaterThanOrEqual(0);
    expect(person.y + person.height).toBeLessThanOrEqual(frame.y + frame.height);
    await expect(dialogue.getByRole('button')).toHaveCount(1);
    const skip = dialogue.getByRole('button', { name: '跳过引导', exact: true }), skipBounds = (await skip.boundingBox())!;
    expect(skipBounds.height).toBeGreaterThanOrEqual(44);
    expect(skipBounds.x).toBeGreaterThan(frame.x + frame.width / 2);
    expect(skipBounds.x + skipBounds.width).toBeLessThan(frame.x + frame.width);
    expect(skipBounds.y).toBeGreaterThanOrEqual(frame.y);
    expect(skipBounds.y).toBeLessThan(frame.y + 20);

    // Clicking the dark mask only locates the current action: no airport or money changes.
    await clickGuideMask(page);
    const airport = page.getByRole('dialog', { name: '机场详情', exact: true });
    await expect(airport).toBeVisible();
    await expect(page.getByTestId('credits')).toHaveText('¥ 8,400');
    expect((await airport.boundingBox())!.y + (await airport.boundingBox())!.height).toBeLessThan((await dialogue.boundingBox())!.y);
    await clickGuideMask(page);
    await expect(page.getByRole('button', { name: '解锁机场 ¥ 2,500', exact: true })).toBeFocused();
    await expect(page.getByTestId('credits')).toHaveText('¥ 8,400');
    const control = (await page.getByRole('button', { name: '解锁机场 ¥ 2,500', exact: true }).boundingBox())!;
    const spotlight = (await page.getByTestId('tutorial-spotlight').boundingBox())!;
    expect(Math.abs(spotlight.x - (control.x - 5))).toBeLessThan(1);
    expect(Math.abs(spotlight.y - (control.y - 5))).toBeLessThan(1);
    expect(Math.abs(spotlight.width - (control.width + 10))).toBeLessThan(1);
    expect(Math.abs(spotlight.height - (control.height + 10))).toBeLessThan(1);
    await page.screenshot({ path: `artifacts/tutorial-wide-${viewport.width}.png` });
    const buyAirport = page.getByRole('button', { name: '解锁机场 ¥ 2,500', exact: true });
    await buyAirport.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('credits')).toHaveText('¥ 5,900');
    await page.getByRole('button', { name: '支付 ¥ 2,300 购买', exact: true }).click();
    await expect(guide).toHaveAttribute('data-step', 'configure');
    const purchase = page.getByRole('dialog', { name: '购机选配', exact: true });
    await purchase.getByRole('spinbutton', { name: '客位', exact: true }).fill('1');
    await page.screenshot({ path: `artifacts/tutorial-configuration-${viewport.width}.png` });
    await purchase.getByRole('button', { name: '取消购买', exact: true }).click();
    await expect(guide).toHaveAttribute('data-step', 'buy');
    await page.reload();
    await expect(guide).toHaveAttribute('data-step', 'buy');
    const saved = await exportCompany(page);
    expect(saved.fleet).toEqual([]);
    expect(saved.credits).toBe(initial.credits - 2500);
    expect(saved.airports.map(a => a.id)).toEqual(['PEK', 'PVG']);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.rotate-screen')).toBeVisible();
    await expect(guide).toBeHidden();
    await page.setViewportSize(viewport);
    await expect(guide).toBeVisible();
    await guide.getByRole('button', { name: '跳过引导', exact: true }).click();
    await expect(guide).toHaveCount(0);
    const skipped = await exportCompany(page);
    expect(skipped.credits).toBe(saved.credits);
    expect(skipped.fleet).toEqual(saved.fleet);
    expect(skipped.tutorial).toBe('skipped');
  });
}

test.describe('tutorial touch hit targets', () => {
  test.use({ hasTouch: true });
  for (const [width, height, zoom] of [[1440, 900, 100], [844, 390, 150], [667, 375, 75]] as const) {
    test(`Shanghai map point follows the camera and dispatches once at ${width}/${zoom}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await startNewCompany(page);
      await buyFirstAircraft(page);
      if (zoom !== 100) {
        await page.getByRole('button', { name: '存档设置', exact: true }).click();
        await page.getByRole('button', { name: `${zoom}%`, exact: true }).click();
        await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
      }
      await page.getByRole('button', { name: /^装载 .* 前往上海 .*位旅客/ }).first().tap();
      await page.getByRole('button', { name: '制定航线', exact: true }).tap();
      const map = page.getByTestId('map-canvas');
      await expect(map).toHaveAttribute('data-renderer', 'ready');
      await page.clock.runFor(100);
      await expect(page.locator('.dispatch-readout button, .dispatch-readout select')).toHaveCount(0);
      const before = await map.getAttribute('data-camera');
      await map.locator('canvas').focus();
      await page.keyboard.press('ArrowLeft');
      await page.clock.runFor(100);
      await expect(map).not.toHaveAttribute('data-camera', before!);
      const bounds = (await map.boundingBox())!, scale = bounds.width / await map.evaluate(element => element.clientWidth);
      const camera = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera, point = projectGeo(airport('PVG'), camera);
      const halo = (await page.getByTestId('tutorial-spotlight').boundingBox())!;
      expect(Math.abs(halo.x + halo.width / 2 - (bounds.x + point.x * scale))).toBeLessThan(1);
      expect(Math.abs(halo.y + halo.height / 2 - (bounds.y + point.y * scale))).toBeLessThan(1);
      await clickGuideMask(page, true);
      await page.clock.runFor(100);
      await expect(map).toHaveAttribute('data-preview-path', '');
      await expect(page.getByTestId('dispatch')).toBeDisabled();
      const located = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera, city = projectGeo(airport('PVG'), located);
      expect(located.lon).toBeCloseTo(airport('PVG').lon);
      await page.touchscreen.tap(bounds.x + city.x * scale, bounds.y + city.y * scale);
      await page.clock.runFor(100);
      await expect(page.getByTestId('network-destination')).toHaveText('上海');
      await expect(map).toHaveAttribute('data-preview-path', 'PVG');
      await expect(page.getByRole('dialog', { name: '选择城市', exact: true })).toHaveCount(0);
      await page.screenshot({ path: `artifacts/tutorial-map-selected-${width}.png` });
      await page.getByTestId('dispatch').tap();
      await expect(page.getByTestId('credits')).toHaveText('¥ 3,504');
      const saved = await exportCompany(page);
      expect(saved.fleet[0]!.flight).toMatchObject({ from: 'PEK', to: 'PVG', cost: 96, revenue: 326 });
      expect(saved.stats).toMatchObject({ costs: 96, flights: 0, revenue: 0 });
    });
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
    test(`highlight reaches a working airport control and dark mask focuses without purchasing at ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startNewCompany(page);
      const initial = await exportCompany(page);
      async function tapHighlightedControl(selector: string) {
        let point = { x: 0, y: 0 };
        await expect.poll(async () => {
          const hit = await page.getByTestId('tutorial-spotlight').evaluate((spotlight, wanted) => {
            const rect = spotlight.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
            return { x, y, matches: Boolean(document.elementFromPoint(x, y)?.closest(wanted)) };
          }, selector);
          point = hit;
          return hit.matches;
        }).toBe(true);
        await page.touchscreen.tap(point.x, point.y);
      }
      // The first hole must reach a working filter, not the already active directory tab.
      await tapHighlightedControl('[data-guide="locked-airports"]');
      await expect(page.getByRole('button', { name: /^未开放/ })).toHaveAttribute('aria-pressed', 'true');
      await tapHighlightedControl('[data-airport-id="PVG"]');
      const airport = page.getByRole('dialog', { name: '机场详情', exact: true });
      await expect(airport).toBeVisible();
      await clickGuideMask(page, true);
      const unlock = airport.getByRole('button', { name: '解锁机场 ¥ 2,500', exact: true });
      await expect(unlock).toBeFocused();
      await expect(page.getByTestId('credits')).toHaveText('¥ 8,400');
      await unlock.tap();
      await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step', 'buy');
      // Every successful tutorial unlock must reveal the next real control.
      // The directory route used to leave this dialog open under a solid mask.
      await expect(airport).toHaveCount(0);
      await expect(page.getByTestId('page-shop')).toBeVisible();
      await expect(page.getByTestId('credits')).toHaveText('¥ 5,900');
      await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
      await page.screenshot({ path: `artifacts/tutorial-unlock-to-shop-${viewport.width}.png` });
      await tapHighlightedControl('[data-guide="buy-first-plane"]');
      const purchase = page.getByRole('dialog', { name: '购机选配', exact: true });
      await clickGuideMask(page, true);
      await expect(purchase.getByRole('spinbutton', { name: '客位', exact: true })).toBeFocused();
      await expect(page.getByTestId('credits')).toHaveText('¥ 5,900');
      await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
      await purchase.getByRole('button', { name: '取消购买', exact: true }).tap();
      await page.locator('.tutorial-dialogue').getByRole('button', { name: '跳过引导', exact: true }).tap();
      await expect(page.getByTestId('tutorial')).toHaveCount(0);
      await page.reload();
      const saved = await exportCompany(page);
      expect(saved.tutorial).toBe('skipped');
      expect(saved.credits).toBe(initial.credits - 2500);
      expect(saved.airports.map(airport => airport.id)).toEqual(['PEK', 'PVG']);
      expect(saved.fleet).toEqual(initial.fleet);
      expect(saved.stats).toEqual(initial.stats);
    });
  }
});
