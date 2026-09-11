import { test, expect, type Page } from '@playwright/test';
import { GameCore } from '../src/core/game.js';
async function ready(page: Page) {await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');await expect(page.getByTestId('airport-scene')).toBeVisible();}
async function dismissReport(page: Page) {const button=page.getByRole('button',{name:'继续经营',exact:true});if(await button.isVisible())await button.click();}
test('automatic return, stop after current flight, and reload do not duplicate income',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-09-11T00:00:00Z')});await ready(page);
  await page.getByRole('button',{name:'同目的地装载',exact:true}).click();await page.getByRole('button',{name:'选择航线起飞',exact:true}).click();
  await page.getByLabel('选择机场',{exact:true}).selectOption('PVG');await page.getByLabel('自动往返').check();await page.getByTestId('dispatch').click();
  await page.clock.fastForward(300_000);await expect(page.getByTestId('flights-count')).toHaveText('3 班');await dismissReport(page);
  await page.getByRole('button',{name:'停止自动往返',exact:true}).click();await page.clock.fastForward(180_000);
  await expect(page.getByTestId('flights-count')).toHaveText('4 班');await dismissReport(page);
  await page.getByRole('button',{name:'存档设置',exact:true}).click();await page.getByRole('button',{name:'立即保存',exact:true}).click();
  const credits=await page.getByTestId('credits').textContent();await page.reload();await expect(page.getByTestId('flights-count')).toHaveText('4 班');await expect(page.getByTestId('credits')).toHaveText(credits!);expect(errors).toEqual([]);
});
test('a corrupt primary recovers a verified backup instead of silently starting over',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
  const fixture=new GameCore(Date.now());fixture.execute({type:'unlock',airportId:'WUH'},Date.now());const backup=fixture.snapshot();
  await page.goto('./icon.svg');
  await page.evaluate(async state=>{await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('china-airlines');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('saves','readwrite'),table=transaction.objectStore('saves');table.put({slot:'backup',revision:1,savedAt:Date.now(),state});table.put({slot:'main',revision:2,savedAt:Date.now(),state:{...state,version:999}});transaction.oncomplete=()=>{db.close();resolve();};transaction.onabort=()=>{db.close();reject(transaction.error);};};});},backup);
  await page.goto('./');await expect(page.getByTestId('credits')).toHaveText('¥ 148,000');await expect(page.getByText('已解锁 3',{exact:false})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'主存档损坏'})).toBeVisible();
  await page.reload();await expect(page.getByTestId('credits')).toHaveText('¥ 148,000');expect(errors).toEqual([]);
});
