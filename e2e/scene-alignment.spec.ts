import { expect, test } from './fixture.js';

test('grounded aircraft is anchored to the runway baseline on desktop', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');

  const stage = page.getByTestId('airport-scene');
  const plane = page.getByTestId('plane-art');
  await expect(stage).toBeVisible();
  await expect(stage).not.toHaveClass(/is-flying/);
  await expect(plane).toBeVisible();

  const bottom = await plane.evaluate((element) => Number.parseFloat(getComputedStyle(element).bottom));
  expect(bottom).toBe(0);

  await testInfo.attach('grounded-aircraft-runway-alignment', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
