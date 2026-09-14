import { test, expect, type Page } from './fixture.js';
import type { GlobeCamera } from '../src/ui/globe-geometry.js';

async function expectClearBackdrop(page: Page, name: string) {
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-renderer', 'ready');
  await expect(host).toHaveAttribute('data-render-count', /^[1-9]\d*$/);
  await expect(host).toHaveAttribute('data-coastline-segments', /^[1-9]\d*$/);
  const camera = JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera;
  const size = await host.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
  const r = camera.radius * camera.scale;
  // Sample the old origin-to-highlight connector, well outside the globe/halo.
  const sample = { x: .4 * (camera.cx + Math.cos(Math.PI * .7) * (r - 3)),
    y: .4 * (camera.cy + Math.sin(Math.PI * .7) * (r - 3)) };
  expect(Math.hypot(sample.x - camera.cx, sample.y - camera.cy) - 18).toBeGreaterThan(r + 35);
  expect(await host.evaluate((node, point) => {
    const rect = node.getBoundingClientRect();
    return document.elementFromPoint(rect.x + point.x * rect.width / node.clientWidth,
      rect.y + point.y * rect.height / node.clientHeight) === node.querySelector('canvas');
  }, sample)).toBe(true);
  const rendered = await host.screenshot({ path: `artifacts/${name}.png`, animations: 'disabled' });
  // Only the test temporarily hides the canvas to capture the unchanged CSS backdrop.
  const backdrop = await host.screenshot({ animations: 'disabled',
    style: '[data-testid="map-canvas"] canvas { visibility: hidden !important; }' });
  const difference = await page.evaluate(async ({ rendered, backdrop, size, sample }) => {
    async function pixels(base64: string) {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Missing screenshot decoder');
      context.drawImage(image, 0, 0);
      const x = Math.floor((sample.x - 12) * image.width / size.width);
      const y = Math.floor((sample.y - 12) * image.height / size.height);
      const width = Math.max(1, Math.ceil(24 * image.width / size.width));
      const height = Math.max(1, Math.ceil(24 * image.height / size.height));
      if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) throw new Error('Sample outside screenshot');
      return context.getImageData(x, y, width, height).data;
    }
    const a = await pixels(rendered), b = await pixels(backdrop);
    if (a.length !== b.length) throw new Error('Screenshot dimensions changed');
    let maximum = 0;
    for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i]! - b[i]!));
    return maximum;
  }, { rendered: rendered.toString('base64'), backdrop: backdrop.toString('base64'), size, sample });
  expect(difference, 'The former diagonal-line area must match the unobstructed map backdrop').toBeLessThanOrEqual(2);
}

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  for (const planning of [false, true]) {
    const mode = planning ? 'dispatch' : 'browse';
    test(`no stray atmosphere line in ${mode} at ${width} before or after camera redraw`, async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height }); await page.goto('./');
      await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
      await page.getByRole('button', { name: planning ? '制定路线' : '地图', exact: true }).click();
      if (planning) await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
      await expectClearBackdrop(page, `atmosphere-${mode}-${width}-initial`);
      const host = page.getByTestId('map-canvas'), frames = Number(await host.getAttribute('data-render-count'));
      const before = await host.getAttribute('data-camera');
      await host.locator('canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('=');
      await expect(host).not.toHaveAttribute('data-camera', before!);
      await expect.poll(async () => Number(await host.getAttribute('data-render-count'))).toBeGreaterThan(frames);
      await expectClearBackdrop(page, `atmosphere-${mode}-${width}-rotated-zoomed`);
      await expect(host).toHaveAttribute('data-preview-path', '');
      await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
      expect(errors).toEqual([]);
    });
  }
}
