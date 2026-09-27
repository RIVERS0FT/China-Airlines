import { test as base, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { GameState } from '../../src/core/game.js';

/** Acceptance starts from production's title/new game: no preset save, money,
 * capacity, session flag, command injection, or page.goto override. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors).toEqual([]);
  },
});
export { expect };
/** Click a real visible part of the dark mask, never dispatch an event or force a hit. */
export async function clickGuideMask(page: Page, touch = false) {
  let point: { x: number; y: number } | undefined;
  await expect.poll(async () => {
    point = await page.getByTestId('tutorial-mask').evaluateAll(masks => {
      for (const mask of masks) {
        const r = mask.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        for (const x of [r.left + 4, r.right - 4, r.left + r.width / 2]) {
          for (const y of [r.top + 4, r.bottom - 4, r.top + r.height / 2]) {
            if (document.elementFromPoint(x, y) === mask) return { x, y };
          }
        }
      }
    });
    return Boolean(point);
  }).toBe(true);
  if (touch) await page.touchscreen.tap(point!.x, point!.y);
  else await page.mouse.click(point!.x, point!.y);
}
export async function startNewCompany(page: Page) {
  await page.clock.install({ time: new Date('2026-09-25T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-25T00:00:01Z'));
  await page.goto('./');
  await page.getByRole('button', { name: '进入游戏', exact: true }).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
  await expect(page.getByTestId('fleet-count')).toHaveText('0 架');
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','unlock');
}
/** Observe the public export, never read a mocked core or mutate IndexedDB. */
export async function exportCompany(page: Page): Promise<GameState> {
  const english = await page.locator('html').getAttribute('lang') === 'en-US';
  // The global HUD remains reachable during the guide; no duplicate guide button.
  const settings = page.getByRole('button', { name: english ? 'Save settings' : '存档设置', exact: true }).filter({ visible: true }).last();
  await settings.click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: english ? 'Export Save' : '导出存档', exact: true }).click();
  const file = await pending;
  const state = JSON.parse(await readFile((await file.path())!, 'utf8')) as GameState;
  await page.getByRole('button', { name: english ? 'Close save settings' : '关闭存档设置', exact: true }).click();
  return state;
}
export async function buyFirstAircraft(page: Page) {
  const guide=page.getByTestId('tutorial');
  await clickGuideMask(page);
  await page.getByRole('button',{name:'解锁机场 ¥ 4,000',exact:true}).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 14,000');
  await expect(guide).toHaveAttribute('data-step','buy');
  await page.getByRole('button',{name:'支付 ¥ 2,300 购买',exact:true}).click();
  await expect(guide).toHaveAttribute('data-step','configure');
  const purchase=page.getByRole('dialog',{name:'购机选配',exact:true});
  await expect(purchase.getByRole('button',{name:/^支付 .+ 购买$/,exact:true})).toBeDisabled();
  await purchase.getByRole('spinbutton',{name:'客位',exact:true}).fill('1');
  await purchase.getByRole('button',{name:/^支付 .+ 购买$/,exact:true}).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 11,700');
  await clickGuideMask(page);
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 1 人');
}
