import type { Page } from '@playwright/test';
/** Physical CSS pixels per logical game pixel. Never silently weaken geometry assertions. */
export async function displayScale(page: Page) {
  return Number(await page.getByTestId('game-layout').getAttribute('data-screen-scale'));
}
