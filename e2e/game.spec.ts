import { selectCity, detailValue, launchRoute, leaveMap, openGlobal } from './dispatch-helpers.js';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
let pageErrors:string[]=[];
test.beforeEach(async({page})=>{pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));});
test.afterEach(()=>{expect(pageErrors).toEqual([]);});
async function ready(page:Page){await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');await expect(page.getByTestId('airport-scene')).toBeVisible();}
async function settings(page:Page){if(await page.locator('.game-modal').isVisible())await page.locator('.game-modal>header button').click();await openGlobal(page, '存档设置');await expect(page.getByRole('dialog')).toBeVisible();}
async function chooseShanghai(page:Page){

  await selectCity(page, 'PEK');
  await selectCity(page, 'PVG');
  await expect(await detailValue(page, 'plan-summary')).toContainText('1 段');
}
test('desktop loading, first flight, reward, and reload',async({page})=>{
  await page.clock.install({time:new Date('2026-09-11T00:00:00Z')});await ready(page);
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();await page.getByRole('button',{name:'制定路线',exact:true}).click();await chooseShanghai(page);
  await expect(page.getByTestId('dispatch')).toBeEnabled();await launchRoute(page);
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();await page.screenshot({path:'artifacts/desktop-flight.png'});
  await page.clock.fastForward(180_000);await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  const resume=page.getByRole('button',{name:'继续经营'});if(await resume.isVisible())await resume.click();
  await page.getByRole('button',{name:'运营任务',exact:true}).click();await page.getByRole('button',{name:'领取奖励',exact:true}).click();
  await expect(page.getByRole('button',{name:'已领取',exact:true})).toBeDisabled();
  const credits=await page.getByTestId('credits').textContent();await page.reload();
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');await expect(page.getByTestId('credits')).toHaveText(credits!);
});
test('purchase, export, invalid import, and valid restore',async({page})=>{
  await ready(page);page.on('dialog',dialog=>void dialog.accept());
  await openGlobal(page, '飞机商店');await page.getByRole('button',{name:'购买云雀 70',exact:true}).click();
  await expect(page.getByTestId('fleet-count')).toHaveText('2 架');await settings(page);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();const download=await downloadPromise;
  const raw=await readFile((await download.path())!,'utf8');expect(JSON.parse(raw).fleet).toHaveLength(2);
  const credits=await page.getByTestId('credits').textContent();
  await page.getByLabel('选择存档文件').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.getByRole('alert')).toContainText('无法解析');await expect(page.getByTestId('credits')).toHaveText(credits!);
  await page.getByRole('button',{name:'关闭存档设置'}).click();await page.reload();await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  await settings(page);await page.getByRole('button',{name:'重新开始',exact:true}).click();await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByLabel('选择存档文件').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(raw)});
  await expect(page.getByTestId('fleet-count')).toHaveText('2 架');await expect(page.getByTestId('credits')).toHaveText(credits!);
});
test('cached airport and PixiJS map start offline without external requests',async({page,context})=>{
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
  await ready(page);await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));await context.setOffline(true);await page.reload();
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');await expect(page.getByTestId('airport-scene')).toBeVisible();
  await page.getByRole('button',{name:'航线地图',exact:true}).click();await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer','ready');
  await openGlobal(page, '飞机商店');await page.getByRole('button',{name:'购买云雀 70',exact:true}).click();
  await expect(page.getByTestId('fleet-count')).toHaveText('2 架');await page.reload();await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  expect(requests.filter(url=>/^https?:/.test(url)&&!url.startsWith('http://127.0.0.1:4173/'))).toEqual([]);
});
test('landscape touch loading and portrait prompt',async({browser,baseURL})=>{
  const context=await browser.newContext({baseURL,viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));await ready(page);
  await page.getByRole('button',{name:'航线地图',exact:true}).click();await selectCity(page, 'WUH');await page.getByRole('button',{name:/解锁机场/}).click();
  await expect(await detailValue(page, 'plan-summary')).toContainText('1 段');await leaveMap(page);await openGlobal(page, '机场目录');await expect(page.getByRole('button',{name:'已开放 3',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭机场目录',exact:true}).click();
  await page.getByTestId('waiting-order').first().tap();await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  await expect(page.locator('.rotate-screen')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/landscape.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.rotate-screen')).toBeVisible();
  await page.screenshot({path:'artifacts/portrait.png',fullPage:true});await context.close();
});
test('a competing tab cannot overwrite the first writer and recovery stays reachable',async({page,context})=>{
  await ready(page);const other=await context.newPage();other.on('pageerror',e=>pageErrors.push(e.message));await ready(other);
  await settings(page);await page.getByRole('button',{name:'立即保存',exact:true}).click();
  await expect(page.getByRole('heading',{name:'此存档正在另一个窗口中使用'})).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(0);
  await settings(other);await other.getByRole('button',{name:'立即保存',exact:true}).click();await expect(other.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button',{name:'重新载入最新进度',exact:true}).click();await expect(page.locator('.blocking-screen')).toHaveCount(0);await expect(page.getByTestId('airport-scene')).toBeVisible();
});
test('captures airport, network, and collection with no overflow',async({page})=>{
  await ready(page);await page.screenshot({path:'artifacts/desktop-airport.png',fullPage:true});
  await page.getByRole('button',{name:'航线地图',exact:true}).click();await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer','ready');await page.screenshot({path:'artifacts/desktop-map.png',fullPage:true});
  await openGlobal(page, '飞机商店');await expect(page.getByRole('group',{name:'机型分类'})).toBeVisible();await expect(page.getByTestId('shop-aircraft')).toHaveCount(3);
  await page.screenshot({path:'artifacts/desktop-shop.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
