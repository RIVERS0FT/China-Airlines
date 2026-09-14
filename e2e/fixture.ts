import { test as base, expect, type Page } from '@playwright/test';

export async function prepareAirportSession(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('china-airlines:playing:v1', 'true');
    sessionStorage.setItem('china-airlines:screen:v1', 'airport');
  });
}

/** Existing gameplay specs begin in the airport workspace. The title/default-map
 * contract has its own spec and production users never receive these flags. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await prepareAirportSession(page);
    await use(page);
  },
});

export { expect };
export type { Page, BrowserContext } from '@playwright/test';
