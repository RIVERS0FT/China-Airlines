import { test, expect, type Page } from './fixture.js';
import { selectCity, launchRoute } from './dispatch-helpers.js';
import { GameCore } from '../src/core/game.js';

async function openMap(page: Page) {
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-renderer', 'ready');
  return host;
}

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  test(`A model paints real pixels, hides behind globe, and keeps input at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const host = await openMap(page), layer = page.getByTestId('map-aircraft-canvas');
    await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
    await expect(host).toHaveAttribute('data-visible-plane-models', 'AC0001:low-poly-airliner.glb');
    await expect(layer).toHaveAttribute('data-instances', '1');
    await expect(layer).toHaveAttribute('data-draw-calls', '3');
    expect(await layer.evaluate(node => getComputedStyle(node).pointerEvents)).toBe('none');
    const camera = JSON.parse((await host.getAttribute('data-camera'))!);
    const bounds = (await host.boundingBox())!;
    const scale = bounds.width / await host.evaluate(node => node.clientWidth);
    const clip = { x: bounds.x + (camera.cx - 38) * scale, y: bounds.y + (camera.cy - 58) * scale, width: 76 * scale, height: 76 * scale };
    const visible = await page.screenshot({ clip });
    const hidden = await page.screenshot({ clip, style: '.map-aircraft-layer { visibility: hidden !important; }' });
    const changed = await page.evaluate(async ({ a, b }) => {
      async function pixels(data: string) {
        const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const [one, two] = await Promise.all([pixels(a), pixels(b)]); let changed = 0;
      for (let i = 0; i < one.length; i += 4) if (Math.abs(one[i]! - two[i]!) + Math.abs(one[i + 1]! - two[i + 1]!) + Math.abs(one[i + 2]! - two[i + 2]!) > 30) changed++;
      return changed;
    }, { a: visible.toString('base64'), b: hidden.toString('base64') });
    expect(changed, 'the downloaded GLB must visibly render, not merely report ready').toBeGreaterThan(60);
    await page.screenshot({ path: `artifacts/map-aircraft-a-${width}.png` });
    await host.locator('canvas').focus();
    for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
    await expect(layer).toHaveAttribute('data-instances', '0');
    await expect(host).toHaveAttribute('data-visible-planes', '');
    await page.keyboard.press('Home');
    await expect(layer).toHaveAttribute('data-instances', '1');
    await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
    expect(errors).toEqual([]);
  });
}

// Service Worker cache hits bypass page.route; only this network-failure case blocks workers.
const networkFailureTest = test.extend({ serviceWorkers: 'block' });
networkFailureTest('model failure and context loss preserve the existing plane and route controls', async ({ page }) => {
  let intercepted = false;
  await page.route('**/models/low-poly-airliner.glb', route => {
    intercepted = true;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>missing model</html>' });
  });
  const host = await openMap(page);
  await expect(host).toHaveAttribute('data-aircraft-status', 'fallback');
  expect(intercepted, 'the GLB failure must come from the injected invalid response').toBe(true);
  await expect(host).toHaveAttribute('data-visible-plane-models', /aircraft-light-passenger-v2\.png/);
  await expect(page.getByTestId('map-aircraft-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '机场装载', exact: true }).click();
  await page.unroute('**/models/low-poly-airliner.glb');
  await page.getByRole('button', { name: '制定路线', exact: true }).click();
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await page.getByTestId('map-aircraft-canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost')));
  await expect(host).toHaveAttribute('data-aircraft-status', 'fallback');
  await expect(host).toHaveAttribute('data-visible-plane-models', /aircraft-light-passenger-v2\.png/);
  await selectCity(page, 'PVG'); await expect(page.getByTestId('dispatch')).toBeEnabled();
});

test('leaving and reopening a map disposes the previous 3D canvas; reduced motion uses snapshots', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const host = await openMap(page);
  for (let i = 0; i < 3; i++) {
    await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
    await expect(page.getByTestId('map-aircraft-canvas')).toHaveCount(1);
    await page.getByRole('button', { name: '机场装载', exact: true }).click();
    await expect(page.getByTestId('map-aircraft-canvas')).toHaveCount(0);
    await page.getByRole('button', { name: '地图', exact: true }).click();
  }
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await page.clock.install(); await page.clock.pauseAt(new Date()); await page.clock.runFor(100);
  const count = await host.getAttribute('data-render-count');
  await page.clock.runFor(500); await expect(host).toHaveAttribute('data-render-count', count!);
});

test('downloaded A model remains available after refresh and offline restart', async ({ page, context }) => {
  const host = await openMap(page);
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await page.getByRole('button', { name: '地图', exact: true }).click();
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await context.setOffline(true); await page.reload();
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await expect(page.getByTestId('map-aircraft-canvas')).toHaveAttribute('data-instances', '1');
  await context.setOffline(false);
});

test('a real flight uses A while still advancing the original business state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-09-15T00:00:00Z') });
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await page.getByRole('button', { name: '制定路线', exact: true }).click();
  await selectCity(page, 'PVG'); await launchRoute(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await expect(host).toHaveAttribute('data-visible-plane-models', 'AC0001:low-poly-airliner.glb');
  const time = Number(await host.getAttribute('data-aircraft-time'));
  await page.clock.runFor(2000);
  await expect.poll(async () => Number(await host.getAttribute('data-aircraft-time'))).toBeGreaterThan(time);
  await page.screenshot({ path: 'artifacts/map-aircraft-a-departure.png' });
  await page.clock.fastForward(400_000);
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');
});

test('different aircraft types share A geometry and hiding others changes only visibility', async ({ page }) => {
  const now = Date.parse('2026-09-15T00:00:00Z'), core = new GameCore(now);
  core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK' }, now);
  core.execute({ type: 'dispatch', planeId: 'AC0002', to: 'PVG', auto: false }, now);
  await page.clock.setFixedTime(new Date(now));
  await page.goto('./'); await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'two-aircraft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(core.snapshot())) });
  await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.getByRole('button', { name: '制定路线', exact: true }).click();
  const host = page.getByTestId('map-canvas'), layer = page.getByTestId('map-aircraft-canvas');
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await expect(host).toHaveAttribute('data-visible-plane-models', 'AC0001:low-poly-airliner.glb,AC0002:low-poly-airliner.glb');
  await expect(layer).toHaveAttribute('data-instances', '2');
  await expect(layer).toHaveAttribute('data-draw-calls', '3');
  await page.getByRole('button', { name: '隐藏其他飞机', exact: true }).click();
  await expect(layer).toHaveAttribute('data-instances', '1');
  await expect(host).toHaveAttribute('data-visible-planes', 'AC0001');
  await page.getByRole('button', { name: '显示其他飞机', exact: true }).click();
  await expect(layer).toHaveAttribute('data-instances', '2');
  await expect(page.getByTestId('network-cost')).toHaveText(/0/);
});
