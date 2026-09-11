import { test, expect } from '@playwright/test';

test('tutorial feedback does not obscure the loading controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '操作帮助', exact: true }).click();
  await page.getByRole('button', { name: '开始分步引导', exact: true }).click();
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step', 'load');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.getByTestId('waiting-order').first().click();
  await expect(page.getByTestId('onboard-count')).toHaveText('1');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('onboard-count')).toHaveText('1');
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  expect(errors).toEqual([]);
});
