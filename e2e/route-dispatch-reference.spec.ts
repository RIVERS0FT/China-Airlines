import { test, expect } from '@playwright/test';
import { selectCity, routeDetails, closeRouteDetails, launchRoute } from './dispatch-helpers.js';

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`minimal dispatch preserves four readouts and usable map at ${viewport.width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
    await page.getByRole('button', { name: '制定路线', exact: true }).click();
    await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toHaveAttribute('data-renderer', 'ready');
    await expect(canvas).toHaveAttribute('data-range-plane', 'AC0001');
    await expect(page.locator('.dispatch-stat')).toHaveCount(4);
    await expect(page.getByTestId('network-destination')).toContainText('—');
    await expect(page.locator('.game-hud')).toBeHidden();
    await expect(page.locator('.game-dock')).toBeHidden();
    await expect(page.locator('.network-mode,.plan-route-tools,.map-legend,.route-preview-key')).toHaveCount(0);
    await expect(page.getByLabel('选择机场', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('network-energy')).toHaveCount(0);
    const map = await page.locator('.network-map').boundingBox();
    expect(map!.height).toBeGreaterThanOrEqual(viewport.height * .85);
    const controls = ['放大地图','缩小地图','路线后退','路线撤销','取消起飞','查看路线','检票起飞','隐藏其他飞机'];
    const boxes = [];
    for (const name of controls) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeInViewport();
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(map!.x); expect(box.y).toBeGreaterThanOrEqual(map!.y);
      expect(box.x + box.width).toBeLessThanOrEqual(map!.x + map!.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(map!.y + map!.height + 1); boxes.push(box);
    }
    for (let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) {
      const a=boxes[i]!,b=boxes[j]!;
      expect(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y).toBe(true);
    }
    const before = await canvas.getAttribute('data-camera');
    await page.getByRole('button',{name:'放大地图',exact:true}).click();
    await expect(canvas).not.toHaveAttribute('data-camera',before!);
    await selectCity(page, 'PVG');
    await expect(canvas).toHaveAttribute('data-preview-path', 'PVG');
    await expect(canvas).toHaveAttribute('data-range-origin', 'PVG');
    await expect(page.getByTestId('network-destination')).toContainText('上海');
    const camera = await canvas.getAttribute('data-camera'), money = await page.getByTestId('credits').textContent();
    await routeDetails(page);
    await expect(page.getByTestId('plan-leg')).toHaveCount(1);
    await expect(page.getByTestId('plan-summary')).toContainText('1 段');
    await expect(page.getByTestId('network-energy')).toContainText('本段需');
    await expect(page.getByRole('checkbox',{name:/自动往返/})).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'查看路线',exact:true})).toBeFocused();
    await expect(page.getByTestId('auto-route-badge')).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-camera',camera!);
    await expect(page.getByTestId('credits')).toHaveText(money!);
    await page.getByRole('button',{name:'隐藏其他飞机',exact:true}).click();
    await expect(canvas).toHaveAttribute('data-visible-planes','AC0001');
    await page.screenshot({path:`artifacts/minimal-dispatch-${viewport.width}.png`});
    await page.getByRole('button',{name:'路线后退',exact:true}).click();
    await expect(canvas).toHaveAttribute('data-preview-path','');
    await expect(page.getByTestId('auto-route-badge')).toHaveCount(0);
    await selectCity(page,'PVG'); await page.getByRole('button',{name:'路线撤销',exact:true}).click();
    await expect(canvas).toHaveAttribute('data-preview-path','');
    await expect(page.getByTestId('credits')).toHaveText(money!);
    await selectCity(page,'PVG'); await launchRoute(page);
    await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
    await expect(page.locator('.game-hud')).toBeVisible();
    await expect(page.locator('.game-dock')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('map cancellation returns to a pinned empty airport without moving the aircraft', async({page})=>{
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button',{name:'机场目录',exact:true}).click();
  await page.getByRole('button',{name:'查看上海机场',exact:true}).click();
  await page.getByRole('button',{name:'进入候机大厅',exact:true}).click();
  await expect(page.getByTestId('plane-art')).toHaveCount(0);
  await page.getByRole('button',{name:'航线地图',exact:true}).click(); await selectCity(page,'PVG');
  await routeDetails(page); await expect(page.locator('.dispatch-route-title')).toContainText('北京 → 上海'); await closeRouteDetails(page);
  await page.getByRole('button',{name:'取消起飞',exact:true}).click();
  await expect(page.locator('.gate-sign')).toContainText('上海航空港');
  await expect(page.getByTestId('plane-art')).toHaveCount(0);
  await expect(page.getByTestId('credits')).toHaveText('¥ 18,000');
});

test('the city dialog remains a complete route input when WebGL is unavailable',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this: HTMLCanvasElement, type: string,...args: unknown[]) {
      if(type.includes('webgl')) return null;
      return Reflect.apply(original,this,[type,...args]);
    } as typeof original;
  });
  await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await page.getByRole('button',{name:'制定路线',exact:true}).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer','fallback');
  await selectCity(page,'PVG'); await expect(page.getByTestId('dispatch')).toBeEnabled(); await launchRoute(page);
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
});
