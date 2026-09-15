import { test, expect } from './fixture.js';
import { readFile } from 'node:fs/promises';
import { GameCore, orderReward, validateSave, type GameState } from '../src/core/game.js';
import { cargoAppearance } from '../src/ui/cargo-art.js';
import { CARGO_ART } from '../src/ui/cargo-art-catalog.js';

const NOW = 1_800_000_000_000;
for (const [width, height] of [[1440, 900], [667, 375]]) test(`reference cargo names and art survive real loading offline at ${width}`, async ({ page, context }) => {
  await page.setViewportSize({ width: width!, height: height! });
  await page.clock.install({ time: new Date(NOW) }); await page.clock.pauseAt(new Date(NOW + 1000));
  const state = new GameCore(NOW).snapshot(), cargo = state.orders.find(item => item.kind === 'cargo')!;
  const seen = new Set<string>(); state.orders = [];
  for (const service of ['general', 'express', 'cold', 'industrial']) for (let id = 100; id < 1100; id++) {
    const order = { ...cargo, id: `JB${id + ['general', 'express', 'cold', 'industrial'].indexOf(service) * 1100}`, service };
    order.reward = orderReward(order.from, order.to, order.kind, order.amount, service);
    const art = cargoAppearance(order);
    if (!seen.has(art.key)) { seen.add(art.key); state.orders.push(order); }
  }
  state.nextOrderId = 5000;
  expect(state.orders).toHaveLength(24); validateSave(state);
  await page.goto('./');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'cargo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  const cards = page.getByTestId('waiting-order');
  await expect(cards).toHaveCount(24);
  expect(new Set(await cards.locator('[data-cargo-type]').evaluateAll(elements => elements.map(el => el.getAttribute('data-cargo-type'))))).toEqual(new Set(Object.keys(CARGO_ART)));
  expect(new Set(await cards.locator('.cargo-name').allTextContents())).toEqual(new Set(Object.values(CARGO_ART).map(art => art.name)));
  const cold = state.orders.find(item => item.service === 'cold')!, industrial = state.orders.find(item => item.service === 'industrial')!;
  await expect(page.locator(`[data-order-id="${cold.id}"]`)).toBeDisabled();
  await expect(page.locator(`[data-order-id="${cold.id}"]`)).toHaveAccessibleName(/需要冷链货舱/);
  await expect(page.locator(`[data-order-id="${industrial.id}"]`)).toBeDisabled();
  await expect(page.locator(`[data-order-id="${industrial.id}"]`)).toHaveAccessibleName(/需要工业货舱/);
  const first = cards.first(), id = await first.getAttribute('data-order-id'), name = await first.locator('.cargo-name').textContent();
  const key = await first.locator('.job-art').getAttribute('data-cargo-type');
  await first.click();
  const aboard = page.getByTestId('loaded-order');
  await expect(aboard.locator('.job-art')).toHaveAttribute('data-cargo-type', key!);
  await expect(aboard).toHaveAccessibleName(new RegExp(name!));
  await page.screenshot({ path: `artifacts/cargo-categories-${width}.png` });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true); await page.reload();
  await expect(aboard.locator('.job-art')).toHaveAttribute('data-cargo-type', key!);
  await aboard.click();
  await expect(aboard).toHaveCount(0);
  await expect(page.locator(`[data-order-id="${id}"] .cargo-name`)).toHaveText(name!);
  await page.reload();
  await expect(page.locator(`[data-order-id="${id}"] .cargo-name`)).toHaveText(name!);
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const restored = JSON.parse(await readFile((await (await download).path())!, 'utf8')) as GameState;
  expect(restored.credits).toBe(state.credits);
  expect(restored.orders.find(order => order.id === id)).toEqual({ ...state.orders.find(order => order.id === id), expiresAt: null });
});
