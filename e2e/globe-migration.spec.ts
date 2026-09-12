import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import unitFlying from '../tests/fixtures/v5-unit-flying.json' with { type: 'json' };
import { leaveMap } from './dispatch-helpers.js';

for (const [width, height] of [[1440, 900], [667, 375]] as const) {
  test(`shipped v5 starter flight survives import, spherical inspection and v6 export at ${width}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height });
    await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-12T00:00:01Z'));
    await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: '存档设置', exact: true }).click();
    page.once('dialog', d => void d.accept());
    await page.getByLabel('选择存档文件').setInputFiles({ name: 'v5-starter.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(unitFlying)) });
    await expect(page.locator('.aviation-stage.is-flying')).toBeAttached();
    await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 6 / 6 人');
    const credits = await page.getByTestId('credits').textContent();
    await page.getByRole('button', { name: '航线地图', exact: true }).click();
    const host = page.getByTestId('map-canvas'); await expect(host).toHaveAttribute('data-renderer', 'ready');
    await page.clock.runFor(100);
    await expect(host).toHaveAttribute('data-passenger-destinations', 'PVG:6');
    await expect(host).toHaveAttribute('data-projection', 'orthographic');
    await host.locator('canvas').focus(); await page.keyboard.press('ArrowRight'); await page.clock.runFor(50);
    await expect(page.getByTestId('credits')).toHaveText(credits!);
    await page.screenshot({ path: `artifacts/globe-v5-starter-${width}.png` });
    await leaveMap(page); await page.getByRole('button', { name: '存档设置', exact: true }).click();
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '导出存档', exact: true }).click();
    const download = await pending, saved = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(saved.version).toBe(6); expect(saved.fleet).toEqual(unitFlying.fleet);
    expect(saved.orders).toEqual(unitFlying.orders); expect(saved.credits).toBe(unitFlying.credits);
    await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
    await page.reload(); await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 6 / 6 人');
    await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
