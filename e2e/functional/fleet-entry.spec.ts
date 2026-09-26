import { test, expect } from '../helpers/configured-airport.js';

test('HUD and navigation share one fleet workspace and retain filters without changing finances', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const hud = page.getByRole('button', { name: '机队管理概览', exact: true });
  const fleet = page.getByTestId('page-fleet');
  const credits = await page.getByTestId('credits').textContent();
  await hud.click();
  await expect(fleet.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '机队运行清单', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '飞机详情', exact: true })).toBeVisible();
  await expect(page.getByText(/机上清单/)).toHaveCount(0);
  const search = page.getByRole('searchbox', { name: '搜索飞机', exact: true });
  const ready = page.getByRole('button', { name: /^待命飞机/ });
  await ready.click();
  await search.fill('AC0001');
  await hud.click();
  await expect(ready).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('AC0001');
  const inspect = page.getByRole('button', { name: '查看AC0001飞机', exact: true });
  await inspect.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#fleet-detail-heading')).toBeFocused();
  await expect(page.locator('.fleet-detail')).toContainText('AC0001');
  for (const [name, selector] of [['飞机补能', '.energy-service'], ['客货改装', '.cabin-allocation'], ['性能改装', '.fleet-upgrades'], ['自动值勤', '.crew-card']]) {
    await page.getByRole('group', { name: '管理快捷入口', exact: true }).getByRole('button', { name, exact: true }).click();
    await expect(page.locator(selector!)).toBeFocused();
    await expect(page.locator(selector!)).toBeInViewport();
  }
  await page.getByRole('button', { name: '返回飞机列表', exact: true }).click();
  await expect(inspect).toBeFocused();
  await page.locator('.game-dock').getByRole('button', { name: '飞机商店', exact: true }).click();
  await expect(fleet).toHaveCount(0);
  await page.locator('.game-dock').getByRole('button', { name: '机队管理', exact: true }).click();
  await expect(ready).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('AC0001');
  await expect(inspect).toHaveAttribute('aria-pressed', 'true');
  // A hidden selected row does not remove its details, and the return control
  // takes keyboard users to search so they can recover the list.
  await search.fill('missing-aircraft');
  await expect(page.getByTestId('flight-row')).toHaveCount(0);
  await expect(page.locator('.fleet-detail')).toContainText('AC0001');
  await page.getByRole('button', { name: '返回飞机列表', exact: true }).click();
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: '显示全部飞机', exact: true }).click();
  await expect(inspect).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('credits')).toHaveText(credits!);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
