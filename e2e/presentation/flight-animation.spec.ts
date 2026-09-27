import { readFile } from 'node:fs/promises';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { GameCore, quote, type GameState } from '../helpers/configured-game.js';
import { prepareAirportSession } from '../helpers/configured-airport.js';
import { selectCity, launchRoute } from '../helpers/dispatch-helpers.js';

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
    const poses = [0, 2400, 4800].map(time => {
      animation.currentTime = time;
      const transform = getComputedStyle(element).transform;
      const matrix = new DOMMatrixReadOnly(transform);
      return { transform, x: matrix.m41, y: matrix.m42 };
    });
    animation.play();
    return { timing, running, frames, poses };
  });
}
async function expectCloudPlayback(target: Locator) {
  const sample = () => target.evaluate(async element => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error('The cloud animation is not attached');
    await animation.ready;
    if (animation.playState !== 'running') throw new Error('The cloud animation is not running');
    return {
      x: new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
      iteration: animation.effect!.getComputedTiming().currentIteration,
    };
  });
  let from = await sample();
  // Observe rendered progress, not a fixed wall-clock sleep: CI's compositor
  // can start late after seeking. A loop resets x, so compare within one cycle;
  // neither a wrap nor stationary/left-moving clouds count as rightward travel.
  await expect.poll(async () => {
    const next = await sample();
    if (next.iteration !== from.iteration || next.x < from.x) from = next;
    return next.x - from.x;
  }, { timeout: 5_000, intervals: [50, 100, 250] }).toBeGreaterThan(5);
}
async function expectPanoramaLoop(target: Locator) {
  const background = await target.evaluate(async element => {
    const animation = element.getAnimations()[0]!;
    await animation.ready;
    const images = [...element.querySelectorAll('img')];
    await Promise.all(images.map(image => image.decode()));
    const duration = Number(animation.effect!.getTiming().duration);
    const scene = element.parentElement!.getBoundingClientRect();
    animation.pause();
    // Just before the wrap still renders the final frame of the first cycle.
    const frames = [0, .5, 1 - 1e-7, 1].map(fraction => {
      animation.currentTime = duration * fraction;
      return images.map(image => {
        const bounds = image.getBoundingClientRect();
        return {
          left: (bounds.left - scene.left) / scene.width,
          right: (bounds.right - scene.left) / scene.width,
          top: (bounds.top - scene.top) / scene.height,
          bottom: (bounds.bottom - scene.top) / scene.height,
        };
      });
    });
    const tiles = images.map(image => ({
      source: image.currentSrc,
      direction: new DOMMatrixReadOnly(getComputedStyle(image).transform).a,
      mask: getComputedStyle(image).maskImage,
    }));
    animation.play();
    return { duration, frames, tiles };
  });
  expect(background.duration).toBe(32_000);
  expect(background.tiles).toHaveLength(3);
  for (const tile of background.tiles) {
    expect(tile).toEqual(background.tiles[0]);
    expect(tile.direction).toBe(1);
    expect(tile.mask).toContain('linear-gradient');
  }
  for (const frame of background.frames) {
    expect(frame[0]!.left).toBeLessThanOrEqual(0);
    expect(frame.at(-1)!.right).toBeGreaterThanOrEqual(1);
    for (const [index, tile] of frame.entries()) {
      expect(tile.right - tile.left).toBeCloseTo(1.25, 3);
      expect(tile.top).toBeCloseTo(0, 3);
      expect(tile.bottom).toBeCloseTo(1, 3);
      if (index > 0) expect(frame[index - 1]!.right - tile.left).toBeCloseTo(.25, 3);
    }
  }
  const [start, middle, end, wrapped] = background.frames;
  expect(middle![0]!.left - start![0]!.left).toBeCloseTo(.5, 3);
  expect(end![0]!.left - start![0]!.left).toBeCloseTo(1, 3);
  // The same, unmirrored artwork occupies the same visible rectangles on
  // either side of the wrap; the remaining copies are outside the scene.
  expect(start![0]!.right).toBeCloseTo(0, 3);
  expect(end![2]!.left).toBeGreaterThanOrEqual(1);
  for (const index of [0, 1]) {
    expect(end![index]!.left).toBeCloseTo(start![index + 1]!.left, 3);
    expect(end![index]!.right).toBeCloseTo(start![index + 1]!.right, 3);
  }
  expect(wrapped).toEqual(start);
}

