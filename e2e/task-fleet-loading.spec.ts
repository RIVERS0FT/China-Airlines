import { test, expect, type Page } from '@playwright/test';
import { GameCore, waiting, validateSave, type GameState } from '../src/core/game.js';
import { displayScale } from './display-helpers.js';
const NOW = Date.parse('2026-09-13T02:00:00Z'), ID = 'AC0001';
async function setup(page: Page, state?: GameState) {
  await page.clock.install({ time: new Date(NOW) });
  await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  if (state) {
    validateSave(state);
    await page.getByRole('button', { name: '存档设置', exact: true }).click();
    page.once('dialog', dialog => void dialog.accept());
    await page.getByLabel('选择存档文件').setInputFiles({ name: 'task-fleet-loading.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
    await expect(page.getByTestId('credits')).toHaveText(`¥ ${state.credits.toLocaleString('zh-CN')}`);
    await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  }
}
function mixed() {
  const core = new GameCore(NOW);
  const people = waiting(core.snapshot(), 'PEK').filter(o => o.kind === 'passengers');
  for (const order of people.slice(1, 4)) core.execute({ type: 'load', planeId: ID, orderId: order.id }, NOW);
  return core.snapshot();
}

test('one task entrance claims the initial gift exactly once and retains the aircraft and state filters', async ({ page }) => {
  await setup(page);
  const entry = page.getByRole('button', { name: '任务中心', exact: true });
  await expect(entry).toHaveCount(1); await expect(entry).toContainText('可领取 1');
  await expect(page.locator('.airport-shortcuts')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('button')).toHaveCount(6);
  for (const name of ['运营任务', '奖励', '航班', '改装']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  const selected = await page.locator('.plane-status').textContent(), credits = await page.getByTestId('credits').textContent();
  await entry.click();
  await expect(page.getByRole('tab', { name: /^可领取/ })).toHaveAttribute('aria-selected', 'true');
  const gift = page.locator('[data-task-id="checkin-0"]');
  await gift.getByRole('button', { name: '领取奖励', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^可领取/ })).toContainText('0');
  await expect(page.getByRole('tab', { name: /^可领取/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: /^已领取/ })).toHaveAttribute('aria-selected', 'true');
  await expect(gift.getByRole('button', { name: '已领取', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '关闭任务中心', exact: true }).click();
  await expect(page.locator('.plane-status')).toHaveText(selected!);
  await expect(page.getByTestId('credits')).toHaveText(credits!);
  await expect(page.getByRole('button', { name: '经营中心', exact: true })).toContainText('29 券');
  await expect(entry).not.toContainText('可领取');
  await page.reload(); await entry.click();
  await expect(page.getByRole('tab', { name: /^进行中/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /^已领取/ }).click();
  await expect(gift.getByRole('button', { name: '已领取', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/unified-task-center.png' });
});

test('flight inspection opens aircraft details without modifying the flight or unloading its manifest', async ({ page }) => {
  const core = new GameCore(NOW);
  core.execute({ type: 'load-destination', planeId: ID, to: 'PVG' }, NOW);
  core.execute({ type: 'dispatch', planeId: ID, to: 'PVG', auto: false }, NOW);
  const state = core.snapshot(); await setup(page, state);
  const scene = await page.locator('.plane-status').textContent();
  await page.getByRole('button', { name: '机队管理概览', exact: true }).click();
  await expect(page.getByRole('tab', { name: '航班', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: `查看${ID}飞机`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: '机队管理', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '飞机', exact: true })).toBeFocused();
  await expect(page.locator('.hangar-selector [aria-pressed=true]')).toContainText(ID);
  await expect(page.getByRole('button', { name: '升级舱位扩充', exact: true })).toBeDisabled();
  await page.locator('.fleet-manifest summary').click();
  await expect(page.getByTestId('fleet-onboard-order')).toHaveCount(5);
  for (const item of await page.getByTestId('fleet-onboard-order').all()) {
    await expect(item).toContainText('已装机'); await expect(item).toContainText('飞行中，不能装卸');
  }
  await page.getByRole('button', { name: '前往这架飞机', exact: true }).click();
  await expect(page.locator('.plane-status')).toHaveText(scene!);
  await expect(page.getByTestId('credits')).toHaveText(`¥ ${state.credits.toLocaleString('zh-CN')}`);
});

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]]) test(`three loading states remain distinct and update in place at ${width}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: width!, height: height! }); await setup(page, mixed());
  const board = page.getByRole('region', { name: '客货列表', exact: true });
  await expect(page.locator('[data-load-state=loaded]')).toHaveCount(3);
  const plates: string[] = [];
  for (const [state, label] of [['loaded', '已装机'], ['waiting', '待装机'], ['blocked', '不可装']]) {
    const card = page.locator(`[data-load-state=${state}]`).first();
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.job-state')).toHaveText(label!);
    if (state === 'blocked') { await expect(card).toBeDisabled(); await expect(card.locator('.job-action')).toHaveText('剩余客舱不足'); }
    else await expect(card).toBeEnabled();
    const scale = await displayScale(page), plate = (await card.locator('.job-info').boundingBox())!;
    for (const cls of ['.job-price', '.job-state', '.job-action']) {
      const text = (await card.locator(cls).boundingBox())!;
      expect(text.x).toBeGreaterThanOrEqual(plate.x - 1); expect(text.x + text.width).toBeLessThanOrEqual(plate.x + plate.width + 1);
      expect(text.y + text.height).toBeLessThanOrEqual(plate.y + plate.height + 1);
    }
    expect(await card.locator('.job-state').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
    expect(plate.height / scale).toBeGreaterThan(55);
    plates.push(await card.locator('.job-info').evaluate(el => getComputedStyle(el).backgroundColor));
  }
  expect(new Set(plates).size).toBe(3);
  const blockedId = await page.locator('[data-load-state=blocked]').first().getAttribute('data-order-id');
  const loaded = page.getByTestId('loaded-order').first(), id = await loaded.getAttribute('data-order-id');
  await loaded.scrollIntoViewIfNeeded();
  const before = (await loaded.boundingBox())!;
  await loaded.click();
  const same = page.locator(`[data-order-id="${id}"]`);
  await expect(same).toHaveAttribute('data-load-state', 'waiting');
  await expect(same.locator('.job-transfer-tag')).toHaveText('中转保留');
  expect(Math.abs((await same.boundingBox())!.x - before.x)).toBeLessThan(2);
  await expect(page.locator(`[data-order-id="${blockedId}"]`)).toHaveAttribute('data-load-state', 'waiting');
  await same.click(); await expect(same).toHaveAttribute('data-load-state', 'loaded');
  await expect(page.locator(`[data-order-id="${blockedId}"]`)).toHaveAttribute('data-load-state', 'blocked');
  await board.focus(); await page.keyboard.press('Home');
  await page.screenshot({ path: `artifacts/loading-three-states-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('pointer drag cannot load an order and does not swallow a subsequent keyboard activation', async ({ page }) => {
  await setup(page);
  const card = page.getByTestId('waiting-order').first(), id = await card.getAttribute('data-order-id');
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .6);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .8, box.y + box.height * .6, { steps: 5 }); await page.mouse.up();
  await expect(page.getByTestId('loaded-order')).toHaveCount(0);
  await card.focus(); await page.keyboard.press('Enter');
  await expect(page.locator(`[data-order-id="${id}"]`)).toHaveAttribute('data-load-state', 'loaded');
  await page.getByTestId('loaded-order').click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(0);
});
