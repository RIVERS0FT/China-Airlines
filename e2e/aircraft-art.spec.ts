import { test, expect } from './fixture.js';

test('modern aircraft catalog uses left-facing unique v4 bitmap art', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '飞机商店', exact: true }).click();
  await page.getByRole('button', { name: '全部机型', exact: true }).click();
  const cards = page.getByTestId('shop-aircraft');
  await expect(cards).toHaveCount(12);
  await expect(cards.locator('.painted-aircraft').first()).toHaveAttribute(
    'src',
    /aircraft-(swift|heron|albatross|aurora)-(p|f|m)-exterior-v4\.png$/,
  );
  await page.screenshot({ path: 'artifacts/aircraft-v4-shop.png', fullPage: true });
});