for (const config of [
  { width: 1280, height: 720, zoom: 100, model: 'heron-p' },
  { width: 844, height: 390, zoom: 150, model: 'diamond-da40' },
  { width: 667, height: 375, zoom: 75, model: 'heron-p' },
]) test(`title and real ${config.model} share motion at ${config.width}/${config.zoom}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize(config);
  await page.addInitScript(zoom => localStorage.setItem('china-airlines:ui-scale:v1', String(zoom)), config.zoom);
  // Freeze only business time; CSS animation and rendering continue normally.
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto('./');
  const title = await motionSample(page.locator('.start-aircraft'));
  expect(title.timing).toEqual(['4.8s', 'ease-in-out', 'infinite']);
  expect(title.running).toBe('running');
  expect(title.poses[1]!.x).toBeCloseTo(0, 5);
  expect(title.poses[1]!.y).toBeCloseTo(-7, 5);
  expect(title.poses[0]!.transform).not.toBe(title.poses[1]!.transform);
  expect(title.poses[0]).toEqual(title.poses[2]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.start-aircraft')).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expect(page.locator('.start-flight-sky .flight-clouds-near')).toHaveCSS('animation-name', 'flight-cloud-drift');
  await expect(page.locator('.start-flight-sky .flight-panorama')).toHaveCSS('animation-name', 'flight-cloud-drift');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.start-aircraft')).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expectPanoramaLoop(page.locator('.start-flight-sky .flight-panorama'));

  const core = new GameCore(NOW);
  if (config.model === 'diamond-da40') core.execute({ type: 'buy', modelId: config.model, airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
  const id = config.model === 'diamond-da40' ? 'AC0002' : 'AC0001';
  core.execute({ type: 'dispatch', planeId: id, to: 'PVG', auto: false }, NOW);
  await page.getByRole('button', { name: '进入游戏', exact: true }).click();
  await importState(page, core.snapshot());
  await page.getByRole('button', { name: '机场装载', exact: true }).click();
  if (id === 'AC0002') await page.getByRole('button', { name: '下一架飞机', exact: true }).click();
  await expect(page.locator('.plane-status')).toContainText(id);
  await expect(page.getByTestId('aircraft-sprite')).toHaveAttribute('href', new RegExp(`aircraft-${config.model}-exterior-v8\\.png$`));
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
    const samples = [0, 1200, 2400, 3600, 4800].map(time => {
      animation.currentTime = time;
      const sprite = image.getBoundingClientRect(), frame = stage.getBoundingClientRect();
      return { left: sprite.left - frame.left, top: sprite.top - frame.top,
        right: frame.right - sprite.right, bottom: frame.bottom - sprite.bottom };
    });
    animation.play();
    return samples;
  });
  for (const sample of bounds) for (const inset of Object.values(sample)) expect(inset).toBeGreaterThanOrEqual(0);
  await expect(page.locator('.is-flying .flight-clouds-near')).toHaveCSS('animation-duration', '12s');
  await expect(page.locator('.is-flying .flight-clouds-far')).toHaveCSS('animation-duration', '24s');
  await expect(page.locator('.is-flying .flight-sky')).toHaveCSS('pointer-events', 'none');
  // Seek actual composited cloud strips: they travel towards the tail (right),
  // and each repetition moves exactly one image width with no empty seam.
  for (const depth of ['near', 'far']) {
    const clouds = await page.locator(`.is-flying .flight-clouds-${depth}`).evaluate(element => {
      const animation = element.getAnimations()[0]!;
      const duration = Number(animation.effect!.getTiming().duration);
      const delay = Number(animation.effect!.getTiming().delay);
      animation.pause();
      const samples = [0, .5, .999].map(fraction => {
        animation.currentTime = delay + duration * fraction;
        return new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
      });
      const tile = element.querySelector('img')!.clientWidth;
      animation.play();
      return { samples, tile };
    });
    expect(clouds.samples[0]).toBeCloseTo(0);
    expect(clouds.samples[1]).toBeCloseTo(clouds.tile / 2, 0);
    expect(clouds.samples[2]).toBeCloseTo(clouds.tile * .999, 0);
  }
  const panorama = page.locator('.is-flying .flight-panorama');
  await expectPanoramaLoop(panorama);
  // Observe normal playback too: a seekable animation alone did not establish
  // that the dominant painted cloud bank actually moves during live play.
  await expectCloudPlayback(panorama);
  await page.getByRole('button', { name: '机队管理', exact: true }).click();
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  for (const layer of ['near', 'far']) await expect(page.locator(`.is-flying .flight-clouds-${layer}`)).toHaveCSS('animation-name', 'flight-cloud-drift');
  await expect(panorama).toHaveCSS('animation-name', 'flight-cloud-drift');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  expect(await exportState(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/shared-flight-motion-${config.model}-${config.width}-${config.zoom}.png` });
  expect(errors).toEqual([]);
});

