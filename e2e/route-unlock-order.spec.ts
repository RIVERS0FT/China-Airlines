import { selectCity, detailValue } from './dispatch-helpers.js';
import { test, expect } from '@playwright/test';

test('selecting the next city immediately after unlock retains the committed first stop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '制定路线', exact: true }).click();

  await expect(page.locator('.network-controls')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^升级机场/ })).toHaveCount(0);
  await selectCity(page, 'WUH');
  const detail = page.getByRole('dialog', { name: '机场详情', exact: true });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: '返回制定路线', exact: true })).toBeVisible();
  await detail.getByRole('button', { name: /^解锁机场/ }).click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^升级机场/ })).toHaveCount(0);
  // No sleep or explicit save wait: the unlock callback must append before a
  // competing city selection can replace the local route draft.
  await selectCity(page, 'PVG');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH,PVG');
  await expect(await detailValue(page, 'plan-summary')).toContainText('2 段');
  await expect(page.getByTestId('credits')).toHaveText('¥ 10,000');
  await expect(page.getByTestId('plane-energy')).toHaveCount(0);
  await expect(await detailValue(page, 'network-energy')).toContainText('200.00');
  await expect(page.getByTestId('flights-count')).toHaveText('0 班');
  expect(errors).toEqual([]);
});
