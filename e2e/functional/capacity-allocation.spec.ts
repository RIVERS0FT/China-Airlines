import { test, expect } from '@playwright/test';
import { prepareAirportSession } from '../helpers/configured-airport.js';

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]]) {
  test(`purchase requires free configuration and later refits charge normally at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await prepareAirportSession(page);
    await page.goto('./');
  await page.getByRole('button', {name: /^(跳过引导|Skip Tutorial)$/}).click();
    await page.getByRole('button', { name: '飞机商店', exact: true }).click();
    const buy = page.getByRole('button', { name: '购买雨燕 I', exact: true });
    await buy.click();
    const dialog = page.getByRole('dialog', { name: '购机选配', exact: true });
    const confirm = dialog.getByRole('button', { name: '确认选配并购买', exact: true });
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
  await page.getByRole('button', { name: 'Buy Swift I', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Configure aircraft purchase', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Free');
  await expect(dialog.getByRole('button', { name: 'Confirm configuration and buy', exact: true })).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Passenger slots', exact: true }).fill('2');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('fleet-count')).toContainText('0');
  await expect(page.getByTestId('credits')).toContainText('18,000');
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
        records = request.result.map(record => ({ ...record, state: { ...record.state, version: 12 } }));
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
