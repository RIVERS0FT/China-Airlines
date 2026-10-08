import { test, expect, type Page } from '../helpers/configured-airport.js';
import { GameCore, type GameState } from '../helpers/configured-game.js';
import { exportCompany } from '../helpers/new-company.js';

const NOW = Date.parse('2026-09-29T00:00:00Z');
const DAY = 86_400_000;
function activeCompany() {
  const core = new GameCore(NOW);
  const send = (command: Parameters<GameCore['execute']>[0]) => core.execute(command, core.snapshot().lastWallTime);
  send({ type: 'tutorial', action: 'skip' });
  send({ type: 'hire-dispatcher', planeId: 'AC0001' });
  send({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' });
  send({ type: 'dispatch', planeId: 'AC0001', to: 'PVG', auto: true });
  core.tick(NOW + (core.snapshot().fleet[0]!.flight!.arriveAt + 8) * 1000);
  send({ type: 'open-business-team', airportId: 'PEK', kind: 'ticketing' });
  return core.snapshot();
}
function progress(state: GameState) {
  const { lastWallTime: _, business, ...rest } = state;
  const { wallPeak: __, ...earnings } = business;
  return { ...rest, business: earnings };
}
async function prepare(page: Page) {
  await page.clock.install({ time: new Date(NOW) });
  await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'company.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(activeCompany())) });
  await expect(page.locator('.settings-modal')).toContainText('存档导入成功');
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  return exportCompany(page);
}

for (const lifecycle of ['visibility', 'pagehide'] as const) test(`all progress pauses through ${lifecycle} and resumes once`, async ({ page }) => {
  const before = await prepare(page);
  await page.evaluate(kind => {
    if (kind === 'visibility') {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    } else window.dispatchEvent(new PageTransitionEvent('pagehide'));
  }, lifecycle);
  await page.clock.fastForward(DAY);
  await page.evaluate(kind => {
    if (kind === 'visibility') {
      Reflect.deleteProperty(document, 'hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    } else window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  }, lifecycle);
  const resumed = await exportCompany(page);
  expect(progress(resumed)).toEqual(progress(before));
  await expect(page.locator('.return-report')).toHaveCount(0);
  const remaining = before.fleet[0]!.flight!.arriveAt - before.simTime;
  await page.clock.fastForward((remaining + 1) * 1000);
  const arrived = await exportCompany(page);
  expect(arrived.stats.flights).toBe(before.stats.flights + 1);
  expect(arrived.business.earned).toBeGreaterThan(before.business.earned);
  await page.reload();
  expect(progress(await exportCompany(page))).toEqual(progress(arrived));
});

test('closing and reopening without a network keeps the same progress', async ({ page, context }) => {
  const before = await prepare(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByRole('button', { name: '立即保存', exact: true }).click();
  await page.goto('about:blank');
  await page.clock.fastForward(DAY);
  await context.setOffline(true);
  try {
    await page.goto('./');
    const restored = await exportCompany(page);
    expect(progress(restored)).toEqual(progress(before));
    await expect(page.locator('.return-report')).toHaveCount(0);
  } finally { await context.setOffline(false); }
});

test('the title screen does not advance an existing company', async ({ page }) => {
  const before = await prepare(page);
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByRole('button', { name: '立即保存', exact: true }).click();
  await page.addInitScript(() => sessionStorage.removeItem('china-airlines:playing:v1'));
  await page.reload();
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('start-screen')).not.toContainText(/单机|离线/);
  await page.clock.fastForward(DAY);
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  expect(progress(await exportCompany(page))).toEqual(progress(before));
});
