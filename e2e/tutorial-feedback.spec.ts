import { openGlobal } from './dispatch-helpers.js';
import { test, expect } from './fixture.js';

test('tutorial feedback does not obscure or crop loading controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await openGlobal(page, '操作帮助');
  await page.getByRole('button', { name: '开始分步引导', exact: true }).click();
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step', 'load');
  await expect(page.locator('.toast')).toHaveCount(0);
  const card = page.getByTestId('waiting-order').first();
  const bounds = await card.boundingBox(), label = await card.locator('.job-price').boundingBox();
  expect(bounds).not.toBeNull(); expect(label).not.toBeNull();
  expect(label!.y + label!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  await expect(card.locator('.job-price')).toBeInViewport();
  await page.screenshot({ path: 'artifacts/tutorial-landscape-readable.png' });
  await card.click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  expect(errors).toEqual([]);
});
