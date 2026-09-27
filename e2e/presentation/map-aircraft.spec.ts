import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '../helpers/configured-airport.js';
import { selectCity, launchRoute } from '../helpers/dispatch-helpers.js';
import { GameCore, type GameState } from '../helpers/configured-game.js';
import { airport } from '../../src/core/catalog.js';
import { projectMapAircraft } from '../../src/ui/map-aircraft.js';
import { dot, greatCircle, toVector, type GlobeCamera } from '../../src/ui/globe-geometry.js';

const NOW = Date.parse('2026-09-15T00:00:00Z');
const ART = 'map-aircraft-topdown-v1.png';
interface Marker {
  id: string; x: number; y: number; rotation: number; flipX: boolean; width: number; height: number;
  transform: { a: number; b: number; c: number; d: number };
}

async function changedPixels(page: Page, visible: Buffer, hidden: Buffer) {
  return page.evaluate(async ({ a, b }) => {
    async function pixels(data: string) {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    const [one, two] = await Promise.all([pixels(a), pixels(b)]); let count = 0;
    if (one.length !== two.length) throw new Error('Aircraft screenshot dimensions changed');
    for (let i = 0; i < one.length; i += 4) if (Math.abs(one[i]! - two[i]!) + Math.abs(one[i + 1]! - two[i + 1]!) + Math.abs(one[i + 2]! - two[i + 2]!) > 30) count++;
    return count;
  }, { a: visible.toString('base64'), b: hidden.toString('base64') });
}

async function importState(page: Page, state: GameState) {
  await page.clock.setFixedTime(new Date(state.lastWallTime));
  await page.goto('./');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'map-aircraft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByTestId('fleet-count')).toHaveText(`${state.fleet.length} 架`);
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
}

async function exportState(page: Page): Promise<GameState> {
  const leavePlan = page.getByRole('button', { name: /^(取消起飞|返回航班)$/ });
  if (await leavePlan.isVisible()) await leavePlan.click();
  else await page.getByRole('button', { name: '机场装载', exact: true }).click();
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const state = JSON.parse(await readFile((await (await pending).path())!, 'utf8')) as GameState;
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  return state;
}

async function openMap(page: Page) {
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-renderer', 'ready');
  await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
  await expect(host).toHaveAttribute('data-aircraft-visual', 'sprite');
  await expect(host.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('map-aircraft-canvas')).toHaveCount(0);
  return host;
}

async function selectPlane(page: Page, id: string) {
  await page.getByRole('button', { name: '机队管理概览', exact: true }).click();
  await page.getByRole('button', { name: `查看${id}飞机`, exact: true }).click();
  await expect(page.locator('#fleet-detail-heading')).toBeFocused();
  await page.getByRole('button', { name: '前往这架飞机', exact: true }).click();
}

function flyingState(withGroundedPlane = false) {
  const seed = new GameCore(NOW).snapshot(); seed.credits = 5_000_000;
  const core = new GameCore(NOW, seed);
  if (withGroundedPlane) core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
  const flight = core.snapshot().fleet[0]!.flight!;
  core.tick(NOW + (flight.departAt + (flight.arriveAt - flight.departAt) * .4) * 1000);
  return core.snapshot();
}

test('grounded aircraft has no flight sprite and the map uses one canvas', async ({ page }) => {
  await page.goto('./');
  const host = await openMap(page);
  await expect(host).toHaveAttribute('data-visible-plane-models', '');
  await expect(host).toHaveAttribute('data-visible-planes', '');
  await expect(host).toHaveAttribute('data-plane-markers', '[]');
});

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  test(`top-down aircraft paints pixels on the surface route and hides behind the globe at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // Freeze economic time and remove interpolation so the two readbacks differ only by the aircraft.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const state = flyingState(true);
    await importState(page, state); await selectPlane(page, 'AC0002');
    await page.getByRole('button', { name: '制定航线', exact: true }).click();
    const hint = page.getByRole('button', { name: '关闭选路提示', exact: true });
    if (await hint.isVisible()) await hint.click();
    const host = page.getByTestId('map-canvas');
    await expect(host).toHaveAttribute('data-aircraft-status', 'ready');
    await expect(host).toHaveAttribute('data-route-visual', 'great-circle');
    await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART}`);
    await expect(host.locator('canvas')).toHaveCount(1);
    await expect(page.getByTestId('map-aircraft-canvas')).toHaveCount(0);
    const cameraText = (await host.getAttribute('data-camera'))!;
    const camera = JSON.parse(cameraText) as GlobeCamera;
    const time = Number(await host.getAttribute('data-aircraft-time'));
    const markers = JSON.parse((await host.getAttribute('data-plane-markers'))!) as Marker[];
    expect(markers).toHaveLength(1);
    const marker = markers[0]!, expected = projectMapAircraft(state.fleet[0]!, state.simTime, camera);
    expect(marker.id).toBe('AC0001'); expect(marker.flipX).toBe(false);
    expect(marker.x).toBeCloseTo(expected.x, 5); expect(marker.y).toBeCloseTo(expected.y, 5);
    expect(Math.sin(marker.rotation)).toBeCloseTo(Math.sin(expected.rotation), 5);
    expect(Math.cos(marker.rotation)).toBeCloseTo(Math.cos(expected.rotation), 5);
    expect(marker.width).toBeCloseTo(44 * Math.hypot(marker.transform.a, marker.transform.b), 5);
    expect(marker.height).toBeCloseTo(44 * Math.hypot(marker.transform.c, marker.transform.d), 5);
    const frontArea = marker.transform.a * marker.transform.d - marker.transform.b * marker.transform.c;
    expect(frontArea).toBeGreaterThan(.95);
    const bounds = (await host.boundingBox())!, scale = bounds.width / await host.evaluate(node => node.clientWidth);
    const size = Math.max(marker.width, marker.height) * Math.SQRT2 + 8;
    const clip = { x: bounds.x + (marker.x - size / 2) * scale, y: bounds.y + (marker.y - size / 2) * scale, width: size * scale, height: size * scale };
    expect(clip.x).toBeGreaterThanOrEqual(bounds.x); expect(clip.y).toBeGreaterThanOrEqual(bounds.y);
    expect(clip.x + clip.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(clip.y + clip.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    const visible = await page.screenshot({ clip, path: `artifacts/map-aircraft-topdown-${width}.png` });
    await page.getByRole('button', { name: '隐藏其他飞机', exact: true }).click();
    await expect(host).toHaveAttribute('data-plane-markers', '[]');
    await expect(host).toHaveAttribute('data-camera', cameraText);
    await expect(host).toHaveAttribute('data-aircraft-time', String(time));
    const hidden = await page.screenshot({ clip });
    const changed = await changedPixels(page, visible, hidden);
    expect(changed, 'the real Pixi sprite must paint visible pixels').toBeGreaterThan(60);
    await page.getByRole('button', { name: '显示其他飞机', exact: true }).click();
    await expect(host).toHaveAttribute('data-visible-planes', 'AC0001');

    // The determinant of an orthographic projection of a unit tangent plane is its normal's depth.
    // This oracle uses the locked route and camera, independently of the aircraft projection helper.
    const flight = state.fleet[0]!.flight!;
    const normal = greatCircle(toVector(airport(flight.from)), toVector(airport(flight.to)),
      (state.simTime - flight.departAt) / (flight.arriveAt - flight.departAt));
    let sideCamera = camera, sideDepth = dot(normal, toVector(sideCamera));
    await host.locator('canvas').focus();
    for (let step = 0; step < 18 && sideDepth > .45; step++) {
      const previousMarkers = await host.getAttribute('data-plane-markers');
      await page.keyboard.press('ArrowRight');
      await expect(host).not.toHaveAttribute('data-plane-markers', previousMarkers!);
      sideCamera = JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera;
      sideDepth = dot(normal, toVector(sideCamera));
    }
    expect(sideDepth).toBeGreaterThanOrEqual(.15); expect(sideDepth).toBeLessThanOrEqual(.45);
    const side = (JSON.parse((await host.getAttribute('data-plane-markers'))!) as Marker[])[0]!;
    expect(side.id).toBe('AC0001'); expect(side.flipX).toBe(false);
    const { a, b, c, d } = side.transform, sideArea = a * d - b * c;
    expect(sideArea).toBeCloseTo(sideDepth, 5);
    expect(sideArea).toBeLessThan(frontArea * .5);
    expect(a * a + b * b + c * c + d * d).toBeCloseTo(1 + sideDepth * sideDepth, 5);
    expect(Math.abs(a * c + b * d), 'the projected wing and fuselage axes must exhibit shear, not just rotation').toBeGreaterThan(.05);
    expect(side.width).toBeCloseTo(44 * Math.hypot(a, b), 5);
    expect(side.height).toBeCloseTo(44 * Math.hypot(c, d), 5);
    expect(Math.min(side.width, side.height)).toBeLessThan(44 * .8);
    const sideExpected = projectMapAircraft(state.fleet[0]!, state.simTime, sideCamera);
    for (const key of ['a', 'b', 'c', 'd'] as const) expect(side.transform[key]).toBeCloseTo(sideExpected.transform[key], 5);
    const sideClip = { ...clip, x: bounds.x + (side.x - size / 2) * scale, y: bounds.y + (side.y - size / 2) * scale };
    await page.screenshot({ path: `artifacts/map-aircraft-topdown-tilt-${width}.png`, fullPage: true });
    const sideVisible = await page.screenshot({ clip: sideClip });
    const sideCameraText = await host.getAttribute('data-camera');
    await page.getByRole('button', { name: '隐藏其他飞机', exact: true }).click();
    await expect(host).toHaveAttribute('data-plane-markers', '[]');
    await expect(host).toHaveAttribute('data-camera', sideCameraText!);
    await expect(host).toHaveAttribute('data-aircraft-time', String(time));
    const sideHidden = await page.screenshot({ clip: sideClip });
    const sideChanged = await changedPixels(page, sideVisible, sideHidden);
    expect(sideChanged, 'the tilted aircraft must still paint real pixels').toBeGreaterThan(8);
    expect(sideChanged, 'the visible sprite footprint must shrink at the side of the globe').toBeLessThan(changed * .8);
    await page.getByRole('button', { name: '显示其他飞机', exact: true }).click();
    await expect(host).toHaveAttribute('data-visible-planes', 'AC0001');
    await host.locator('canvas').focus(); await page.keyboard.press('Home');
    await expect(host).toHaveAttribute('data-visible-planes', 'AC0001');
    for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
    await expect(host).toHaveAttribute('data-visible-planes', '');
    await expect(host).toHaveAttribute('data-plane-markers', '[]');
    await page.keyboard.press('Home');
    await expect(host).toHaveAttribute('data-visible-planes', 'AC0001');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const saved = await exportState(page);
    expect(saved.fleet).toEqual(state.fleet); expect(saved.orders).toEqual(state.orders);
    expect(saved.credits).toBe(state.credits); expect(saved.stats).toEqual(state.stats);
    expect(errors).toEqual([]);
  });
}

