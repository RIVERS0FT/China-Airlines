import { test, expect } from './fixture.js';

test('modern aircraft catalog uses left-facing unique revisioned bitmap art', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '飞机商店', exact: true }).click();
  await page.getByRole('button', { name: '全部机型', exact: true }).click();
  const cards = page.getByTestId('shop-aircraft');
  await expect(cards).toHaveCount(13);
  const sources = await cards.locator('.painted-aircraft').evaluateAll(images => images.map(image => image.getAttribute('src')));
  expect(sources).toHaveLength(13);
  expect(sources.filter(source => /aircraft-(swift|heron|albatross|aurora)-(p|f|m)-exterior-v5\.png$/.test(source ?? ''))).toHaveLength(12);
  expect(sources).toContainEqual(expect.stringMatching(/aircraft-diamond-da40-exterior-v6\.png$/));
  await expect(cards.filter({hasText:'钻石 DA40'})).toContainText('现实参考 · Diamond DA40 NG');
  await page.screenshot({ path: 'artifacts/aircraft-revisioned-shop.png', fullPage: true });
});
