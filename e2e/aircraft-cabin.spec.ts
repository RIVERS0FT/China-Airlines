import { test, expect, type Page } from './fixture.js';
import { GameCore, manifest, orderReward, validateSave, type GameState } from '../src/core/game.js';
import { readFile } from 'node:fs/promises';

import { passengerFrame } from '../src/ui/passenger-art.js';

const NOW = 1_800_000_000_000;
async function start(page: Page, state?: GameState) {
  await page.clock.install({ time: new Date(NOW) });
  await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./');
  await expect(page.getByTestId('aircraft-cabin')).toBeVisible();
  if (!state) return;
  validateSave(state);
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'cabin.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByRole('status').filter({ hasText: '存档导入成功' })).toBeVisible();
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
}
async function exported(page: Page): Promise<GameState> {
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const state = JSON.parse(await readFile((await (await download).path())!, 'utf8')) as GameState;
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  return state;
}

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  for (const zoom of [75, 100, 125, 150]) test(`real cabin stays inside the aircraft at ${width}x${height} / ${zoom}%`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(zoom => localStorage.setItem('china-airlines:ui-scale:v1', String(zoom)), zoom);
    await start(page);
    await expect(page.locator('.ground-props')).toHaveCount(0);
    await expect(page.locator('.apron-queue .job-state')).toHaveCount(0);
    const shadow = await page.getByTestId('waiting-order').first().locator('.job-figure').evaluate(el => {
      const style = getComputedStyle(el, '::after');
      return { border: style.borderTopWidth, image: style.backgroundImage, color: style.backgroundColor };
    });
    expect(shadow.border).toBe('0px'); expect(shadow.color).toBe('rgba(0, 0, 0, 0)'); expect(shadow.image).toContain('radial-gradient');
    await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 3 / 3 人');
    await expect(page.getByTestId('cabin-passengers').locator('header strong')).toContainText('3/3');
    await expect(page.getByTestId('cabin-cargo').locator('header strong')).toContainText('2/2');
    await expect(page.getByTestId('plane-art')).toHaveAttribute('data-facing', 'left');
    expect(await page.locator('.cutaway-airframe, .cabin-place-art, .cabin-seat-front, .cabin-room-art').evaluateAll(elements => elements.every(el => new DOMMatrix(getComputedStyle(el).transform).a === 1))).toBe(true);
    expect(await page.locator('.cutaway-airframe, .cabin-place-art, .cabin-seat-front, .cabin-room-art').evaluateAll(elements => elements.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await page.locator('.job-art[data-passenger-variant], .job-art[data-cargo-type]').evaluateAll(elements => elements.every(el => new DOMMatrix(getComputedStyle(el).transform).a === 1))).toBe(true);
    for (const sprite of await page.locator('.cabin-passengers .job-art').all()) await expect(sprite).toHaveAttribute('data-pose', 'seated');
    for (const sprite of await page.locator('.apron-queue .job-art[data-passenger-variant]').all()) await expect(sprite).toHaveAttribute('data-pose', 'standing');
    expect(await page.locator('.cabin-order .job-info, .cabin-deck header').evaluateAll(elements => elements.every(el => getComputedStyle(el).transform === 'none'))).toBe(true);
    await page.getByRole('button', { name: '查看机上客货', exact: true }).click({ trial: true });
    for (const header of await page.locator('.cabin-deck>header').all()) {
      const box = (await header.boundingBox())!;
      expect(await header.evaluate(el => {
        const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.x + 15, b.y + b.height / 2);
        return !!hit && el.contains(hit);
      })).toBe(true);
      expect(box.y + box.height).toBeLessThan((await page.getByTestId('airport-scene').boundingBox())!.y + (await page.getByTestId('airport-scene').boundingBox())!.height);
    }
    const frame = (await page.getByTestId('plane-art').boundingBox())!;
    const cabin = (await page.getByTestId('aircraft-cabin').boundingBox())!;
    for (const floorPlane of await page.locator('.cabin-floor-plane').all()) {
      const geometry = await floorPlane.evaluate(el => {
        const svg = el as SVGSVGElement, view = svg.viewBox.baseVal;
        return { xScale: svg.clientWidth / view.width, yScale: svg.clientHeight / view.height,
          oldFloorImage: !!svg.parentElement!.querySelector('img.cabin-room-art') };
      });
      expect(Math.abs(geometry.xScale - geometry.yScale)).toBeLessThan(.03);
      expect(geometry.oldFloorImage).toBe(false);
    }
    expect(cabin.x).toBeGreaterThan(frame.x); expect(cabin.x + cabin.width).toBeLessThan(frame.x + frame.width);
    expect(cabin.y).toBeGreaterThan(frame.y); expect(cabin.y + cabin.height).toBeLessThan(frame.y + frame.height);
    for (const card of await page.getByTestId('loaded-order').all()) {
      const box = (await card.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(cabin.y); expect(box.y + box.height).toBeLessThanOrEqual(cabin.y + cabin.height);
      const scale = await page.getByTestId('game-layout').getAttribute('data-screen-scale');
      // Both image and caption activate the full-height card; stacked decks
      // use an inline caption on short screens without shrinking touch targets.
      expect(box.height / Number(scale)).toBeGreaterThanOrEqual(44);
      const anchor = card.locator('..'), furniture = (await anchor.locator('.cabin-place-art').boundingBox())!;
      const floor = (await card.locator('xpath=ancestor::section[contains(@class,"cabin-deck")]').locator('.cabin-room-floor').boundingBox())!;
      const occupant = (await card.locator('.job-art').boundingBox())!;
      const furnitureBase = furniture.y + furniture.height;
      expect(furnitureBase).toBeGreaterThan(floor.y);
      expect(furnitureBase).toBeLessThan(floor.y + floor.height);
      if (await card.locator('.job-art').getAttribute('data-pose') === 'seated') {
        const seat = Number(await anchor.getAttribute('data-seat-cushion-y'));
        const hip = Number(await anchor.getAttribute('data-passenger-hip-y'));
        const foot = Number(await anchor.getAttribute('data-passenger-foot-y'));
        const ground = Number(await anchor.getAttribute('data-floor-y'));
        expect(Math.abs(hip - seat)).toBeLessThan(.01);
        expect(Math.abs(foot - ground)).toBeLessThan(.01);
        await expect(anchor.locator('.cabin-seat-front')).toHaveCount(0);
        await expect(anchor.locator('.cabin-place-art')).toHaveAttribute('src', /cabin-seat-v3\.png$/);
        const anatomy = passengerFrame((await card.getAttribute('data-order-id'))!, 'seated').anchors;
        // Check rendered pixels as well as model metadata: CSS offsets/scaling
        // must preserve the actual hip-to-cushion contact in both axes.
        expect(Math.abs(occupant.x + occupant.width * anatomy.hipX - (furniture.x + furniture.width * 305 / 678))).toBeLessThan(1);
        expect(Math.abs(occupant.y + occupant.height * anatomy.hipY! - (furniture.y + furniture.height * 603 / 804))).toBeLessThan(1);
        expect(Math.abs(occupant.y + occupant.height * anatomy.footY - (furniture.y + furniture.height * 796 / 804))).toBeLessThan(1);
      } else {
        const palletTop = Number(await anchor.getAttribute('data-pallet-top-y'));
        const cargoBase = Number(await anchor.getAttribute('data-cargo-base-y'));
        expect(Math.abs(cargoBase - palletTop)).toBeLessThan(.01);
        expect(occupant.width).toBeLessThanOrEqual(furniture.width * .72 + 1);
        expect(occupant.y + occupant.height).toBeGreaterThan(furniture.y);
        expect(occupant.y + occupant.height).toBeLessThan(furnitureBase);
      }
      await card.click({ trial: true });
    }
    const first = page.getByTestId('loaded-order').first(), id = await first.getAttribute('data-order-id');
    const variant = await first.locator('.job-art').getAttribute('data-passenger-variant');
    const seatedView = await first.locator('.job-art').getAttribute('viewBox');
    await first.click();
    const ground = page.locator(`.apron-queue [data-order-id="${id}"]`);
    await expect(ground).toHaveCount(1);
    await expect(ground.locator('.job-art')).toHaveAttribute('data-passenger-variant', variant!);
    await expect(ground.locator('.job-art')).toHaveAttribute('data-pose', 'standing');
    await expect(ground.locator('.job-art')).not.toHaveAttribute('viewBox', seatedView!);
    await ground.focus(); await page.keyboard.press('Enter');
    await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"]`)).toHaveCount(1);
    await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"]`)).toBeEnabled();
    await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"] .job-art`)).toHaveAttribute('data-passenger-variant', variant!);
    await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"] .job-art`)).toHaveAttribute('data-pose', 'seated');
    await page.screenshot({ path: `artifacts/cabin-layers-${width}-${zoom}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('new loads reveal their cabin page; paging is read-only and saves restore real identities', async ({ page }) => {
  const core = new GameCore(NOW), state = core.snapshot(); state.fleet[0]!.upgrades.capacity = 4;
  await start(page, state);
  const first = page.getByTestId('waiting-order').first(), firstId = await first.getAttribute('data-order-id');
  await first.click();
  const deck = page.getByTestId('cabin-passengers');
  await deck.getByRole('button', { name: '下一页客舱' }).click();
  await expect(deck.getByTestId('loaded-order')).toHaveCount(0);
  const next = page.getByTestId('waiting-order').filter({ has: page.locator('.job-art[data-passenger-variant]') }).first();
  const nextId = await next.getAttribute('data-order-id'); await next.click();
  await expect(deck.locator(`[data-order-id="${nextId}"]`)).toBeVisible();
  await expect(deck.getByRole('button', { name: '上一页客舱' })).toBeDisabled();
  const before = await exported(page);
  await page.getByRole('group', { name: '机内乘客', exact: true }).focus(); await page.keyboard.press('End');
  await expect(deck.getByRole('button', { name: '下一页客舱' })).toBeDisabled();
  await page.getByRole('button', { name: '查看机上客货', exact: true }).click();
  await expect(page.getByRole('group', { name: '机内乘客', exact: true })).toBeFocused();
  expect(await exported(page)).toEqual(before);
  await page.reload();
  for (const id of [firstId, nextId]) await expect(deck.locator(`[data-order-id="${id}"]`)).toHaveCount(1);
});

for (const modelId of ['swift-p', 'swift-f']) test(`single compartment for ${modelId}`, async ({ page }) => {
  const state = new GameCore(NOW).snapshot(); state.fleet[0]!.modelId = modelId;
  await start(page, state);
  await expect(page.locator('.cabin-deck')).toHaveCount(1);
  await expect(page.getByTestId(modelId === 'swift-p' ? 'cabin-passengers' : 'cabin-cargo')).toBeVisible();
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(modelId === 'swift-p' ? 4 : 3);
});

test('current aggregate groups retain real quantities through cabin import and export', async ({ page }) => {
  const c=new GameCore(NOW);c.execute({type:'load-destination',planeId:'AC0001',to:'PVG'},NOW);
  const state=c.snapshot(),plane=state.fleet[0]!,jobs=manifest(state,plane.id).filter(o=>o.kind==='passengers');
  jobs[0]!.amount=3;jobs[0]!.reward=orderReward('PEK','PVG','passengers',3,jobs[0]!.service);state.orders=state.orders.filter(o=>!jobs.slice(1).includes(o));
  await start(page, state);
  await expect(page.getByTestId('cabin-passengers').locator('.job-quantity')).toHaveText('3人');
  await expect(page.getByTestId('cabin-passengers').locator('header strong')).toContainText('3/3');
  expect(manifest(await exported(page), plane.id)).toEqual(manifest(state, plane.id));
});

test('English cabin and offline unload restore the same order without a translation leak', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('china-airlines:locale:v1', 'en-US'));
  await page.goto('./');
  await page.getByTestId('waiting-order').first().click();
  await expect(page.getByTestId('loaded-order')).toBeEnabled();
  const id = await page.getByTestId('loaded-order').getAttribute('data-order-id');
  await expect(page.getByTestId('aircraft-cabin')).not.toContainText(/[\u3400-\u9fff]/);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload();
  expect(await page.locator('.cutaway-airframe, .cabin-place-art, .cabin-seat-front, .cabin-room-art').evaluateAll(elements => elements.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"]`)).toBeVisible();
  await expect(page.getByTestId('loaded-order').locator('.job-art')).toHaveAttribute('data-pose', 'seated');
  await page.getByTestId('loaded-order').click();
  await expect(page.locator(`.apron-queue [data-order-id="${id}"]`)).toBeEnabled();
  await page.reload();
  await expect(page.locator(`.apron-queue [data-order-id="${id}"]`)).toHaveCount(1);
  await expect(page.locator(`.apron-queue [data-order-id="${id}"] .job-art`)).toHaveAttribute('data-pose', 'standing');
});

