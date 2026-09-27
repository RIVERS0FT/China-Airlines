import { test, expect, type Page } from '../helpers/configured-airport.js';
import { GameCore, manifest, orderReward, validateSave, type GameState } from '../helpers/configured-game.js';
import { readFile } from 'node:fs/promises';

import { passengerFrame } from '../../src/ui/passenger-art.js';
import { ALL_MODELS, model } from '../../src/core/catalog.js';

const NOW = 1_800_000_000_000;
async function start(page: Page, state?: GameState) {
  await page.clock.install({ time: new Date(NOW) });
  await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./');
  await expect(page.getByTestId('aircraft-cabin')).toBeVisible();
  if (!state) return;
  await importCabin(page, state);
}
async function importCabin(page: Page, state: GameState) {
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

// Pair the three layout sizes with all four scale settings; display-scaling.spec.ts
// checks the scale behavior itself, so the full 3 × 4 cabin cross-product would
// largely repeat the same loading, geometry, and unloading assertions.
for (const [width, height, zoom] of [[1440, 900, 100], [844, 390, 75], [844, 390, 125], [667, 375, 150]] as const) {
  test(`real cabin stays inside the aircraft at ${width}x${height} / ${zoom}%`, async ({ page }) => {
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
    expect(await page.locator('.aircraft-exterior-art, .cabin-place-art').evaluateAll(elements => elements.every(el => new DOMMatrix(getComputedStyle(el).transform).a === 1))).toBe(true);
    expect(await page.locator('.aircraft-exterior-art').evaluateAll(elements => elements.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await expect(page.getByTestId('procedural-cabin-shell')).toBeVisible();
    expect(await page.locator('.job-art[data-passenger-variant], .job-art[data-cargo-type]').evaluateAll(elements => elements.every(el => new DOMMatrix(getComputedStyle(el).transform).a === 1))).toBe(true);
    for (const sprite of await page.locator('.cabin-passengers .job-art').all()) await expect(sprite).toHaveAttribute('data-pose', 'seated');
    for (const sprite of await page.locator('.apron-queue .job-art[data-passenger-variant]').all()) await expect(sprite).toHaveAttribute('data-pose', 'standing');
    expect(await page.locator('.cabin-order .job-info, .cabin-deck header').evaluateAll(elements => elements.every(el => getComputedStyle(el).transform === 'none'))).toBe(true);
    await page.getByRole('button', { name: '隐藏机舱', exact: true }).click({ trial: true });
    for (const header of await page.locator('.cabin-deck>header').all()) {
      const box = (await header.boundingBox())!;
      expect(await header.evaluate(el => {
        const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.x + 15, b.y + b.height / 2);
        return !!hit && el.contains(hit);
      })).toBe(true);
      expect(box.y + box.height).toBeLessThanOrEqual((await page.getByTestId('airport-scene').boundingBox())!.y + (await page.getByTestId('airport-scene').boundingBox())!.height + .5);
    }
    const frame = (await page.getByTestId('plane-art').boundingBox())!;
    const cabin = (await page.getByTestId('aircraft-cabin').boundingBox())!;
    await expect(page.locator('.cabin-floor-plane, .cabin-room-floor, .cabin-room-art, .cabin-room-wall')).toHaveCount(0);
    expect(await page.locator('.cabin-interior, .cabin-deck').evaluateAll(nodes => nodes.every(node => {
      const style = getComputedStyle(node);
      return style.backgroundImage === 'none' && style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderTopWidth === '0px';
    }))).toBe(true);
    expect(cabin.x).toBeGreaterThan(frame.x); expect(cabin.x + cabin.width).toBeLessThan(frame.x + frame.width);
    expect(cabin.y).toBeGreaterThan(frame.y); expect(cabin.y + cabin.height).toBeLessThan(frame.y + frame.height);
    for (const card of await page.getByTestId('loaded-order').all()) {
      const box = (await card.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(cabin.y); expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
      const scale = await page.getByTestId('game-layout').getAttribute('data-screen-scale');
      // Both image and caption activate the full-height card; stacked decks
      // use an inline caption on short screens without shrinking touch targets.
      expect(box.height / Number(scale)).toBeGreaterThanOrEqual(44);
      const anchor = card.locator('..'), furniture = (await anchor.locator('.cabin-place-art').boundingBox())!;
      const deckNode = card.locator('xpath=ancestor::section[contains(@class,"cabin-deck")]');
      const room = (await deckNode.boundingBox())!;
      const artScale = Number(await page.getByTestId('aircraft-canvas').getAttribute('data-art-scale')) * Number(scale);
      const ground = room.y + Number(await anchor.getAttribute('data-floor-y')) * artScale;
      const occupant = (await card.locator('.job-art').boundingBox())!;
      const furnitureBase = furniture.y + furniture.height;
      expect(furniture.y).toBeGreaterThanOrEqual(room.y - .5);
      expect(furnitureBase).toBeLessThanOrEqual(room.y + room.height + .5);
      expect(occupant.y).toBeGreaterThanOrEqual(room.y - .5);
      expect(occupant.y + occupant.height).toBeLessThanOrEqual(room.y + room.height + .5);
      const floorAnchor = await card.locator('.job-art').getAttribute('data-pose') === 'seated' ? 796 / 804 : 228 / 237;
      expect(Math.abs(furniture.y + furniture.height * floorAnchor - ground)).toBeLessThan(1);
      const caption = (await card.locator('.job-info').boundingBox())!;
      const anchorBox = (await anchor.boundingBox())!;
      expect(Math.abs(caption.x + caption.width / 2 - (anchorBox.x + anchorBox.width / 2))).toBeLessThan(1);
      expect(caption.y).toBeGreaterThanOrEqual(furniture.y + furniture.height - 1);
      expect(caption.y).toBeGreaterThanOrEqual(occupant.y + occupant.height - 1);
      expect(caption.y + caption.height).toBeLessThanOrEqual(box.y + box.height + .5);
      if (await card.locator('.job-art').getAttribute('data-pose') === 'seated') {
        const seat = Number(await anchor.getAttribute('data-seat-cushion-y'));
        const hip = Number(await anchor.getAttribute('data-passenger-hip-y'));
        const foot = Number(await anchor.getAttribute('data-passenger-foot-y'));
        const ground = Number(await anchor.getAttribute('data-floor-y'));
        expect(Math.abs(hip - seat)).toBeLessThan(.01);
        expect(Math.abs(foot - ground)).toBeLessThan(.01);
        await expect(anchor.locator('.cabin-seat-front')).toHaveCount(0);
        await expect(anchor.locator('.cabin-place-art')).toHaveClass(/cabin-seat-rear/);
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

test('all ten allocated seats stay visible and loading preserves real identities across reload', async ({ page }) => {
  const state = new GameCore(NOW).snapshot(); state.fleet[0]!.modelId = 'aurora-p'; state.fleet[0]!.allocation = { passengers: 10, cargo: 0 }; state.airports[0]!.level = 3;
  state.fleet[0]!.energy.availableSeconds = model('aurora-p').energy * 60;
  const core = new GameCore(NOW, validateSave(state));
  core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  core.execute({ type: 'refresh-demand', airportId: 'PEK' }, NOW);
  core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  const loaded = core.snapshot(), ids = manifest(loaded, 'AC0001').map(order => order.id);
  expect(ids).toHaveLength(10);
  await start(page, loaded);
  const deck = page.getByTestId('cabin-passengers');
  await expect(deck.locator('.cabin-anchor')).toHaveCount(10);
  await expect(deck.getByTestId('loaded-order')).toHaveCount(10);
  await expect(deck.locator('nav')).toHaveCount(0);
  for (const id of ids) {
    const card = deck.locator(`[data-order-id="${id}"]`);
    await expect(card).toBeInViewport({ ratio: 1 - 1e-6 });
    await card.click({ trial: true });
  }
  const firstId = ids[0]!;
  await deck.locator(`[data-order-id="${firstId}"]`).click();
  await expect(deck.getByTestId('loaded-order')).toHaveCount(9);
  await expect(deck.getByTestId('cabin-empty-place')).toHaveCount(1);
  const returned = page.locator(`.apron-queue [data-order-id="${firstId}"]`);
  await expect(returned.locator('.job-transfer-tag')).toHaveCount(0);
  await returned.click();
  await expect(deck.getByTestId('loaded-order')).toHaveCount(10);
  expect(manifest(await exported(page), 'AC0001')).toEqual(manifest(loaded, 'AC0001'));
  const before = await exported(page);
  await deck.locator('.cabin-place-art').first().evaluate(node => node.setAttribute('data-same-seat', 'true'));
  await page.getByRole('button', { name: '隐藏机舱', exact: true }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: '显示机舱', exact: true }).click();
  await expect(deck.getByTestId('loaded-order')).toHaveCount(10);
  await expect(deck.locator('.cabin-place-art').first()).toHaveAttribute('data-same-seat', 'true');
  await page.getByRole('group', { name: '机内乘客', exact: true }).focus();
  await expect(page.getByRole('group', { name: '机内乘客', exact: true })).toBeFocused();
  expect(await exported(page)).toEqual(before);
  await page.reload();
  for (const id of ids) await expect(deck.locator(`[data-order-id="${id}"]`)).toHaveCount(1);
  expect(manifest(await exported(page), 'AC0001')).toEqual(manifest(before, 'AC0001'));
});

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  test(`cabin allocation uses proportional slots and leaves unused capacity blank at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await start(page);
    for (const allocation of [{ passengers: 9, cargo: 1 }, { passengers: 1, cargo: 9 }, { passengers: 2, cargo: 1 }]) {
      const state = new GameCore(NOW).snapshot(), plane = state.fleet[0]!;
      plane.modelId = 'aurora-p'; plane.allocation = allocation; plane.energy.availableSeconds = model('aurora-p').energy * 60;
      state.airports[0]!.level = 3;
      await importCabin(page, state);
      const cabin = page.getByTestId('aircraft-cabin'), bounds = (await cabin.boundingBox())!;
      const unit = bounds.width / 10;
      await expect(cabin).toHaveAttribute('data-capacity', '10');
      await expect(cabin).toHaveAttribute('data-allocated', String(allocation.passengers + allocation.cargo));
      await expect(cabin.locator('.cabin-shell-windows > span')).toHaveCount(10);
      await expect(cabin.locator('.cabin-partition')).toHaveCount(1);
      await expect(cabin.locator('.cabin-anchor')).toHaveCount(allocation.passengers + allocation.cargo);
      await expect(cabin.getByTestId('cabin-empty-place')).toHaveCount(allocation.passengers + allocation.cargo);
      await expect(cabin.getByTestId('loaded-order')).toHaveCount(0);
      await expect(cabin.locator('nav')).toHaveCount(0);
      let offset = 0;
      for (const kind of ['passengers', 'cargo'] as const) {
        const deck = page.getByTestId(`cabin-${kind}`), box = (await deck.boundingBox())!;
        await expect(deck.locator('.cabin-anchor')).toHaveCount(allocation[kind]);
        expect(Math.abs(box.x - (bounds.x + offset * unit))).toBeLessThan(1);
        expect(Math.abs(box.width - allocation[kind] * unit)).toBeLessThan(1);
        for (const anchor of await deck.locator('.cabin-anchor').all()) {
          await expect(anchor).toBeInViewport({ ratio: 1 - 1e-6 });
          expect(Math.abs((await anchor.boundingBox())!.width - unit)).toBeLessThan(1);
        }
        offset += allocation[kind];
      }
      const last = (await page.getByTestId('cabin-cargo').boundingBox())!;
      expect(Math.abs(bounds.x + bounds.width - last.x - last.width - (10 - offset) * unit)).toBeLessThan(1);
      const unused = cabin.locator('.cabin-unallocated-space');
      await expect(unused).toHaveCount(offset < 10 ? 1 : 0);
      if (offset < 10) expect(Math.abs((await unused.boundingBox())!.width - (10 - offset) * unit)).toBeLessThan(1);
      expect((await exported(page)).fleet[0]!.allocation).toEqual(allocation);
      await page.screenshot({ path: `artifacts/cabin-proportions-${width}-${allocation.passengers}-${allocation.cargo}.png` });
    }
  });
}

for (const modelId of ['swift-p', 'swift-f']) test(`single compartment for ${modelId}`, async ({ page }) => {
  const state = new GameCore(NOW).snapshot(); state.fleet[0]!.modelId = modelId; state.fleet[0]!.allocation = modelId === 'swift-p' ? { passengers: 2, cargo: 0 } : { passengers: 0, cargo: 4 };
  state.fleet[0]!.energy.availableSeconds = model(modelId).energy * 60;
  // Isolate compartment capacity from randomly offered specialist freight.
  state.orders.filter(order => order.kind === "cargo").forEach(order => { order.service = "general"; });
  await start(page, state);
  await expect(page.locator('.cabin-deck')).toHaveCount(1);
  await expect(page.getByTestId(modelId === 'swift-p' ? 'cabin-passengers' : 'cabin-cargo')).toBeVisible();
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(modelId === 'swift-p' ? 2 : 4);
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
  expect(await page.locator('.aircraft-exterior-art').evaluateAll(elements => elements.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"]`)).toBeVisible();
  await expect(page.getByTestId('loaded-order').locator('.job-art')).toHaveAttribute('data-pose', 'seated');
  await page.getByTestId('loaded-order').click();
  await expect(page.locator(`.apron-queue [data-order-id="${id}"]`)).toBeEnabled();
  await page.reload();
  await expect(page.locator(`.apron-queue [data-order-id="${id}"]`)).toHaveCount(1);
  await expect(page.locator(`.apron-queue [data-order-id="${id}"] .job-art`)).toHaveAttribute('data-pose', 'standing');
});

for (const model of ALL_MODELS) {
  test(`procedural cabin and anchors for ${model.id}`, async ({ page }) => {
    const state = new GameCore(NOW).snapshot(); state.fleet[0]!.modelId = model.id; state.fleet[0]!.energy.availableSeconds = model.energy * 60;
    state.fleet[0]!.allocation = { passengers: Math.ceil(model.capacity / 2), cargo: Math.floor(model.capacity / 2) };
    state.airports.find(a => a.id === state.fleet[0]!.airportId)!.level = 3;
    await start(page, state);
    await expect(page.getByTestId('plane-art')).toHaveAttribute('data-cabin-family', model.family === 'swift' || model.family === 'diamond' ? 'light' : model.family === 'heron' ? 'regional' : 'heavy');
    await expect(page.locator('.cabin-deck')).toHaveCount(model.capacity > 1 ? 2 : 1);
    await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
    const ids = await page.getByTestId('loaded-order').evaluateAll(elements => elements.map(el => el.getAttribute('data-order-id')));
    expect(new Set(ids).size).toBe(ids.length);
    for (const card of await page.getByTestId('loaded-order').all()) {
      await expect(card.locator('..')).toHaveAttribute('data-anchor-id', /^(passengers|cargo)-\d+$/);
      await card.click({ trial: true });
    }
    expect(await page.locator('.aircraft-exterior-art').evaluateAll(elements => elements.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `artifacts/cabin-${model.id}.png` });
  });
}