test('flight motion stays on in reduced-motion previews after refresh without changing the flight', async ({ page }) => {
  await prepareAirportSession(page);
  await page.clock.setFixedTime(new Date(NOW));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // A value left by the briefly available preference must have no effect.
  await page.addInitScript(() => localStorage.setItem('china-airlines:flight-motion:v1', 'off'));
  await page.goto('./');
  const core = new GameCore(NOW);
  core.execute({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: false }, NOW);
  await importState(page, core.snapshot());
  const before = await exportState(page), sky = page.locator('.is-flying .flight-panorama');
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expectCloudPlayback(sky);
  await page.reload();
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expect(sky).toHaveCSS('animation-name', 'flight-cloud-drift');
  expect(await exportState(page)).toEqual(before);
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await expect(page.getByLabel('飞行动画', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(sky).toHaveCSS('animation-name', 'flight-cloud-drift');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(sky).toHaveCSS('animation-name', 'flight-cloud-drift');
  expect(await exportState(page)).toEqual(before);
});

test('real departure, offline reload and arrival do not depend on animation callbacks', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await prepareAirportSession(page);
  await page.clock.install({ time: new Date(NOW) });
  await page.clock.pauseAt(new Date(NOW + 1000));
  const core = new GameCore(NOW);
  core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  const state = core.snapshot(), flight = quote(state, state.fleet[0]!, 'PVG');
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
  await importState(page, state);
  await expect(cruise(page)).toHaveCount(0);
  await page.getByRole('button', { name: '制定航线', exact: true }).click();
  await selectCity(page, 'PVG'); await launchRoute(page);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '制定航线', exact: true })).toHaveCount(0);
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost));
  await expect(page.getByTestId('airport-scene')).toHaveAttribute('data-flight-phase', 'climb');
  expect(await page.locator('.flight-attitude').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).b)).toBeGreaterThan(0);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload();
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  const images = await page.locator('.is-flying .flight-sky img').evaluateAll(async elements => Promise.all(elements.map(async element => {
    const image = element as HTMLImageElement; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  })));
  expect(images).toHaveLength(7);
  expect(images.every(image => image.width >= 1024 && image.height >= 512)).toBe(true);
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost));
  await page.clock.fastForward(Math.ceil(flight.duration * .5) * 1000);
  await expect(page.getByTestId('airport-scene')).toHaveAttribute('data-flight-phase', 'cruise');
  await page.clock.fastForward(Math.ceil(flight.duration * .4) * 1000);
  await expect(page.getByTestId('airport-scene')).toHaveAttribute('data-flight-phase', 'approach');
  await expect.poll(() => page.locator('.flight-attitude').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).b)).toBeLessThan(0);
  await page.reload();
  await expect(page.getByTestId('airport-scene')).toHaveAttribute('data-flight-phase', 'approach');
  await page.locator('.flight-attitude').dispatchEvent('animationend');
  await page.locator('.flight-attitude').dispatchEvent('transitionend');
  await expect(page.getByTestId('flights-count')).toHaveText('0 班');
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(cruise(page)).toHaveCSS('animation-name', 'start-aircraft-cruise');
  // Manually stop visual playback to prove that settlement still only uses time.
  await page.locator('.is-flying').evaluate(element => element.getAnimations({ subtree: true }).forEach(animation => animation.pause()));
  await page.clock.fastForward((flight.duration + 10) * 1000);
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  const resume = page.getByRole('button', { name: '继续经营', exact: true });
  if (await resume.isVisible()) await resume.click();
  await expect(cruise(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '制定航线', exact: true })).toBeVisible();
  await expect(page.getByTestId('aircraft-cabin')).toBeVisible();
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost + flight.revenue));
  await page.reload();
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits - flight.cost + flight.revenue));
  expect(errors).toEqual([]);
});