for (const family of ['swift', 'heron', 'albatross', 'aurora']) for (const role of ['p', 'f', 'm']) {
  test(`layered cabin artwork and anchors for ${family}-${role}`, async ({ page }) => {
    const state = new GameCore(NOW).snapshot(); state.fleet[0]!.modelId = `${family}-${role}`;
    state.airports.find(a => a.id === state.fleet[0]!.airportId)!.level = 3;
    await start(page, state);
    await expect(page.getByTestId('plane-art')).toHaveAttribute('data-cabin-family', family === 'swift' ? 'light' : family === 'heron' ? 'regional' : 'heavy');
    await expect(page.locator('.cabin-deck')).toHaveCount(role === 'm' ? 2 : 1);
    await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
    const ids = await page.getByTestId('loaded-order').evaluateAll(elements => elements.map(el => el.getAttribute('data-order-id')));
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of await page.getByTestId('loaded-order').all()) {
      await expect(card.locator('..')).toHaveAttribute('data-anchor-id', /^(passengers|cargo)-\d+$/);
      await card.click({ trial: true });
    }
    expect(await page.locator('.cutaway-airframe, .cabin-place-art, .cabin-seat-front, .cabin-room-art').evaluateAll(elements => elements.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `artifacts/cabin-${family}-${role}.png` });
  });
}
