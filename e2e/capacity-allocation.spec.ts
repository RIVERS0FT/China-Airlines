import { test, expect } from '@playwright/test';
import { prepareAirportSession } from './fixture.js';

test('a purchased two-slot aircraft stays empty until the player allocates its cabin', async ({ page }) => {
  await prepareAirportSession(page);
  await page.goto('./');
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 0 人');
  await expect(page.getByTestId('cargo-capacity')).toHaveText('货物 0 / 0 吨');
  await expect(page.getByTestId('waiting-order').first()).toBeDisabled();
  await page.getByRole('button', { name: '飞机商店', exact: true }).click();
  const cards = page.getByTestId('shop-aircraft');
  await expect(cards).toHaveCount(10);
  await expect(cards.first()).toContainText('总容量 1 格');
  await expect(cards.last()).toContainText('总容量 10 格');
  await page.getByRole('button', { name: '购买雨燕 I', exact: true }).click();
  await page.getByRole('button', { name: '关闭飞机商店' }).click();
  await page.getByRole('button', { name: '机队管理', exact: true }).click();
  await page.locator('.hangar-selector button').filter({ hasText: 'AC0002' }).click();
  const allocation = page.locator('.cabin-allocation');
  await expect(allocation).toContainText('总容量 2 格 · 已分配 0 格');
  await allocation.getByRole('spinbutton', { name: '客位' }).fill('2');
  await allocation.getByRole('spinbutton', { name: '货位' }).fill('1');
  await expect(allocation.getByRole('button', { name: '确认客货改装' })).toBeDisabled();
  await allocation.getByRole('spinbutton', { name: '客位' }).fill('1');
  await allocation.getByRole('button', { name: '确认客货改装' }).click();
  await expect(allocation).toContainText('已分配 2 格');
  await page.getByRole('button', { name: '关闭机队管理' }).click();
  await page.getByRole('button', { name: '下一架飞机' }).click();
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 1 人');
  await expect(page.getByTestId('cargo-capacity')).toHaveText('货物 0 / 1 吨');
  await page.reload();
  await page.getByRole('button', { name: '下一架飞机' }).click();
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 1 人');
  await expect(page.getByTestId('cargo-capacity')).toHaveText('货物 0 / 1 吨');
});

test('an older save remains intact and opens a version-specific recovery warning', async ({ page }) => {
  await prepareAirportSession(page);
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.goto('./icon.svg');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('china-airlines');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      const request = transaction.objectStore('saves').get('main');
      request.onsuccess = () => transaction.objectStore('saves').put({ ...request.result, state: { ...request.result.state, version: 10 } });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
  await page.goto('./');
  await expect(page.getByText(/检测到版本不兼容的存档/)).toBeVisible();
  await expect(page.getByText(/原数据未被覆盖/)).toBeVisible();
});
