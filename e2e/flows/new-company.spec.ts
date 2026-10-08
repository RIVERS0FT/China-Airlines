import { test, expect, startNewCompany, buyFirstAircraft, exportCompany } from '../helpers/new-company.js';
import { launchRoute } from '../helpers/dispatch-helpers.js';
import { airport } from '../../src/core/catalog.js';
import { projectGeo, type GlobeCamera } from '../../src/ui/globe-geometry.js';

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
  test(`new company: buy airport, select aircraft, configure, load, fly, reload offline, settle and claim once at ${viewport.width}`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await startNewCompany(page);
    const initial = await exportCompany(page);
    expect(initial.fleet).toEqual([]);
    expect(initial.airports).toEqual([{id:'PEK',level:1}]);
    expect(initial.stats.flights).toBe(0);

    let offeredIds: string[] = [];
    await test.step('Buy a destination and a one-slot aircraft, then load an existing order', async () => {
      await buyFirstAircraft(page);
      offeredIds = (await exportCompany(page)).orders.filter(order => order.location === "PEK").map(order => order.id);
      await page.getByRole('button', { name: /^装载 .* 前往上海 .*位旅客/ }).first().click();
      await expect(page.getByTestId('loaded-order')).toHaveCount(1);
    });
    const loaded = await exportCompany(page);
    const orderIds = loaded.orders.filter(order => order.location === 'AC0001').map(order => order.id);
    expect(orderIds).toHaveLength(1);
    expect(orderIds.every(id => offeredIds.includes(id))).toBe(true);
    expect(loaded.orders.filter(order => orderIds.includes(order.id)).every(order => order.from === 'PEK' && order.to === 'PVG')).toBe(true);
    expect(loaded.credits).toBe(3600);

    await test.step('Plan and depart; charge only cost and ignore animation end events', async () => {
      await page.getByRole('button', { name: '制定航线', exact: true }).click();
      const map = page.getByTestId('map-canvas');
      await expect(map).toHaveAttribute('data-renderer', 'ready');
      await page.clock.runFor(100);
      await expect(page.locator('.dispatch-readout button, .dispatch-readout select')).toHaveCount(0);
      const bounds = (await map.boundingBox())!, logicalWidth = await map.evaluate(element => element.clientWidth);
      const camera = JSON.parse((await map.getAttribute('data-camera'))!) as GlobeCamera;
      const point = projectGeo(airport('PVG'), camera), scale = bounds.width / logicalWidth;
      expect(point.visible).toBe(true);
      const hole = (await page.getByTestId('tutorial-spotlight').boundingBox())!;
      expect(Math.abs(hole.x + hole.width / 2 - (bounds.x + point.x * scale))).toBeLessThan(1);
      expect(Math.abs(hole.y + hole.height / 2 - (bounds.y + point.y * scale))).toBeLessThan(1);
      await page.screenshot({path:`artifacts/tutorial-map-shanghai-${viewport.width}.png`});
      await page.mouse.click(bounds.x + point.x * scale, bounds.y + point.y * scale);
      await page.clock.runFor(100);
      await expect(map).toHaveAttribute('data-preview-path', 'PVG');
      await expect(page.getByTestId('network-destination')).toHaveText('上海');
      await expect(page.getByRole('dialog', {name:'选择城市',exact:true})).toHaveCount(0);
      await launchRoute(page);
      await expect(page.getByTestId('credits')).toHaveText('¥ 3,504');
      const aircraft = page.locator('.is-flying .airplane-display > svg');
      await aircraft.dispatchEvent('animationend');
      await aircraft.dispatchEvent('transitionend');
      await expect(page.getByTestId('flights-count')).toHaveText('0 班');
    });
    const flying = await exportCompany(page), flight = flying.fleet[0]!.flight!;
    expect(flight).toMatchObject({ from: 'PEK', to: 'PVG', cost: 96, revenue: 326 });
    expect(flying.stats).toMatchObject({ costs: 96, revenue: 0, flights: 0 });
    expect(flying.orders.filter(order => order.location === 'AC0001').map(order => order.id)).toEqual(orderIds);

    await test.step('Reload the actual saved flight offline and settle by time with reduced motion', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.reload();
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await context.setOffline(true);
      await page.reload();
      expect((await exportCompany(page)).fleet[0]!.flight).toEqual(flight);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.fastForward((flight.arriveAt - flying.simTime + 9) * 1000);
      await expect(page.getByTestId('flights-count')).toHaveText('1 班');
      await expect(page.getByTestId('credits')).toHaveText('¥ 3,830');
      const resume = page.getByRole('button', { name: '继续经营', exact: true });
      if (await resume.isVisible()) await resume.click();
    });
    const arrived = await exportCompany(page);
    expect(arrived.stats).toMatchObject({ flights: 1, costs: 96, revenue: 326, passengers: 1, cargo: 0 });
    expect(arrived.orders.filter(order => orderIds.includes(order.id))).toEqual([]);
    expect(arrived.fleet[0]).toMatchObject({ airportId: 'PVG', flight: null });

    await test.step('Claim once, then reload without repeating either delivery or reward', async () => {
      await page.getByRole('button', { name: '任务中心', exact: true }).click();
      await page.locator('[data-task-id="first-flight"]').getByRole('button', { name: '领取奖励', exact: true }).click();
      await expect(page.getByTestId('credits')).toHaveText('¥ 4,430');
      await page.getByRole('tab', { name: /^已领取/ }).click();
      await expect(page.locator('[data-task-id="first-flight"]').getByRole('button', { name: '已领取', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '关闭任务中心', exact: true }).click();
      await page.reload();
      const restored = await exportCompany(page);
      expect(restored.credits).toBe(4430);
      expect(restored.stats).toEqual(arrived.stats);
      expect(restored.claimedTasks.filter(id => id === 'first-flight')).toHaveLength(1);
    });
  });
}

