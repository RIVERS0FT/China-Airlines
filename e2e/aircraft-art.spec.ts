import { test, expect } from './fixture.js';

test('modern aircraft catalog uses left-facing unique revisioned bitmap art', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '飞机商店', exact: true }).click();
  await page.getByRole('button', { name: '全部机型', exact: true }).click();
  const cards = page.getByTestId('shop-aircraft');
  await expect(cards).toHaveCount(12);
  const sources = await cards.locator('.painted-aircraft').evaluateAll(images => images.map(image => image.getAttribute('src')));
  expect(sources).toHaveLength(12);
  expect(sources.every(source => /aircraft-(swift|heron|albatross|aurora)-(p|f|m)-exterior-v5\.png$/.test(source ?? ''))).toBe(true);
  await page.screenshot({ path: 'artifacts/aircraft-revisioned-shop.png', fullPage: true });
});
