import { openGlobal } from './dispatch-helpers.js';
import { test, expect } from '@playwright/test';
import legacy from '../tests/fixtures/v1-flying.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';
test('manual loading, unloading, capacity, saved manifest, and plane switching',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
  await expect(page.getByTestId('waiting-order')).toHaveCount(12);
  await expect(page.getByTestId('waiting-order').nth(0)).toHaveAttribute('aria-label',/1位旅客/);
  await expect(page.getByTestId('waiting-order').nth(2)).toHaveAttribute('aria-label',/1吨货物/);
  await testInfo.attach('unit-orders-small-starter',{body:await page.screenshot(),contentType:'image/png'});
  await page.getByTestId('waiting-order').first().click();
  await expect(page.getByTestId('onboard-count')).toHaveText('1');await page.getByRole('button',{name:'查看机上客货'}).click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);await page.getByTestId('loaded-order').first().click();
  await expect(page.getByTestId('onboard-count')).toHaveText('0');await page.getByRole('button',{name:'同目的地装载',exact:true}).click();
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 6 / 6 人');await page.reload();await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 6 / 6 人');
  await openGlobal(page, '飞机商店');await page.getByRole('button',{name:'购买云雀 70',exact:true}).click();
  await page.getByRole('button',{name:'关闭飞机商店'}).click();await page.getByRole('button',{name:'下一架飞机'}).click();await expect(page.getByTestId('onboard-count')).toHaveText('0');
  await page.getByRole('button',{name:'上一架飞机'}).click();await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 6 / 6 人');expect(errors).toEqual([]);
});
test('legacy import upgrades to v4 and exports real jobs with the old locked payment',async({page})=>{
  page.on('dialog',d=>void d.accept());await page.goto('./');await openGlobal(page, '存档设置');
  await page.getByLabel('选择存档文件').setInputFiles({name:'v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await expect(page.getByTestId('credits')).toHaveText(`¥ ${legacy.credits.toLocaleString('zh-CN')}`);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();
  const file=await downloaded,save=JSON.parse(await readFile((await file.path())!,'utf8'));expect(save.version).toBe(6);expect(save.fleet[0].flight.revenue).toBe(legacy.fleet[0]!.flight!.revenue);expect(save.orders.filter((o:{location:string})=>o.location==='AC0001')).toHaveLength(2);
  await page.getByRole('button',{name:'关闭存档设置'}).click();await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
});