test('new company: cancel purchase, buy with free configuration, refit, unlock, export and recover', async ({ page }) => {
  await startNewCompany(page);
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  const initial = await exportCompany(page);
  await page.getByRole('button', { name: '飞机商店', exact: true }).click();
  await page.getByRole('button', { name: '支付 ¥ 5,500 购买', exact: true }).click();
  const purchase = page.getByRole('dialog', { name: '购机选配', exact: true });
  const confirm = purchase.getByRole('button', { name: /^支付 .+ 购买$/, exact: true });
  await expect(confirm).toBeDisabled();
  await purchase.getByRole('spinbutton', { name: '客位', exact: true }).fill('2');
  await purchase.getByRole('spinbutton', { name: '货位', exact: true }).fill('1');
  await expect(confirm).toBeDisabled();
  await purchase.getByRole('button', { name: '取消购买', exact: true }).click();
  const cancelled = await exportCompany(page);
  expect(cancelled.fleet).toEqual(initial.fleet);
  expect(cancelled.credits).toBe(initial.credits);

  await page.getByRole('button', { name: '支付 ¥ 5,500 购买', exact: true }).click();
  await purchase.getByRole('spinbutton', { name: '客位', exact: true }).fill('1');
  await purchase.getByRole('spinbutton', { name: '货位', exact: true }).fill('1');
  await confirm.click();
  await expect(purchase).toHaveCount(0);
  const bought = await exportCompany(page);
  expect(bought.credits).toBe(2900);
  expect(bought.fleet).toHaveLength(1);
  expect(bought.fleet[0]).toMatchObject({ id: 'AC0001', allocation: { passengers: 1, cargo: 1 }, airportId: 'PEK' });
  await page.getByRole('button', { name: '机队管理', exact: true }).click();
  await page.getByRole('button', { name: '查看AC0001飞机', exact: true }).click();
  const allocation = page.getByRole('region', { name: '客货容量分配', exact: true });
  await allocation.getByRole('spinbutton', { name: '客位', exact: true }).fill('2');
  await allocation.getByRole('spinbutton', { name: '货位', exact: true }).fill('0');
  await allocation.getByRole('button', { name: '确认客货改装', exact: true }).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 2,820');
  await page.getByRole('button', { name: '机场目录', exact: true }).click();
  await page.getByLabel('搜索机场', { exact: true }).fill('上海');
  await page.getByRole('button', { name: /^未开放/ }).click();
  await page.getByRole('button', { name: '查看上海机场', exact: true }).click();
  await page.getByRole('button', { name: /^解锁机场/ }).click();
  await page.keyboard.press('Escape');
  const expanded = await exportCompany(page);
  expect(expanded.credits).toBe(320);
  expect(expanded.airports.map(airport => airport.id)).toEqual(['PEK', 'PVG']);
  expect(expanded.fleet[0]!.allocation).toEqual({ passengers: 2, cargo: 0 });

  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...expanded, credits: -1 })) });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.reload();
  const afterRejected = await exportCompany(page);
  expect(afterRejected.credits).toBe(expanded.credits);
  expect(afterRejected.fleet).toEqual(expanded.fleet);
  expect(afterRejected.airports).toEqual(expanded.airports);

  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByRole('button', { name: '保存并返回开始界面', exact: true }).click();
  await page.getByRole('button', { name: '新游戏', exact: true }).click();
  await page.getByRole('button', { name: '创建公司并启航', exact: true }).click();
  await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'company-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(expanded)) });
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.reload();
  const recovered = await exportCompany(page);
  expect(recovered.credits).toBe(320);
  expect(recovered.fleet).toEqual(expanded.fleet);
  expect(recovered.airports).toEqual(expanded.airports);
});
