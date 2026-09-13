import { test, expect } from '@playwright/test';

test('route planning marks loaded passenger destinations on the map', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await page.getByRole('button', { name: '制定路线', exact: true }).click();
  const hint = page.getByRole('button', { name: '关闭选路提示', exact: true });
  if (await hint.count()) await hint.click();
  const map = page.getByTestId('map-canvas');
  await expect(map).toHaveAttribute('data-renderer', 'ready');
  await expect(map).toHaveAttribute('data-passenger-destinations', 'PVG:3');
});
