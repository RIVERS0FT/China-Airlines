import { test, expect } from './fixture.js';
import { displayScale } from './display-helpers.js';
import type { MapBox } from '../src/ui/map-label-layout.js';
import type { GlobeCamera } from '../src/ui/globe-geometry.js';

test.use({ hasTouch: true });

for (const [width, height, zoom] of [[1440, 900, 100], [844, 390, 100], [667, 375, 100], [844, 390, 150]] as const) {
  test(`floating map buttons preserve the bottom canvas and gestures at ${width}/${zoom}%`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.addInitScript(value => localStorage.setItem('china-airlines:ui-scale:v1', String(value)), zoom);
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: '地图', exact: true }).click();
    const map = page.getByTestId('map-canvas'), nav = page.locator('.game-dock');
    await expect(map).toHaveAttribute('data-renderer', 'ready');
    await expect(map).toHaveAttribute('data-label-boxes', /"id"/);
    await expect(page.locator('.game-hud')).toBeVisible();
    await expect(page.locator('.world-map-toolbar,.map-controls,.map-plane-toggle')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '返回机场', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '查找城市', exact: true })).toBeInViewport();
    await expect(nav).toHaveCSS('position', 'absolute');
    await expect(nav).toHaveCSS('pointer-events', 'none');
    await expect(nav).toHaveCSS('background-image', 'none');
    await expect(nav).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(nav).toHaveCSS('box-shadow', 'none');
    await expect(nav).toHaveCSS('border-top-width', '0px');
    await expect(nav.locator('button')).toHaveCount(7);

    const scale = await displayScale(page), box = (await map.boundingBox())!;
    const hud = (await page.locator('.game-hud').boundingBox())!;
    const game = (await page.locator('.aviation-game').boundingBox())!;
    expect(Math.abs(box.y - hud.y - hud.height)).toBeLessThan(1);
    expect(game.y + game.height - box.y - box.height).toBeLessThanOrEqual(4 * scale + 1);
    const first = (await nav.locator('button').nth(0).boundingBox())!;
    const second = (await nav.locator('button').nth(1).boundingBox())!;
    expect(first.x - box.x).toBeGreaterThanOrEqual(0);
    expect(first.x - box.x).toBeLessThanOrEqual(16 * scale);
    expect(first.y + first.height).toBeLessThan(box.y + box.height);
    for (const button of await nav.locator('button').all()) {
      await expect(button).toBeInViewport();
      await expect(button).toHaveCSS('pointer-events', 'auto');
      const b = (await button.boundingBox())!;
      expect(Math.abs(b.y - first.y)).toBeLessThan(1);
      expect(b.width).toBeGreaterThanOrEqual(44 * scale - .1);
      expect(b.height).toBeGreaterThanOrEqual(44 * scale - .1);
    }

    // A full-width transparent hit target would fail both of these real hit tests.
    const gap = { x: (first.x + first.width + second.x) / 2, y: first.y + first.height / 2 };
    const empty = { x: box.x + box.width - 140 * scale, y: gap.y };
    for (const point of [gap, empty]) {
      expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('CANVAS');
    }
    const layout = await map.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
    const labels = JSON.parse((await map.getAttribute('data-label-boxes'))!) as (MapBox & { id: string })[];
    const exclusions = JSON.parse((await map.getAttribute('data-label-exclusions'))!) as MapBox[];
    expect(exclusions.length).toBeGreaterThanOrEqual(7);
    expect(labels.some(label => label.y + label.h > layout.height - 83)).toBe(true);
    for (const label of labels) {
      expect(label.x).toBeGreaterThanOrEqual(5);
      expect(label.x + label.w).toBeLessThanOrEqual(layout.width - 5);
      expect(label.y + label.h).toBeLessThanOrEqual(layout.height - 5);
      expect(exclusions.some(other => label.x < other.x + other.w && label.x + label.w > other.x
        && label.y < other.y + other.h && label.y + label.h > other.y)).toBe(false);
    }
    await page.screenshot({ path: `artifacts/map-floating-${width}-${zoom}.png` });

    const credits = await page.getByTestId('credits').textContent();
    let before = await map.getAttribute('data-camera');
    await page.mouse.move(empty.x, empty.y); await page.mouse.down();
    await page.mouse.move(empty.x - 40 * scale, empty.y - 18 * scale, { steps: 5 }); await page.mouse.up();
    await expect(map).not.toHaveAttribute('data-camera', before!);
    before = await map.getAttribute('data-camera');
    const client = await page.context().newCDPSession(page);
    try {
      // Start inside a button gap, then cross beneath the dock while captured by canvas.
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...gap, id: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gap.x + 24 * scale, y: gap.y - 16 * scale, id: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(map).not.toHaveAttribute('data-camera', before!);
      const camera = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera;
      const touches = (distance: number) => [{ x: empty.x - distance * scale, y: empty.y, id: 1 }, { x: empty.x + distance * scale, y: empty.y, id: 2 }];
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(30) });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(60) });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => (JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera).scale).toBeGreaterThan(camera.scale);
    } finally { await client.detach(); }
    const beforeWheel = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera;
    await page.mouse.move(empty.x, empty.y); await page.mouse.wheel(0, -120);
    await expect.poll(async () => (JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera).scale).toBeGreaterThan(beforeWheel.scale);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(map).toHaveAttribute('data-preview-path', '');
    await expect(page.getByTestId('credits')).toHaveText(credits!);
    await nav.getByRole('button', { name: '机场装载', exact: true }).tap();
    await expect(page.getByTestId('airport-scene')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
