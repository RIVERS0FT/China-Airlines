import { test, expect, type Page } from './fixture.js';
import { GameCore, manifest, validateSave, type GameState } from '../src/core/game.js';
import { readFile } from 'node:fs/promises';
import legacy from '../tests/fixtures/v1-flying.json' with { type: 'json' };

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
    expect(await page.locator('.cutaway-airframe, .cabin-order img.job-art, .apron-queue img.job-art').evaluateAll(elements => elements.every(el => new DOMMatrix(getComputedStyle(el).transform).a === -1))).toBe(true);
    expect(await page.locator('.job-art[data-passenger-variant], .job-art[data-cargo-type]').evaluateAll(elements => elements.every(el => new DOMMatrix(getComputedStyle(el).transform).a === 1))).toBe(true);
    for (const sprite of await page.locator('.cabin-passengers .job-art').all()) await expect(sprite).toHaveAttribute('data-pose', 'seated');
    for (const sprite of await page.locator('.apron-queue .job-art[data-passenger-variant]').all()) await expect(sprite).toHaveAttribute('data-pose', 'standing');
    expect(await page.locator('.cabin-order .job-info, .cabin-deck header').evaluateAll(elements => elements.every(el => getComputedStyle(el).transform === 'none'))).toBe(true);
    await page.getByRole('button', { name: '查看机上客货', exact: true }).click({ trial: true });
    const frame = (await page.getByTestId('plane-art').boundingBox())!;
    const cabin = (await page.getByTestId('aircraft-cabin').boundingBox())!;
    expect(cabin.x).toBeGreaterThan(frame.x); expect(cabin.x + cabin.width).toBeLessThan(frame.x + frame.width);
    expect(cabin.y).toBeGreaterThan(frame.y); expect(cabin.y + cabin.height).toBeLessThan(frame.y + frame.height);
    for (const card of await page.getByTestId('loaded-order').all()) {
      const box = (await card.boundingBox())!, figure = (await card.locator('.job-figure').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(cabin.y); expect(box.y + box.height).toBeLessThanOrEqual(cabin.y + cabin.height);
      const scale = await page.getByTestId('game-layout').getAttribute('data-screen-scale');
      expect(figure.height / Number(scale)).toBeGreaterThan(44);
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
    await page.screenshot({ path: `artifacts/cabin-${width}-${zoom}.png` });
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

test('historical aggregate groups retain real quantities through cabin import and export', async ({ page }) => {
  const state = validateSave(legacy), plane = state.fleet[0]!;
  plane.flight = null; plane.autoRouteId = null; plane.energy.reservedSeconds = 0;
  await start(page, state);
  await expect(page.getByTestId('cabin-passengers').locator('.job-quantity')).toHaveText('56人');
  await expect(page.getByTestId('cabin-passengers').locator('header strong')).toContainText('56/70');
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
  await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"]`)).toBeVisible();
  await expect(page.getByTestId('loaded-order').locator('.job-art')).toHaveAttribute('data-pose', 'seated');
  await page.getByTestId('loaded-order').click();
  await expect(page.locator(`.apron-queue [data-order-id="${id}"]`)).toBeEnabled();
  await page.reload();
  await expect(page.locator(`.apron-queue [data-order-id="${id}"]`)).toHaveCount(1);
  await expect(page.locator(`.apron-queue [data-order-id="${id}"] .job-art`)).toHaveAttribute('data-pose', 'standing');
});
