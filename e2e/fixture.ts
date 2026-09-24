import { test as base, expect, type Page } from '@playwright/test';
import { GameCore } from '../src/core/game.js';

export async function prepareAirportSession(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('china-airlines:playing:v1', 'true');
    sessionStorage.setItem('china-airlines:screen:v1', 'airport');
  });
}

/** Configure a delivered empty aircraft using only visible game controls. */
export async function allocateCabin(page: Page, planeId: string, passengers: number, cargo: number) {
  await page.locator('.game-dock>button').nth(3).click();
  const row = page.locator('.hangar-selector button').filter({ hasText: planeId });
  await row.click();
  const allocation = page.locator('.cabin-allocation');
  await allocation.getByRole('spinbutton', { name: '客位' }).fill(String(passengers));
  await allocation.getByRole('spinbutton', { name: '货位' }).fill(String(cargo));
  await allocation.getByRole('button', { name: '确认客货改装' }).click();
  await expect(allocation).toContainText(`已分配 ${passengers + cargo} 格`);
  await page.locator('[data-page="fleet"] .ui-close-button').click();
}

/** Existing gameplay specs begin in the airport workspace. The title/default-map
 * contract has its own spec and production users never receive these flags. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await prepareAirportSession(page);
    const navigate = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await navigate(url, options);
      if (url !== './' && url !== '/') return response;
      // Existing browser journeys start with an already outfitted training
      // aircraft. Import that explicit fixture through the public UI; the
      // production new-game path and new capacity tests stay empty.
      await page.getByTestId('fleet-count').waitFor({ state: 'visible' });
      if ((await page.getByTestId('passenger-capacity').textContent())?.includes('0 / 0')) {
        const now = await page.evaluate(() => Date.now());
        const state = new GameCore(now).snapshot();
        state.fleet[0]!.allocation = { passengers: 3, cargo: 2 };
        const english = await page.locator('html').getAttribute('lang') === 'en-US';
        await page.getByRole('button', { name: english ? 'Save settings' : '存档设置', exact: true }).click();
        page.once('dialog', dialog => void dialog.accept());
        await page.getByLabel(english ? 'Choose save file' : '选择存档文件').setInputFiles({
          name: 'configured-starter.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)),
        });
        await expect(page.getByTestId('passenger-capacity')).toContainText(english ? '3' : '0 / 3');
        await page.getByRole('button', { name: english ? 'Close save settings' : '关闭存档设置', exact: true }).click();
      }
      return response;
    };
    await use(page);
  },
});

export { expect };
export type { Page, BrowserContext } from '@playwright/test';
