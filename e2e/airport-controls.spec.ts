import { test, expect } from '@playwright/test';
import { GameCore, orderReward, validateSave } from '../src/core/game.js';
import { selectCity, launchRoute } from './dispatch-helpers.js';

test('destination stations group different destinations while preserving individual loading', async ({ page }) => {
  const now = Date.now(), core = new GameCore(now);
  core.execute({ type: 'unlock', airportId: 'WUH' }, now);
  const state = core.snapshot();
  const orders = state.orders.filter(order => order.location === 'PEK');
  orders.forEach((order, index) => {
    order.to = index % 2 ? 'WUH' : 'PVG';
    order.reward = orderReward(order.from, order.to, order.kind, order.amount);
  });
  validateSave(state);
  await page.goto('./');
  page.on('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'stations.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.getByTestId('credits')).toHaveText('¥ 148,000');
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await expect(page.locator('.destination-station')).toHaveCount(2);
  for (const city of ['上海', '武汉']) {
    const group = page.getByRole('group', { name: `前往${city}的客货`, exact: true });
    await expect(group.getByTestId('waiting-order')).toHaveCount(orders.length / 2);
    await expect(group.locator('.destination-station')).toHaveCount(1);
    const sign = (await group.locator('.destination-station').boundingBox())!;
    const passenger = (await group.getByTestId('waiting-order').first().boundingBox())!;
    expect(sign.x + sign.width).toBeLessThanOrEqual(passenger.x);
    for (const item of await group.getByTestId('waiting-order').all()) await expect(item).toHaveAttribute('aria-label', new RegExp(`前往${city}`));
  }
  await page.getByRole('group', { name: '前往武汉的客货', exact: true }).getByTestId('waiting-order').first().click();
  await page.getByRole('button', { name: '查看机上客货', exact: true }).click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  await expect(page.getByRole('group', { name: '前往武汉的客货', exact: true }).locator('.destination-station')).toContainText('武汉WUH');
  await page.screenshot({ path: 'artifacts/destination-stations-loaded.png' });
});

test('first flight is guided through the mission without a bottom tutorial entry', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.locator('.start-guide, .dock-status')).toHaveCount(0);
  await expect(page.locator('.airport-mission')).toContainText('选择旅客与货物');
  await page.getByRole('button', { name: '查看当前运营任务', exact: true }).click();
  await expect(page.getByTestId('first-flight-task')).toContainText('选择旅客与货物');
  await page.getByRole('button', { name: '前往装载', exact: true }).click();
  await page.getByTestId('waiting-order').first().click();
  await expect(page.locator('.airport-mission')).toContainText('进入航线地图');
  await page.getByRole('button', { name: '查看当前运营任务', exact: true }).click();
  await page.getByRole('button', { name: '规划首航', exact: true }).click();
  await selectCity(page, 'PEK'); await selectCity(page, 'PVG'); await launchRoute(page);
  await expect(page.locator('.airport-mission')).toContainText('观察航班到达');
  await page.reload();
  await expect(page.locator('.airport-mission')).toContainText('观察航班到达');
  await page.clock.fastForward(200_000);
  const resume = page.getByRole('button', { name: '继续经营', exact: true });
  if (await resume.isVisible()) await resume.click();
  await expect(page.locator('.airport-mission')).toContainText('领取首航奖励');
  await page.getByRole('button', { name: '查看当前运营任务', exact: true }).click();
  await page.getByRole('button', { name: '领取奖励', exact: true }).click();
  await expect(page.getByRole('button', { name: '已领取', exact: true })).toBeDisabled();
  await expect(page.getByTestId('first-flight-task')).toHaveCount(0);
});

test('loading and unloading stay in the same destination group without a toolbar', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('waiting-order')).toHaveCount(12);
  await expect(page.locator('.job-quantity')).toHaveCount(0);
  await expect(page.locator('.order-toolbar')).toHaveCount(0);
  const item = page.getByTestId('waiting-order').first();
  const id = await item.getAttribute('data-order-id');
  await item.click();
  const loaded = page.locator(`[data-order-id="${id}"]`);
  await expect(loaded).toHaveAttribute('data-testid', 'loaded-order');
  await expect(loaded.locator('.job-state')).toHaveText('已装机 · 点击卸载');
  await loaded.click();
  await expect(loaded).toHaveAttribute('data-testid', 'waiting-order');
  await expect(loaded.locator('.job-state')).toHaveText('中转保留 · 点击装机');
  await loaded.click();
  await page.getByRole('button', { name: '查看机上客货', exact: true }).click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  await page.getByRole('button', { name: '机场装载', exact: true }).click();
  await expect(page.getByTestId('waiting-order')).toHaveCount(11);
});

test('airport loading button returns from the onboard list', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('waiting-order').first().click();
  await page.getByRole('button', { name: '查看机上客货', exact: true }).click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  await page.getByRole('button', { name: '机场装载', exact: true }).click();
  await expect(page.getByTestId('waiting-order')).toHaveCount(11);
});

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]]) {
  test(`airport entry buttons actually open their destination at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    for (const [button, dialog] of [
      ['航班运行表', '航班运行表'], ['机场目录', '机场目录'], ['机队管理', '我的机库'],
      ['飞机商店', '飞机商店'], ['运营任务', '运营任务'], ['操作帮助', '起航指南'],
      ['存档设置', '本地存档与设置'], ['当前机场详情', '机场详情'],
      ['查看当前运营任务', '运营任务'], ['查看航班运行', '航班运行表'],
      ['飞机改装与补能', '我的机库'], ['查看运营奖励', '运营任务'],
    ]) {
      const control = page.getByRole('button', { name: button!, exact: true });
      await control.click();
      await expect(page.getByRole('dialog', { name: dialog!, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: '显示机体客货示意', exact: true })).toHaveCount(0);
    await expect(page.locator('.cabin-overlay')).toBeVisible();
    await expect(page.locator('.airport-nameplate')).toHaveCount(0);
    await expect(page.locator('.destination-station')).toHaveCount(1);
    await expect(page.locator('.destination-station')).toContainText('上海PVG');
    await expect(page.locator('.job-destination')).toHaveCount(0);
    const occupant = page.getByTestId('waiting-order').first();
    expect(await occupant.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await occupant.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    await page.screenshot({ path: `artifacts/airport-controls-${width}.png` });
  });
}
