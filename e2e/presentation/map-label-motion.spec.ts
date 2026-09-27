import { test, expect, type Page } from '../helpers/configured-airport.js';
import { airport } from '../../src/core/catalog.js';
import { projectGeo, type GlobeCamera } from '../../src/ui/globe-geometry.js';
import type { MapBox } from '../../src/ui/map-label-layout.js';

type Label = MapBox & { id: string };
function expectAtTargets(state: { boxes: Label[]; targets: Label[] }) {
  const ordered = (items: Label[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
  expect(ordered(state.boxes)).toEqual(ordered(state.targets));
}
async function labels(page: Page) {
  return page.getByTestId('map-canvas').evaluate(node => {
    const data = (node as HTMLElement).dataset;
    return { boxes: JSON.parse(data.labelBoxes!) as Label[], targets: JSON.parse(data.labelTargets!) as Label[],
      active: data.labelsAnimating === 'true', time: Number(data.labelTime), frames: Number(data.renderCount),
      camera: JSON.parse(data.camera!) as GlobeCamera };
  });
}
type LabelState = Awaited<ReturnType<typeof labels>>;
function offset(box: Label, camera: GlobeCamera) {
  const point = projectGeo(airport(box.id), camera);
  return { x: box.x - point.x, y: box.y - point.y };
}
function expectUnchangedPlacementsFollowCamera(before: LabelState, after: LabelState) {
  const unchanged = after.boxes.filter(box => {
    const old = before.boxes.find(label => label.id === box.id), target = after.targets.find(label => label.id === box.id);
    if (!old || !target) return false;
    const a = offset(old, before.camera), b = offset(target, after.camera);
    return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 && Math.hypot(old.x - target.x, old.y - target.y) > 1;
  });
  expect(unchanged.length, 'the input must move at least one label without changing its layout offset').toBeGreaterThan(0);
  for (const box of unchanged) {
    const target = after.targets.find(label => label.id === box.id)!;
    expect(box.x, `${box.id} must follow the airport in the first camera frame`).toBeCloseTo(target.x, 6);
    expect(box.y).toBeCloseTo(target.y, 6);
  }
}
function offsetTransitions(before: LabelState, after: LabelState) {
  return after.boxes.flatMap(box => {
    const old = before.boxes.find(label => label.id === box.id), target = after.targets.find(label => label.id === box.id);
    if (!old || !target) return [];
    const from = offset(old, before.camera), to = offset(target, after.camera), current = offset(box, after.camera);
    return Math.hypot(to.x - from.x, to.y - from.y) > 1
      && Math.hypot(current.x - from.x, current.y - from.y) > .1
      && Math.hypot(current.x - to.x, current.y - to.y) > .1 ? [{ from, to, current }] : [];
  });
}

async function ready(page: Page, reducedMotion: boolean) {
  const now = Date.parse('2026-09-15T00:00:00Z');
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await page.clock.install({ time: new Date(now) }); await page.clock.pauseAt(new Date(now + 1000));
  await page.goto('./');
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const map = page.getByTestId('map-canvas');
  await expect(map).toHaveAttribute('data-renderer', 'ready');
  await page.clock.runFor(50);
  await expect(map).toHaveAttribute('data-label-targets', /"id"/);
  const first = await labels(page);
  expect(first.boxes.length).toBeGreaterThan(0);
  expectAtTargets(first); expect(first.active).toBe(false);
  await map.locator('canvas').focus();
  return map;
}

test('city names follow dragging and zoom immediately while layout swaps ease and keep clicks aligned', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const map = await ready(page, false), initial = await labels(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const inputBounds = (await map.boundingBox())!;
  const dragStart = { x: inputBounds.x + inputBounds.width * .72, y: inputBounds.y + inputBounds.height * .4 };
  await page.mouse.move(dragStart.x, dragStart.y); await page.mouse.down();
  await page.mouse.move(dragStart.x + 30, dragStart.y + 8); await page.mouse.up();
  await page.clock.runFor(40);
  const dragged = await labels(page);
  expect(dragged.camera.lon).not.toBe(initial.camera.lon);
  expect(dragged.frames).toBeGreaterThan(initial.frames);
  expectUnchangedPlacementsFollowCamera(initial, dragged);
  await page.clock.runFor(200);
  const beforeZoom = await labels(page);
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await labels(page)).camera.scale).toBeGreaterThan(beforeZoom.camera.scale);
  await page.clock.runFor(40);
  const zoomed = await labels(page);
  expect(zoomed.frames).toBeGreaterThan(beforeZoom.frames);
  expectUnchangedPlacementsFollowCamera(beforeZoom, zoomed);
  await page.clock.runFor(200);

  // Find an actual collision-avoidance side change. Camera motion alone must not create a transition.
  let previous = await labels(page), transitioned: ReturnType<typeof offsetTransitions> = [];
  await map.locator('canvas').focus();
  for (let step = 0; step < 12 && !transitioned.length; step++) {
    await page.keyboard.press('ArrowRight'); await page.clock.runFor(70);
    const middle = await labels(page);
    transitioned = offsetTransitions(previous, middle);
    if (transitioned.length) expect(middle.active).toBe(true);
    else { await page.clock.runFor(200); previous = await labels(page); }
  }
  expect(transitioned.length, 'real camera input must exercise at least one interpolated layout swap').toBeGreaterThan(0);
  for (const { from, to, current } of transitioned) {
    expect(current.x).toBeGreaterThanOrEqual(Math.min(from.x, to.x) - 1e-6);
    expect(current.x).toBeLessThanOrEqual(Math.max(from.x, to.x) + 1e-6);
    expect(current.y).toBeGreaterThanOrEqual(Math.min(from.y, to.y) - 1e-6);
    expect(current.y).toBeLessThanOrEqual(Math.max(from.y, to.y) + 1e-6);
  }
  await page.clock.runFor(300);
  const settled = await labels(page);
  expect(settled.active).toBe(false); expectAtTargets(settled);
  await page.clock.runFor(400);
  expect((await labels(page)).frames).toBe(settled.frames);

  // Text interpolation must never move the actual airport marker or its hit test.
  await page.keyboard.press('Home'); await page.clock.runFor(40);
  const moving = await labels(page);
  const city = projectGeo(airport('PVG'), moving.camera), bounds = (await map.boundingBox())!;
  const dimensions = await map.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
  expect(city.visible).toBe(true);
  await page.mouse.click(bounds.x + city.x * bounds.width / dimensions.width, bounds.y + city.y * bounds.height / dimensions.height);
  const detail = page.getByRole('dialog', { name: '机场详情', exact: true });
  await expect(detail).toContainText('上海航空港');
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
  await expect(page.getByTestId('flights-count')).toHaveText('0 班');
  await detail.getByRole('button', { name: '返回地图', exact: true }).click();
  await page.clock.runFor(300);
  const beforeTurn = await labels(page);
  await map.locator('canvas').focus();
  for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
  await page.clock.runFor(50);
  const turned = await labels(page);
  expect(projectGeo(airport('PVG'), turned.camera).visible).toBe(false);
  expect(turned.boxes.some(label => label.id === 'PVG')).toBe(false);
  expect(turned.targets.some(label => label.id === 'PVG')).toBe(false);
  const newlyVisible = turned.boxes.filter(box => !beforeTurn.boxes.some(label => label.id === box.id));
  expect(newlyVisible.length).toBeGreaterThan(0);
  for (const box of newlyVisible) expect(box).toEqual(turned.targets.find(target => target.id === box.id));
  expect(errors).toEqual([]);
});

test('reduced motion places city names at their target immediately and leaves a quiet map idle', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  const map = await ready(page, true), before = await labels(page);
  await page.keyboard.press('ArrowRight'); await page.clock.runFor(50);
  const rotated = await labels(page);
  expect(rotated.camera.lon).not.toBe(before.camera.lon);
  expect(rotated.frames).toBeGreaterThan(before.frames);
  expectAtTargets(rotated); expect(rotated.active).toBe(false);
  await page.clock.runFor(400);
  expect((await labels(page)).frames).toBe(rotated.frames);
  await page.keyboard.press('Home'); await page.clock.runFor(50);
  const home = await labels(page);
  expectAtTargets(home); expect(home.active).toBe(false);
  expect(home.camera.lon).toBe(before.camera.lon);
  await expect(map).toHaveAttribute('data-preview-path', '');
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
});
