import { test, expect } from '@playwright/test';

test('selecting the next city immediately after unlock retains the committed first stop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '航线地图', exact: true }).click();
  const city = page.getByLabel('选择机场', { exact: true });
  await city.selectOption('WUH');
  await page.getByRole('button', { name: /^解锁机场/ }).click();
  // No sleep or explicit save wait: the real select must remain disabled until
  // the unlock's asynchronous append is safe from a competing city selection.
  await city.selectOption('PVG');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH,PVG');
  await expect(page.getByTestId('plan-summary')).toContainText('2 段');
  await expect(page.getByTestId('credits')).toHaveText('¥ 148,000');
  await expect(page.getByTestId('plane-energy')).toHaveCount(0);
  await expect(page.getByTestId('network-energy')).toContainText('240.00');
  await expect(page.getByTestId('flights-count')).toHaveText('0 班');
  expect(errors).toEqual([]);
});
