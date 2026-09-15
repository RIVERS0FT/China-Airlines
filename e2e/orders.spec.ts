import { openGlobal } from './dispatch-helpers.js';
import { test, expect } from './fixture.js';
import legacy from '../tests/fixtures/v1-flying.json' with { type: 'json' };
import { rejectRetiredSave } from './retired-save-helpers.js';

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`manual loading stays quiet, persists and switches planes at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expect(page.getByTestId('waiting-order')).toHaveCount(12);
    await expect(page.getByTestId('waiting-order').nth(0)).toHaveAttribute('aria-label', /1位旅客/);
    await expect(page.getByTestId('waiting-order').nth(2)).toHaveAttribute('aria-label', /1吨货物/);
    await testInfo.attach('unit-orders-small-starter', { body: await page.screenshot(), contentType: 'image/png' });

    await page.getByTestId('waiting-order').first().click();
    await expect(page.getByTestId('loaded-order')).toHaveCount(1);
    // Sample immediately after the saved state is published; a retrying absence
    // assertion could incorrectly pass after the old four-second toast expires.
    expect(await page.locator('.toast').allTextContents()).toEqual([]);
    await page.getByRole('button', { name: '查看机上客货' }).click();
    await expect(page.getByTestId('loaded-order')).toHaveCount(1);
    await page.getByTestId('loaded-order').first().click();
    await expect(page.getByTestId('loaded-order')).toHaveCount(0);
    expect(await page.locator('.toast').allTextContents()).toEqual([]);
    await testInfo.attach('unloaded-without-transfer-toast', { body: await page.screenshot(), contentType: 'image/png' });

    await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 3 / 3 人');
    expect(await page.locator('.toast').allTextContents()).toEqual([]);
    await page.reload();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 3 / 3 人');
    expect(await page.locator('.toast').allTextContents()).toEqual([]);

    await openGlobal(page, '飞机商店');
    await page.getByRole('button', { name: '购买雨燕 客货型', exact: true }).click();
    await page.getByRole('button', { name: '关闭飞机商店' }).click();
    // Important non-loading confirmations must not be globally hidden.
    await expect(page.locator('.toast')).toBeVisible();
    await page.getByRole('button', { name: '下一架飞机' }).click();
    await expect(page.getByTestId('loaded-order')).toHaveCount(0);
    await page.getByRole('button', { name: '上一架飞机' }).click();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 3 / 3 人');
    await expect(page.locator('.toast')).toBeVisible();
    await page.getByTestId('loaded-order').first().click();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 2 / 3 人');
    // A quiet command also clears a previous success toast, not just its own log.
    expect(await page.locator('.toast').allTextContents()).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('retired v1 import keeps current progress through export and reload',async({page})=>{
  await page.clock.install({time:new Date('2026-09-12T00:00:00Z')});await page.clock.pauseAt(new Date('2026-09-12T00:00:01Z'));
  await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');await rejectRetiredSave(page,legacy);
});
