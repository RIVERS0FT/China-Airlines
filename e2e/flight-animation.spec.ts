import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { GameCore, quote, type GameState } from '../src/core/game.js';
import { prepareAirportSession } from './fixture.js';
import { selectCity, launchRoute } from './dispatch-helpers.js';

const NOW = Date.parse('2026-09-16T00:00:00Z');
const money = (value: number) => `¥ ${Math.round(value).toLocaleString('zh-CN')}`;
const cruise = (page: Page) => page.locator('.is-flying .airplane-display > svg');
async function importState(page: Page, state: GameState) {
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({
    name: 'flight-motion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.locator('.settings-modal')).toContainText('存档导入成功');
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
}
async function exportState(page: Page): Promise<GameState> {
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const download = await pending;
  const state = JSON.parse(await readFile((await download.path())!, 'utf8')) as GameState;
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  return state;
}
async function motionSample(target: Locator) {
  await expect(target).toHaveCSS('animation-name', 'start-aircraft-cruise');
  return target.evaluate(element => {
    const animation = element.getAnimations().find(item => item instanceof CSSAnimation && item.animationName === 'start-aircraft-cruise');
    if (!animation) throw new Error('The shared cruise animation is not attached');
    const style = getComputedStyle(element);
    const timing = [style.animationDuration, style.animationTimingFunction, style.animationIterationCount];
    const running = animation.playState;
    const frames = (animation.effect as KeyframeEffect).getKeyframes().map(frame => frame.transform);
    // Seek the actual browser animation, rather than comparing only class names.
    animation.pause();
    const poses = [0, 3000, 6000].map(time => {
      animation.currentTime = time;
      const transform = getComputedStyle(element).transform;
      const matrix = new DOMMatrixReadOnly(transform);
      return { transform, x: matrix.m41, y: matrix.m42 };
    });
    animation.play();
    return { timing, running, frames, poses };
  });
}

for (const config of [
  { width: 1280, height: 720, zoom: 100, model: 'starter-swift' },
  { width: 844, height: 390, zoom: 150, model: 'diamond-da40' },
  { width: 667, height: 375, zoom: 75, model: 'starter-swift' },
]) test(`title and real ${config.model} share motion at ${config.width}/${config.zoom}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize(config);
  await page.addInitScript(zoom => localStorage.setItem('china-airlines:ui-scale:v1', String(zoom)), config.zoom);
  // Freeze only business time; CSS animation and rendering continue normally.
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto('./');
  const title = await motionSample(page.locator('.start-aircraft'));
  expect(title.timing).toEqual(['6s', 'ease-in-out', 'infinite']);
  expect(title.running).toBe('running');
  expect(title.poses[1]!.x).toBeCloseTo(-10, 5);
  expect(title.poses[1]!.y).toBeCloseTo(-9, 5);
  expect(title.poses[0]!.transform).not.toBe(title.poses[1]!.transform);
  expect(title.poses[0]).toEqual(title.poses[2]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.start-aircraft')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.start-flight-sky .flight-clouds-near')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.start-aircraft')).toHaveCSS('animation-name', 'start-aircraft-cruise');

  const core = new GameCore(NOW);
  if (config.model === 'diamond-da40') core.execute({ type: 'buy', modelId: config.model, airportId: 'PEK' }, NOW);
  const id = config.model === 'diamond-da40' ? 'AC0002' : 'AC0001';
  core.execute({ type: 'dispatch', planeId: id, to: 'PVG', auto: false }, NOW);
  await page.getByRole('button', { name: '进入游戏', exact: true }).click();
  await importState(page, core.snapshot());
  await page.getByRole('button', { name: '机场装载', exact: true }).click();
  if (id === 'AC0002') await page.getByRole('button', { name: '下一架飞机', exact: true }).click();
  await expect(page.locator('.plane-status')).toContainText(id);
  await expect(page.getByTestId('aircraft-sprite')).toHaveAttribute('href', new RegExp(`aircraft-${config.model}-exterior-v7\\.png$`));
  const before = await exportState(page);
  const button = page.getByTestId('plane-art');
  const fixed = await button.boundingBox();
  const flight = await motionSample(cruise(page));
  expect(flight).toEqual(title);
  expect(await button.boundingBox()).toEqual(fixed);
  // The old compact viewBox removed the top of DA40's tail. Check the whole
  // sprite rectangle at each cruise quarter, not only the visible alpha pixels.
  const bounds = await cruise(page).evaluate(element => {
    const animation = element.getAnimations().find(item => item instanceof CSSAnimation && item.animationName === 'start-aircraft-cruise')!;
    const image = element.querySelector('image')!;
    const stage = element.closest('.aviation-stage')!;
    animation.pause();
    const samples = [0, 1500, 3000, 4500, 6000].map(time => {
      animation.currentTime = time;
      const sprite = image.getBoundingClientRect(), frame = stage.getBoundingClientRect();
      return { left: sprite.left - frame.left, top: sprite.top - frame.top,
        right: frame.right - sprite.right, bottom: frame.bottom - sprite.bottom };
    });
    animation.play();
    return samples;
  });
  for (const sample of bounds) for (const inset of Object.values(sample)) expect(inset).toBeGreaterThanOrEqual(0);
  await expect(page.locator('.is-flying .flight-clouds-near')).toHaveCSS('animation-duration', '18s');
  await expect(page.locator('.is-flying .flight-clouds-far')).toHaveCSS('animation-duration', '32s');
  await expect(page.locator('.is-flying .flight-sky')).toHaveCSS('pointer-events', 'none');
  await page.getByRole('button', { name: '机队管理', exact: true }).click();
  await page.getByRole('button', { name: '关闭机队管理', exact: true }).click();
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(cruise(page)).toHaveCSS('animation-name', 'none');
  for (const layer of ['near', 'far']) await expect(page.locator(`.is-flying .flight-clouds-${layer}`)).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  expect(await exportState(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/shared-flight-motion-${config.model}-${config.width}-${config.zoom}.png` });
  expect(errors).toEqual([]);
});

test('real departure, offline reload and arrival do not depend on animation callbacks', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await prepareAirportSession(page);
  await page.clock.install({ time: new Date(NOW) });
  await page.clock.pauseAt(new Date(NOW + 1000));
  const core = new GameCore(NOW);
  core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  const state = core.snapshot(), flight = quote(state, state.fleet[0]!, 'PVG');
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await importState(page, state);
  await expect(cruise(page)).toHaveCount(0);
  await page.getByRole('button', { name: '制定路线', exact: true }).click();
  await selectCity(page, 'PVG'); await launchRoute(page);
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost));
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload();
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(cruise(page)).toHaveCSS('animation-name', 'none');
  await page.clock.fastForward((flight.duration + 10) * 1000);
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  const resume = page.getByRole('button', { name: '继续经营', exact: true });
  if (await resume.isVisible()) await resume.click();
  await expect(cruise(page)).toHaveCount(0);
  await expect(page.getByTestId('aircraft-cabin')).toBeVisible();
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost + flight.revenue));
  await page.reload();
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost + flight.revenue));
  expect(errors).toEqual([]);
});
