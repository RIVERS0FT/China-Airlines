import { test, expect } from '@playwright/test';
import { prepareAirportSession } from '../helpers/configured-airport.js';
import { GameCore } from '../helpers/configured-game.js';
import { exportCompany } from '../helpers/new-company.js';

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]]) {
  test(`purchase requires free configuration and later refits charge normally at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await prepareAirportSession(page);
    await page.goto('./');
  await page.getByRole('button', {name: /^(跳过引导|Skip Tutorial)$/}).click();
    await page.getByRole('button', { name: '飞机商店', exact: true }).click();
    const shop=page.getByTestId('page-shop');
    await expect(shop.getByLabel('交付机场',{exact:true})).toHaveCount(0);
    const card=shop.getByRole('article',{name:'雨燕 I',exact:true});
    await expect(card.locator('.card-top').getByRole('heading',{name:'雨燕 I',exact:true})).toBeVisible();
    await expect(card).not.toContainText(/购机选配|客货布局|免费/);
    const buy = page.getByRole('button', { name: '支付 ¥ 5,500 购买', exact: true });
    await buy.click();
    const dialog = page.getByRole('dialog', { name: '购机选配', exact: true });
    await expect(dialog.getByLabel('交付机场',{exact:true})).toHaveValue('PEK');
    const confirm = dialog.getByRole('button', { name: /^支付 .+ 购买$/, exact: true });
    await expect(confirm).toBeDisabled();
    await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
    await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
    await dialog.getByRole('spinbutton', { name: '客位', exact: true }).fill('2');
    await dialog.getByRole('spinbutton', { name: '货位', exact: true }).fill('1');
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('button', { name: '取消购买', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
    await buy.click();
    await dialog.getByRole('spinbutton', { name: '客位', exact: true }).fill('2');
    await page.reload(); // Unconfirmed choices never create an aircraft or spend money.
    await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
    await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
    await page.getByRole('button', { name: '飞机商店', exact: true }).click();
    await buy.click();
    await dialog.getByRole('spinbutton', { name: '客位', exact: true }).fill('1');
    await dialog.getByRole('spinbutton', { name: '货位', exact: true }).fill('1');
    await expect(dialog).toContainText('免费');
    await expect(confirm).toBeInViewport();
    await page.screenshot({path:`artifacts/purchase-options-${width}.png`});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('credits')).toHaveText('¥ 12,500');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: '机场装载', exact: true }).click();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 1 人');
    await expect(page.getByTestId('cargo-capacity')).toHaveText('货物 0 / 1 吨');
    await page.reload();
    await page.getByRole('button', { name: '机队管理', exact: true }).click();
    await page.getByRole('button', { name: '查看AC0001飞机', exact: true }).click();
    const allocation = page.locator('.cabin-allocation');
    await allocation.getByRole('spinbutton', { name: '客位' }).fill('2');
    await allocation.getByRole('spinbutton', { name: '货位' }).fill('0');
    await expect(allocation).toContainText('改装费用 ¥ 80');
    await allocation.getByRole('button', { name: '确认客货改装' }).click();
    await expect(page.getByTestId('credits')).toHaveText('¥ 12,420');
    await page.reload();
    await expect(page.getByTestId('credits')).toHaveText('¥ 12,420');
  });
}

test('purchase selection is translated and Escape cancels without buying', async ({ page }) => {
  await prepareAirportSession(page);
  await page.addInitScript(() => localStorage.setItem('china-airlines:locale:v1', 'en-US'));
  await page.goto('./');
  await page.getByRole('button', {name: /^(跳过引导|Skip Tutorial)$/}).click();
  await page.getByRole('button', { name: 'Aircraft Shop', exact: true }).click();
  await page.getByRole('button', { name: 'Buy for ¥ 5,500', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Configure aircraft purchase', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Free');
  await expect(dialog.getByRole('button', { name: 'Buy for ¥ 5,500', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Delivery Airport',{exact:true})).toHaveValue('PEK');
  await dialog.getByRole('spinbutton', { name: 'Passenger slots', exact: true }).fill('2');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('fleet-count')).toContainText('0');
  await expect(page.getByTestId('credits')).toContainText('18,000');
});

for(const width of [1440,667])test(`purchase chooses an eligible delivery airport without resetting cabin selection at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:375});
  const now=Date.parse('2026-09-27T02:00:00Z');await page.clock.install({time:new Date(now)});
  await prepareAirportSession(page);await page.goto('./');await page.getByRole('button',{name:'跳过引导',exact:true}).click();
  const state=new GameCore(now).snapshot();state.credits=100000;state.career.xp=10000;state.airports.find(a=>a.id==='PVG')!.level=2;
  await page.getByRole('button',{name:'存档设置',exact:true}).click();page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'delivery-airport.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});
  await expect(page.locator('.settings-modal')).toContainText('存档导入成功');await page.getByRole('button',{name:'关闭存档设置',exact:true}).click();
  await page.getByRole('button',{name:'飞机商店',exact:true}).click();
  const shop=page.getByTestId('page-shop'),buy=shop.getByRole('article',{name:'信天翁 I',exact:true}).getByRole('button',{name:'支付 ¥ 80,000 购买',exact:true});
  await expect(shop.getByLabel('交付机场',{exact:true})).toHaveCount(0);await expect(buy).toBeEnabled();await buy.click();
  const dialog=page.getByRole('dialog',{name:'购机选配',exact:true}),delivery=dialog.getByLabel('交付机场',{exact:true}),confirm=dialog.getByRole('button',{name:'支付 ¥ 80,000 购买',exact:true});
  await expect(delivery).toHaveValue('PEK');await expect(dialog).toContainText('交付机场需升至 2 级');
  await dialog.getByRole('spinbutton',{name:'客位',exact:true}).fill('5');await dialog.getByRole('spinbutton',{name:'货位',exact:true}).fill('3');await expect(confirm).toBeDisabled();
  await delivery.selectOption('PVG');await expect(dialog.getByRole('spinbutton',{name:'客位',exact:true})).toHaveValue('5');await expect(dialog.getByRole('spinbutton',{name:'货位',exact:true})).toHaveValue('3');await expect(confirm).toBeEnabled();
  await delivery.selectOption('PEK');await expect(confirm).toBeDisabled();await delivery.selectOption('PVG');
  await confirm.click();await expect(dialog).toHaveCount(0);await expect(page.getByTestId('credits')).toHaveText('¥ 20,000');await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  const saved=await exportCompany(page);expect(saved.fleet[1]).toMatchObject({modelId:'albatross-p',airportId:'PVG',allocation:{passengers:5,cargo:3}});expect(saved.credits).toBe(state.credits-80000);
  await page.reload();await expect(page.getByTestId('credits')).toHaveText('¥ 20,000');expect((await exportCompany(page)).fleet).toEqual(saved.fleet);
});

test('an older save remains intact and opens a version-specific recovery warning', async ({ page }) => {
  await prepareAirportSession(page);
  await page.goto('./');
  await page.getByRole('button', {name: /^(跳过引导|Skip Tutorial)$/}).click();
  await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
  await page.goto('./icon.svg');
  const original = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('china-airlines');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const original = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const request = transaction.objectStore('saves').getAll();
      let records: unknown[] = [];
      request.onsuccess = () => {
        records = request.result.map(record => ({ ...record, state: { ...record.state, version: 13 } }));
        records.forEach(record => transaction.objectStore('saves').put(record));
      };
      transaction.oncomplete = () => resolve(records);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    return original;
  });
  await page.goto('./');
  await expect(page.getByText(/检测到版本不兼容的存档/)).toBeVisible();
  await expect(page.getByText(/原数据未被覆盖/)).toBeVisible();
  const preserved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('china-airlines'); request.onsuccess = () => resolve(request.result); });
    const records = await new Promise<unknown[]>(resolve => { const request = db.transaction('saves').objectStore('saves').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close(); return records;
  });
  expect(preserved).toEqual(original);
});