// Cache hits bypass routes; block workers only where the test exercises resource requests/failure.
const networkTest = test.extend({ serviceWorkers: 'block' });
networkTest('the 2D map loads its local image without requesting a 3D model or layer', async ({ page }) => {
  const requests: string[] = []; page.on('request', request => requests.push(request.url()));
  await importState(page, flyingState());
  const host = await openMap(page);
  await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART}`);
  expect(requests.some(url => url.endsWith(`/art/${ART}`))).toBe(true);
  expect(requests.filter(url => /\.(?:glb|gltf)(?:\?|$)|MapAircraftLayer|(?:^|\/)three[^/]*\.js/.test(url))).toEqual([]);
});

networkTest('a missing aircraft image keeps the sphere and route controls usable', async ({ page }) => {
  let intercepted = false;
  await page.route(`**/art/${ART}`, route => {
    intercepted = true;
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing aircraft image' });
  });
  await page.goto('./');
  await page.getByRole('button', { name: '制定航线', exact: true }).click();
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-renderer', 'ready');
  await expect(host).toHaveAttribute('data-aircraft-status', 'partial');
  expect(intercepted).toBe(true);
  await expect(host.locator('canvas')).toHaveCount(1);
  await expect(page.getByTestId('map-aircraft-canvas')).toHaveCount(0);
  await selectCity(page, 'PVG'); await expect(page.getByTestId('dispatch')).toBeEnabled();
});

test('reopening a map retains one canvas and reduced motion redraws only changed snapshots', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  let host = await openMap(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '机场装载', exact: true }).click();
    await expect(page.getByTestId('map-canvas')).toHaveCount(0);
    host = await openMap(page);
  }
  await page.clock.install({ time: Date.now() + 60_000 }); await page.clock.runFor(100);
  const count = await host.getAttribute('data-render-count');
  await page.clock.runFor(500); await expect(host).toHaveAttribute('data-render-count', count!);
});

test('the shared aircraft image and real flight survive refresh and offline restart', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = flyingState(); await importState(page, state);
  const host = await openMap(page);
  await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART}`);
  const markers = await host.getAttribute('data-plane-markers');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await openMap(page);
  await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART}`);
  await expect(host).toHaveAttribute('data-plane-markers', markers!);
  try {
    await context.setOffline(true); await page.reload(); await openMap(page);
    await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART}`);
    await expect(host).toHaveAttribute('data-plane-markers', markers!);
    const dimensions = await page.evaluate(async file => {
      const image = new Image(); image.src = new URL(`art/${file}`, document.baseURI).href;
      await image.decode(); return [image.naturalWidth, image.naturalHeight];
    }, ART);
    expect(dimensions[0]).toBeGreaterThan(0); expect(dimensions[1]).toBeGreaterThan(0);
    const saved = await exportState(page);
    expect(saved.fleet).toEqual(state.fleet); expect(saved.stats).toEqual(state.stats);
  } finally { await context.setOffline(false); }
});

