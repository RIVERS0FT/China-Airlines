import { test, expect, type Page } from '../helpers/configured-airport.js';
import { GameCore, orderReward, validateSave, type GameState } from '../helpers/configured-game.js';

const NOW = Date.parse('2026-09-27T02:00:00Z'), PLANE = 'AC0001';

function interleavedOrders() {
  const funding = new GameCore(NOW).snapshot();
  funding.credits = 100000;
  const core = new GameCore(NOW, funding);
  core.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
  core.execute({ type: 'buy', modelId: 'swift-f', airportId: 'PEK', passengers: 1, cargo: 0 }, NOW);
  const state = core.snapshot();
  // A full queue must overflow even the wide logical viewport on mobile landscape.
  const initial = state.orders.filter(order => order.location === 'PEK');
  for (let index = initial.length; index < 24; index++) {
    state.orders.push({ ...initial[index % initial.length]!, id: `JB${state.nextOrderId++}` });
  }
  const orders = state.orders.filter(order => order.location === 'PEK')
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id, undefined, { numeric: true }));
  orders.forEach((order, index) => {
    order.to = index % 2 ? 'WUH' : 'PVG';
    order.reward = orderReward(order.from, order.to, order.kind, order.amount, order.service);
  });
  validateSave(state);
  return { state, oldest: orders[0]!.id };
}

async function importFixture(page: Page, state: GameState, now = NOW) {
  validateSave(state);
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now + 1000));
  await page.goto('./');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({
    name: 'order-refresh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.getByRole('dialog', { name: '本地存档与设置', exact: true })).toContainText('存档导入成功');
  await expect(page.getByTestId('fleet-count')).toHaveText(`${state.fleet.length} 架`);
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.getByRole('button', { name: '关闭提示', exact: true }).click();
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`order refresh preserves destination order, scroll anchor and existing nodes at ${viewport.width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    const { state, oldest } = interleavedOrders();
    await importFixture(page, state);
    const board = page.getByRole('region', { name: '客货列表', exact: true });
    const stations = board.locator('.destination-station');
    await expect(stations).toHaveText(['上海', '武汉']);

    // Remove the oldest member of the first destination while both groups survive.
    await board.locator(`[data-order-id="${oldest}"]`).click();
    const loaded = page.getByTestId('aircraft-cabin').locator(`[data-order-id="${oldest}"]`);
    await expect(loaded).toHaveAttribute('data-testid', 'loaded-order');
    await expect(stations).toHaveText(['上海', '武汉']);
    await expect(board.getByRole('group', { name: '前往上海的客货', exact: true }).getByTestId('waiting-order')).toHaveCount(11);

    // Changing aircraft at one airport must retain this shared waiting-list position.
    await board.focus();
    await page.keyboard.press('End');
    await expect.poll(() => board.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
    const offset = await board.evaluate(el => el.scrollLeft);
    const orderIds = await board.getByTestId('waiting-order').evaluateAll(elements => elements.map(el => el.getAttribute('data-order-id')));
    await page.getByRole('button', { name: '下一架飞机', exact: true }).click();
    await expect(page.locator('.plane-status')).toContainText('AC0002');
    expect(Math.abs(await board.evaluate(el => el.scrollLeft) - offset)).toBeLessThanOrEqual(2);
    expect(await board.getByTestId('waiting-order').evaluateAll(elements => elements.map(el => el.getAttribute('data-order-id')))).toEqual(orderIds);
    await page.getByRole('button', { name: '上一架飞机', exact: true }).click();
    await expect(page.locator('.plane-status')).toContainText(PLANE);
    expect(Math.abs(await board.evaluate(el => el.scrollLeft) - offset)).toBeLessThanOrEqual(2);

    // Returning an early order inserts before the viewport; keep a surviving card fixed.
    const anchor = await board.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const card = [...el.querySelectorAll<HTMLElement>('[data-order-id]:not(:disabled)')]
        .find(item => item.getBoundingClientRect().left >= bounds.left && item.getBoundingClientRect().right <= bounds.right)!;
      return { id: card.dataset.orderId!, left: card.getBoundingClientRect().left };
    });
    const surviving = board.locator(`[data-order-id="${anchor.id}"]`);
    const originalNode = await surviving.elementHandle();
    expect(originalNode).not.toBeNull();
    const originalClip = await surviving.locator('clipPath').getAttribute('id');
    await loaded.click();
    await expect(board.locator(`[data-order-id="${oldest}"]`)).toHaveCount(1);
    await expect(loaded).toHaveCount(0);
    await expect(stations).toHaveText(['上海', '武汉']);
    await expect.poll(async () => Math.abs((await surviving.boundingBox())!.x - anchor.left)).toBeLessThanOrEqual(2);
    expect(await originalNode!.evaluate((node, id) => node.isConnected && node === document.querySelector(`.order-strip [data-order-id="${id}"]`), anchor.id)).toBe(true);
    await expect(surviving.locator('clipPath')).toHaveAttribute('id', originalClip!);

    // Repeated clock publications alone must preserve the actual node, art ID and focus.
    await expect(surviving).toBeEnabled();
    await surviving.focus();
    const beforeTick = await board.evaluate(el => el.scrollLeft);
    await page.clock.runFor(2000);
    expect(await originalNode!.evaluate((node, id) => node.isConnected && node === document.querySelector(`.order-strip [data-order-id="${id}"]`), anchor.id)).toBe(true);
    await expect(surviving.locator('clipPath')).toHaveAttribute('id', originalClip!);
    await expect(surviving).toBeFocused();
    expect(Math.abs(await board.evaluate(el => el.scrollLeft) - beforeTick)).toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
  });
}

test('turnaround completion refreshes loading permission without replacing the waiting card', async ({ page }) => {
  const core = new GameCore(NOW);
  core.execute({ type: 'load-destination', planeId: PLANE, to: 'PVG' }, NOW);
  core.execute({ type: 'dispatch', planeId: PLANE, to: 'PVG', auto: false }, NOW);
  const arrival = core.snapshot().fleet[0]!.flight!.arriveAt;
  core.tick(NOW + arrival * 1000);
  const state = core.snapshot(), remaining = state.fleet[0]!.readyAt - state.simTime;
  expect(remaining).toBeGreaterThan(0);
  await importFixture(page, state, NOW + arrival * 1000);
  await expect(page.locator('.gate-sign')).toContainText('上海航空港');
  const card = page.getByTestId('waiting-order').first();
  await expect(card).toBeDisabled();
  await expect(card).toHaveAccessibleName(/地面周转中/);
  const id = await card.getAttribute('data-order-id');
  const originalNode = await card.elementHandle(), originalClip = await card.locator('clipPath').getAttribute('id');
  await page.clock.runFor(remaining * 1000 - 250);
  await expect(card).toBeDisabled();
  await page.clock.runFor(500);
  await expect(card).toBeEnabled();
  await expect(card).not.toHaveAccessibleName(/地面周转中/);
  expect(await originalNode!.evaluate((node, orderId) => node.isConnected && node === document.querySelector(`.order-strip [data-order-id="${orderId}"]`), id)).toBe(true);
  await expect(card.locator('clipPath')).toHaveAttribute('id', originalClip!);
  await card.click();
  await expect(page.getByTestId('aircraft-cabin').locator(`[data-order-id="${id}"]`)).toHaveAttribute('data-testid', 'loaded-order');
});
