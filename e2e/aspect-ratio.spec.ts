import { expectFullyInViewport } from './layout-helpers.js';
import { expect, test, type Page } from '@playwright/test';
import { airport } from '../src/core/catalog.js';
import { projectGeo, type GlobeCamera } from '../src/ui/globe-geometry.js';
import { viewportLayout } from '../src/ui/game-viewport.js';

async function ready(page: Page) {
  await page.clock.install({ time: new Date('2026-09-13T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}

async function proportions(page: Page, selectors: string[]) {
  return page.evaluate(selectors => selectors.map(selector => {
    const element = document.querySelector(selector)!;
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    const host = document.getElementById('root')!;
    return { selector, x: box.x / host.clientWidth, y: box.y / host.clientHeight,
      width: box.width / host.clientWidth, height: box.height / host.clientHeight,
      fontSize: style.fontSize, display: style.display };
  }), selectors);
}

function sameProportions(a: Awaited<ReturnType<typeof proportions>>, b: Awaited<ReturnType<typeof proportions>>) {
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i]!.selector).toBe(b[i]!.selector);
    expect(a[i]!.fontSize).toBe(b[i]!.fontSize);
    expect(a[i]!.display).toBe(b[i]!.display);
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(a[i]![key], `${a[i]!.selector} ${key}`).toBeCloseTo(b[i]![key], 3);
  }
}

for (const [width, height, factor, uiScale] of [
  [640, 360, 3, 1], [720, 450, 2, 1], [844, 390, 2, 1], [768, 576, 2, 1],
  [640, 360, 3, .75], [640, 360, 3, 1.5], [768, 576, 2, .75], [768, 576, 2, 1.5],
] as const) {
  test(`same aspect ratio matches on mobile and desktop: ${width}x${height}, UI ${uiScale}`, async ({ browser, baseURL }) => {
    const mobile = await browser.newContext({ baseURL, viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const desktop = await browser.newContext({ baseURL, viewport: { width: width * factor, height: height * factor }, deviceScaleFactor: 1 });
    try {
      const small = await mobile.newPage(), large = await desktop.newPage();
      for (const page of [small, large]) {
        await page.addInitScript(value => localStorage.setItem('china-airlines.ui-scale.v1', JSON.stringify(value)), uiScale);
        await ready(page);
        await page.getByRole('button', { name: '存档设置', exact: true }).click();
        await expect(page.getByTestId('ui-scale-value')).toHaveText(`${uiScale * 100}%`);
        await expectFullyInViewport(page.getByRole('dialog', { name: '本地存档与设置' }));
      }
      sameProportions(await proportions(small, ['.settings-modal', '.ui-scale-controls']),
        await proportions(large, ['.settings-modal', '.ui-scale-controls']));
      for (const page of [small, large]) await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
      const airportSelectors = ['.game-hud', '.airport-titlebar', '.scene-wrap', '[data-testid="plane-art"]',
        '.apron-queue', '.destination-station', '[data-testid="waiting-order"]', '.game-dock', '.depart-button'];
      sameProportions(await proportions(small, airportSelectors), await proportions(large, airportSelectors));
      for (const [page, suffix] of [[small, 'mobile'], [large, 'desktop']] as const) {
        await expect(page.getByTestId('plane-art').locator('svg')).toHaveAttribute('viewBox', '0 0 1000 330');
        await page.screenshot({ path: `artifacts/aspect-${width}-${uiScale}-${suffix}-airport.png`, scale: 'css' });
        await page.getByRole('button', { name: '机场目录', exact: true }).click();
        await expectFullyInViewport(page.getByRole('dialog', { name: '机场目录', exact: true }));
      }
      sameProportions(await proportions(small, ['.game-modal', '.airport-directory-tools']),
        await proportions(large, ['.game-modal', '.airport-directory-tools']));
      for (const page of [small, large]) {
        await page.getByRole('button', { name: '关闭机场目录', exact: true }).click();
        await page.getByRole('button', { name: '航线地图', exact: true }).click();
        await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
        await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
      }
      const mapSelectors = ['.network-map', '[data-testid="map-canvas"]', '.dispatch-stat', '[data-testid="dispatch"]'];
      sameProportions(await proportions(small, mapSelectors), await proportions(large, mapSelectors));
      for (const [page, suffix] of [[small, 'mobile'], [large, 'desktop']] as const) {
        await page.screenshot({ path: `artifacts/aspect-${width}-${uiScale}-${suffix}-map.png`, scale: 'css' });
        await page.getByRole('button', { name: '选择目的城市', exact: true }).click();
        await expectFullyInViewport(page.getByRole('dialog', { name: '选择城市', exact: true }));
      }
      sameProportions(await proportions(small, ['.dispatch-dialog']), await proportions(large, ['.dispatch-dialog']));
      for (const page of [small, large]) {
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: '选择目的城市', exact: true })).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      }
    } finally { await mobile.close(); await desktop.close(); }
  });
}

