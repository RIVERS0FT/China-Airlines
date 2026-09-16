import { test, expect } from './fixture.js';

test('the HUD explicitly opens flights on every activation while ordinary navigation preserves the tab', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const hud = page.getByRole('button', { name: '机队管理概览', exact: true });
  const flights = page.getByRole('tab', { name: '航班', exact: true });
  const planes = page.getByRole('tab', { name: '飞机', exact: true });
  const credits = await page.getByTestId('credits').textContent();
  await hud.click();
  await expect(flights).toHaveAttribute('aria-selected', 'true');
  await planes.click();
  await expect(planes).toHaveAttribute('aria-selected', 'true');
  await hud.click();
  await expect(flights).toHaveAttribute('aria-selected', 'true');
  await planes.click();
  await page.locator('.game-dock').getByRole('button', { name: '飞机商店', exact: true }).click();
  await page.locator('.game-dock').getByRole('button', { name: '机队管理', exact: true }).click();
  await expect(planes).toHaveAttribute('aria-selected', 'true');
  await hud.click();
  await expect(flights).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('credits')).toHaveText(credits!);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