test('a real flight moves the sprite from business snapshots and settles its arrival once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date(NOW) });
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await page.getByRole('button', { name: '制定航线', exact: true }).click();
  await selectCity(page, 'PVG'); await launchRoute(page);
  const host = await openMap(page);
  await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART}`);
  const time = Number(await host.getAttribute('data-aircraft-time')), markers = await host.getAttribute('data-plane-markers');
  await page.clock.runFor(2000);
  await expect.poll(async () => Number(await host.getAttribute('data-aircraft-time'))).toBeGreaterThan(time);
  await expect(host).not.toHaveAttribute('data-plane-markers', markers!);
  await page.screenshot({ path: 'artifacts/map-aircraft-topdown-departure.png' });
  await page.clock.fastForward(400_000);
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(host).toHaveAttribute('data-visible-planes', '');
  const credits = await page.getByTestId('credits').textContent();
  await page.reload(); await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.getByTestId('credits')).toHaveText(credits!);
});

test('different aircraft types share the top-down image and hiding others preserves the selected flight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seed = new GameCore(NOW).snapshot(); seed.credits = 5_000_000;
  const core = new GameCore(NOW, seed);
  core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
  core.execute({ type: 'buy', modelId: 'swift-m', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0002', to: 'PVG', auto: false }, NOW);
  const state = core.snapshot(); await importState(page, state);
  // The airport detail offers the existing dispatch view even while the current plane is flying.
  await page.getByRole('button', { name: '当前机场详情', exact: true }).click();
  await page.getByRole('button', { name: '安排飞机飞来', exact: true }).click();
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART},AC0002:${ART}`);
  const markers = JSON.parse((await host.getAttribute('data-plane-markers'))!) as Marker[];
  expect(markers).toHaveLength(2);
  expect(markers[0]!.width).toBe(markers[1]!.width); expect(markers[0]!.height).toBe(markers[1]!.height);
  await page.getByRole('button', { name: '隐藏其他飞机', exact: true }).click();
  await expect(host).toHaveAttribute('data-visible-plane-models', `AC0001:${ART}`);
  await page.getByRole('button', { name: '显示其他飞机', exact: true }).click();
  await expect(host).toHaveAttribute('data-visible-planes', 'AC0001,AC0002');
  await page.getByRole('button', { name: '返回航班', exact: true }).click();
  await selectPlane(page, 'AC0003');
  await page.getByRole('button', { name: '制定航线', exact: true }).click();
  await expect(host).toHaveAttribute('data-visible-planes', 'AC0001,AC0002');
  await page.getByRole('button', { name: '隐藏其他飞机', exact: true }).click();
  await expect(host).toHaveAttribute('data-visible-planes', '');
  await page.getByRole('button', { name: '显示其他飞机', exact: true }).click();
  await expect(host).toHaveAttribute('data-visible-planes', 'AC0001,AC0002');
  const saved = await exportState(page);
  expect(saved.fleet).toEqual(state.fleet); expect(saved.orders).toEqual(state.orders);
  expect(saved.credits).toBe(state.credits); expect(saved.stats).toEqual(state.stats);
});
