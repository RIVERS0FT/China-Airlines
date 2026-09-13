import { expect, test, type Page } from '@playwright/test';
import { airport } from '../src/core/catalog.js';
import { projectGeo, type GlobeCamera } from '../src/ui/globe-geometry.js';
import { UI_SCALE_KEY } from '../src/ui/viewport.js';
import { displayScale } from './display-helpers.js';

async function ready(page: Page) {
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}
async function dimensions(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.game-layout')!, frame = root.getBoundingClientRect();
    const selectors = ['.game-hud', '.scene-wrap', '.apron-queue', '.game-dock', '.depart-button', '.gate-sign'];
    return selectors.flatMap(selector => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return [(r.x - frame.x) / frame.width, (r.y - frame.y) / frame.height, r.width / frame.width, r.height / frame.height];
    });
  });
}
for (const zoom of [75, 100, 125, 150]) {
  test(`same aspect ratio has identical proportions across resolution, touch and DPR at ${zoom}%`, async ({ browser, baseURL }) => {
    const results: number[][] = [];
    for (const [width, height, dpr, mobile] of [[1280, 720, 1, false], [640, 360, 3, true]] as const) {
      const context = await browser.newContext({ baseURL, viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
      try {
        const page = await context.newPage();
        await page.addInitScript(({ key, zoom }) => localStorage.setItem(key, String(zoom)), { key: UI_SCALE_KEY, zoom });
        await ready(page); await expect(page.getByTestId('game-layout')).toHaveAttribute('data-ui-scale', String(zoom));
        results.push(await dimensions(page));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.getByRole('button', { name:'存档设置', exact:true }).click();
        const dialog = (await page.getByRole('dialog').boundingBox())!;
        expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.y).toBeGreaterThanOrEqual(0);
        expect(dialog.x + dialog.width).toBeLessThanOrEqual(width + 1); expect(dialog.y + dialog.height).toBeLessThanOrEqual(height + 1);
        await expect(page.getByRole('slider', {name:'UI 缩放'})).toHaveValue(String(zoom));
        await page.screenshot({ path:`artifacts/display-${width}-${zoom}.png` });
      } finally { await context.close(); }
    }
    for (let i = 0; i < results[0]!.length; i++) expect(results[0]![i]).toBeCloseTo(results[1]![i]!, 5);
  });
}
test('scale controls update immediately, survive reload, and reset without changing game data', async ({ page }) => {
  await page.setViewportSize({ width:844, height:390 }); await ready(page);
  const credits = await page.getByTestId('credits').textContent();
  await page.getByRole('button', { name:'存档设置', exact:true }).click();
  const slider = page.getByRole('slider', { name:'UI 缩放' });
  await page.getByRole('button', {name:'125%', exact:true}).click(); await expect(slider).toHaveValue('125');
  await page.getByRole('button', {name:'放大界面', exact:true}).click(); await expect(slider).toHaveValue('130');
  await slider.focus(); await page.keyboard.press('ArrowLeft'); await expect(slider).toHaveValue('125');
  await page.reload(); await expect(page.getByTestId('game-layout')).toHaveAttribute('data-ui-scale', '125');
  await expect(page.getByTestId('credits')).toHaveText(credits!);
  await page.getByRole('button', {name:'存档设置', exact:true}).click();
  await page.getByRole('button', {name:'恢复默认缩放', exact:true}).click(); await expect(slider).toHaveValue('100');
  await page.getByRole('button', {name:'关闭存档设置', exact:true}).click();
  await page.setViewportSize({width:390,height:844}); await expect(page.locator('.rotate-screen')).toBeVisible();
  await page.setViewportSize({width:844,height:390}); await expect(page.locator('.rotate-screen')).toBeHidden();
  await expect(page.getByTestId('credits')).toHaveText(credits!);
});
for (const zoom of [75, 100, 150]) test(`scaled map pointer hits the projected airport at ${zoom}%`, async ({ browser, baseURL }) => {
  const context = await browser.newContext({baseURL,viewport:{width:844,height:390},hasTouch:true});
  try {
    const page = await context.newPage(); await ready(page);
    await page.getByRole('button', {name:'存档设置', exact:true}).click();
    await page.getByRole('button', {name:`${zoom}%`, exact:true}).click();
    await page.getByRole('button', {name:'关闭存档设置', exact:true}).click();
    await page.getByRole('button', {name:'航线地图', exact:true}).click();
    await page.getByRole('button', {name:'关闭选路提示', exact:true}).click();
    const host = page.getByTestId('map-canvas'); await expect(host).toHaveAttribute('data-renderer','ready');
    await expect(host).toHaveAttribute('data-camera',/radius/);
    const camera = JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera;
    const city = projectGeo(airport('PVG'), camera), rect = (await host.boundingBox())!, scale = await displayScale(page);
    await page.touchscreen.tap(rect.x + city.x * scale, rect.y + city.y * scale);
    await expect(host).toHaveAttribute('data-preview-path','PVG');
    await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
    const before = JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera;
    await page.setViewportSize({width:1688,height:780});
    await expect.poll(async () => JSON.parse((await host.getAttribute('data-camera'))!) as GlobeCamera).toEqual(before);
    await expect(host).toHaveAttribute('data-preview-path','PVG');
  } finally { await context.close(); }
});
test('invalid stored scale falls back safely', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key,'not-a-number'),UI_SCALE_KEY);
  await ready(page); await expect(page.getByTestId('game-layout')).toHaveAttribute('data-ui-scale','100');
});
