import { test, expect, type Page } from './fixture.js';
import { displayScale } from './display-helpers.js';
import { leaveMap } from './dispatch-helpers.js';

type Box = { x: number; y: number; width: number; height: number };
const ordinary = (page: Page) => page.locator('.game-dock > button:not(.depart-button)');
async function boxes(page: Page): Promise<Box[]> {
  return ordinary(page).evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
}
async function expectStable(page: Page, reference: Box[]) {
  await expect(ordinary(page)).toHaveCount(7);
  await expect.poll(async () => {
    const current = await boxes(page);
    if (current.length !== reference.length) return Infinity;
    return Math.max(...current.flatMap((box, index) => {
      const before = reference[index]!;
      return [Math.abs(box.x - before.x), Math.abs(box.y - before.y),
        Math.abs(box.width - before.width), Math.abs(box.height - before.height)];
    }));
  }).toBeLessThan(.5);
}

const cases = [
  { width:1440, height:900, zoom:100, locale:'zh-CN' },
  { width:844, height:390, zoom:100, locale:'zh-CN' },
  { width:667, height:375, zoom:100, locale:'zh-CN' },
  { width:667, height:375, zoom:150, locale:'zh-CN' },
  { width:844, height:390, zoom:75, locale:'zh-CN' },
  { width:760, height:720, zoom:100, locale:'zh-CN' },
  { width:1440, height:900, zoom:100, locale:'en-US' },
  { width:844, height:390, zoom:150, locale:'en-US' },
] as const;

for (const config of cases) {
  test(`navigation keeps its targets at ${config.width}/${config.zoom}%/${config.locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-09-15T00:00:00Z'));
    await page.setViewportSize({ width:config.width, height:config.height });
    await page.addInitScript(({ zoom, locale }) => {
      localStorage.setItem('china-airlines:ui-scale:v1', String(zoom));
      localStorage.setItem('china-airlines:locale:v1', locale);
    }, config);
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText(config.locale === 'zh-CN' ? '1 架' : '1 aircraft');
    const dock = page.locator('.game-dock');
    await expect(page.getByTestId('airport-scene')).toBeVisible();
    await expect(dock).toHaveCSS('justify-content', 'flex-start');
    const baseline = await boxes(page);
    expect(baseline).toHaveLength(7);
    const scale = await displayScale(page);
    const navBox = (await dock.boundingBox())!;
    expect(baseline[0]!.x - navBox.x).toBeGreaterThanOrEqual(0);
    expect(baseline[0]!.x - navBox.x).toBeLessThanOrEqual(16 * scale);
    const gap = baseline[1]!.x - baseline[0]!.x - baseline[0]!.width;
    expect(gap).toBeGreaterThan(0);
    for (let index = 0; index < baseline.length; index++) {
      const box = baseline[index]!;
      expect(Math.abs(box.y - baseline[0]!.y)).toBeLessThan(.5);
      expect(box.width).toBeGreaterThanOrEqual(44 * scale - .1);
      expect(box.height).toBeGreaterThanOrEqual(44 * scale - .1);
      if (index) expect(Math.abs(box.x - baseline[index - 1]!.x - baseline[index - 1]!.width - gap)).toBeLessThan(.5);
      await expect(ordinary(page).nth(index)).toBeInViewport();
    }
    const route = dock.locator('.depart-button');
    const routeBox = (await route.boundingBox())!;
    expect(Math.abs(routeBox.x - baseline[6]!.x - baseline[6]!.width - gap)).toBeLessThan(.5);
    await expect(route).toBeInViewport();

    // Pressing an active tab must not temporarily move its hit target either.
    await ordinary(page).nth(1).hover();
    await page.mouse.down();
    await expectStable(page, baseline);
    await page.mouse.up();

    // Native modal scrollbars and dismissals must not recenter the underlying dock.
    for (const index of [2, 3, 4, 6]) {
      await ordinary(page).nth(index).click();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await expectStable(page, baseline);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expectStable(page, baseline);
    }

    await ordinary(page).nth(0).click();
    await expect(page.locator('.world-map-view')).toBeVisible();
    await expect(route).toHaveCount(0);
    await expectStable(page, baseline);
    await expect(dock).toHaveCSS('position', 'absolute');
    await expect(dock).toHaveCSS('pointer-events', 'none');
    await expect(dock).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
    const first = baseline[0]!, second = baseline[1]!;
    const point = { x:(first.x + first.width + second.x) / 2, y:first.y + first.height / 2 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('CANVAS');
    await ordinary(page).nth(6).click();
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expectStable(page, baseline);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    // Organization inherits the same geometry whether entered from map or airport.
    await ordinary(page).nth(5).click();
    await expect(page.locator('.organization-workspace')).toBeVisible();
    await expectStable(page, baseline);
    await ordinary(page).nth(0).click();
    await expect(page.locator('.organization-workspace')).toHaveCount(0);
    await expectStable(page, baseline);
    await ordinary(page).nth(1).click();
    await expect(page.getByTestId('airport-scene')).toBeVisible();
    await expectStable(page, baseline);
    await ordinary(page).nth(5).click();
    await expect(page.locator('.organization-workspace')).toBeVisible();
    await expectStable(page, baseline);
    await ordinary(page).nth(1).click();
    await expect(page.locator('.organization-workspace')).toHaveCount(0);
    await expectStable(page, baseline);

    if (config.locale === 'zh-CN') {
      await route.click();
      await expect(page.locator('.route-dispatch-view')).toBeVisible();
      await expect(dock).toHaveCount(0);
      await leaveMap(page);
      await expectStable(page, baseline);
    }
    await page.screenshot({ path:`artifacts/navigation-stable-${config.width}-${config.zoom}-${config.locale}.png` });
    await page.reload();
    await expect(page.getByTestId('airport-scene')).toBeVisible();
    await expectStable(page, baseline);
    expect(errors).toEqual([]);
  });
}