for (const [viewport, uiScale] of [
  [{ width: 640, height: 360 }, 1], [{ width: 1920, height: 1080 }, 1],
  [{ width: 640, height: 360 }, .75], [{ width: 640, height: 360 }, 1.5],
] as const) {
  test(`globe hit-testing and dragging use design coordinates at ${viewport.width}, UI ${uiScale}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(value => localStorage.setItem('china-airlines.ui-scale.v1', JSON.stringify(value)), uiScale);
    await ready(page);
    await page.getByRole('button', { name: '航线地图', exact: true }).click();
    await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
    const host = page.getByTestId('map-canvas');
    await expect(host).toHaveAttribute('data-renderer', 'ready');
    const camera = JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera;
    const bounds = (await host.boundingBox())!, scale = viewportLayout(viewport.width, viewport.height, uiScale).scale;
    const point = projectGeo(airport('PVG'), camera);
    expect(point.visible).toBe(true);
    await page.mouse.click(bounds.x + point.x * scale, bounds.y + point.y * scale);
    await expect(host).toHaveAttribute('data-preview-path', 'PVG');
    const before = await host.getAttribute('data-camera');
    await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .4);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .45, { steps: 6 });
    await page.mouse.up();
    await expect(host).not.toHaveAttribute('data-camera', before!);
    await expect(host).toHaveAttribute('data-preview-path', 'PVG');
    await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
  });
}

test('resize, portrait and modal scaling preserve the current route and mounted map', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 450 }); await ready(page);
  await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-renderer', 'ready');
  await host.evaluate(element => { element.setAttribute('data-same-node', 'yes'); });
  await page.getByRole('button', { name: '选择目的城市', exact: true }).click();
  await page.getByLabel('选择机场', { exact: true }).selectOption('PVG');
  await expect(host).toHaveAttribute('data-preview-path', 'PVG');
  const camera = await host.getAttribute('data-camera');
  await page.getByRole('button', { name: '查看路线', exact: true }).click();
  for (const [width, height] of [[1600, 900], [640, 360], [1920, 1080]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await expect(page.getByTestId('game-viewport')).toHaveAttribute('data-scale', String(height! / 900));
    await expectFullyInViewport(page.getByRole('dialog', { name: '路线详情' }));
    await expect(host).toHaveAttribute('data-camera', camera!);
    await expect(host).toHaveAttribute('data-same-node', 'yes');
  }
  await page.keyboard.press('Escape');
  for (const viewport of [{ width: 390, height: 844 }, { width: 1170, height: 2532 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.rotate-screen')).toBeVisible();
    await expectFullyInViewport(page.locator('.rotate-screen'));
  }
  await page.setViewportSize({ width: 800, height: 450 });
  await expect(page.locator('.rotate-screen')).toBeHidden();
  await expect(host).toHaveAttribute('data-preview-path', 'PVG');
  await expect(host).toHaveAttribute('data-same-node', 'yes');
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
});
