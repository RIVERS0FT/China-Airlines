import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '../helpers/configured-airport.js';
import { GameCore, TURNAROUND, validateSave, waiting, type GameState } from '../helpers/configured-game.js';

const NOW = Date.parse('2026-09-13T02:00:00Z'), PLANE = 'AC0001';

function realTransfer() {
  const core = new GameCore(NOW);
  const passengers = waiting(core.snapshot(), 'PEK').filter(order => order.kind === 'passengers' && order.to === 'PVG').slice(0, 3);
  core.execute({ type: 'unlock', airportId: 'WUH' }, NOW);
  for (const order of passengers) core.execute({ type: 'load', planeId: PLANE, orderId: order.id }, NOW);
  core.execute({ type: 'dispatch', planeId: PLANE, to: 'WUH', auto: false }, NOW);
  const arrival = core.snapshot().fleet[0]!.flight!.arriveAt;
  core.tick(NOW + (arrival + TURNAROUND) * 1000);
  core.execute({ type: 'unload', planeId: PLANE, orderId: passengers[0]!.id }, core.snapshot().lastWallTime);
  const state = core.snapshot(), transfer = state.orders.find(order => order.id === passengers[0]!.id)!;
  const local = waiting(state, 'WUH').find(order => order.kind === 'passengers' && order.from === 'WUH')!;
  expect(transfer).toMatchObject({ from: 'PEK', to: 'PVG', location: 'WUH', expiresAt: null });
  expect(state.stats.revenue).toBe(0);
  return { state: validateSave(state), transfer, local };
}

async function importTransfer(page: Page, state: GameState) {
  await page.clock.install({ time: new Date(NOW) });
  await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'real-transfer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.locator('.settings-modal')).toContainText('存档导入成功');
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
}

async function exported(page: Page): Promise<GameState> {
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const state = JSON.parse(await readFile((await (await pending).path())!, 'utf8')) as GameState;
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  return state;
}

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  test(`real transfer tags stay readable when loading becomes blocked at ${width}`, async ({ page }) => {
    const { state, transfer, local } = realTransfer();
    await page.setViewportSize({ width, height }); await importTransfer(page, state);
    const target = page.locator(`.apron-queue [data-order-id="${transfer.id}"]`), tag = target.locator('.job-transfer-tag');
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeEnabled(); await expect(tag).toHaveText('中转');
    const appearance = () => tag.evaluate(element => {
      const style = getComputedStyle(element), parent = element.parentElement!, button = element.closest('button')!;
      const components = style.backgroundColor.match(/[\d.]+/g)!.map(Number);
      return { color: style.color, background: style.backgroundColor, alpha: components[3] ?? 1,
        textShadow: style.textShadow, opacity: style.opacity, parentOpacity: getComputedStyle(parent).opacity,
        buttonOpacity: getComputedStyle(button).opacity, filter: style.filter, fontSize: parseFloat(style.fontSize) };
    });
    const enabled = await appearance();
    expect(enabled).toMatchObject({ alpha: 1, textShadow: 'none', opacity: '1', parentOpacity: '1', buttonOpacity: '1', filter: 'none' });
    expect(enabled.fontSize).toBeGreaterThanOrEqual(10);
    expect(enabled.color).not.toBe(enabled.background);
    // Logical-canvas scaling can round the intersection by a tiny subpixel fraction.
    await expect(tag).toBeInViewport({ ratio: .999 });

    await page.locator(`.apron-queue [data-order-id="${local.id}"]`).click();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 3 / 3 人');
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeDisabled(); await expect(target).toHaveAccessibleName(/剩余客舱不足/);
    await expect(tag).toHaveText('中转'); await expect(tag).toBeInViewport({ ratio: .999 });
    expect(await appearance()).toEqual(enabled);
    await page.screenshot({ path: `artifacts/transfer-tag-blocked-${width}.png` });

    await page.locator(`.cabin-order[data-order-id="${local.id}"]`).click();
    await expect(page.locator(`.apron-queue [data-order-id="${local.id}"] .job-transfer-tag`)).toHaveCount(0);
    await expect(target).toBeEnabled(); await target.click();
    const aboard = page.locator(`.cabin-order[data-order-id="${transfer.id}"]`);
    await expect(aboard).toBeVisible(); await expect(aboard.locator('.job-transfer-tag')).toHaveCount(0);
    await aboard.click();
    await target.scrollIntoViewIfNeeded(); await expect(tag).toHaveText('中转'); await expect(target).toBeEnabled();
    expect(await appearance()).toEqual(enabled);
    const saved = await exported(page);
    expect(saved.orders).toEqual(state.orders.map(order => order.id === local.id ? { ...order, expiresAt: null } : order));
    expect(saved.credits).toBe(state.credits); expect(saved.stats).toEqual(state.stats);
    await page.reload(); await expect(target).toBeEnabled(); await expect(tag).toHaveText('中转');
    expect(await page.locator(`[data-order-id="${transfer.id}"]`).count()).toBe(1);
  });
}
