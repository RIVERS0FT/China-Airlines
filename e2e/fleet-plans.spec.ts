import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import v2 from '../tests/fixtures/v2-flying.json' with { type: 'json' };
let errors: string[];
test.beforeEach(async({page})=>{ errors=[];page.on('pageerror',e=>errors.push(e.message)); });
test.afterEach(()=>expect(errors).toEqual([]));
async function ready(page:Page){await page.clock.install({time:new Date('2026-09-11T00:00:00Z')});await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');}
async function plan(page:Page){
  await page.getByRole('button',{name:'同目的地装载',exact:true}).click();
  await page.getByRole('button',{name:'选择航线起飞',exact:true}).click();
  await page.getByLabel('选择机场',{exact:true}).selectOption('WUH');
  await page.getByRole('button',{name:/^解锁机场/}).click();
  await page.getByRole('button',{name:'多段计划',exact:true}).click();
  await page.getByRole('button',{name:'添加武汉航段'}).click();
  await page.getByLabel('选择机场',{exact:true}).selectOption('PVG');
  await page.getByRole('button',{name:'添加上海航段'}).click();
  await expect(page.getByTestId('plan-summary')).toContainText('2 段');
  await page.getByRole('button',{name:/^开通计划航线/}).click();
}
test('specialist purchase, real cargo loading, workshop retrofit and hangar expansion',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'飞机商店',exact:true}).click();
  await page.getByRole('button',{name:'纯货机',exact:true}).click();await expect(page.getByTestId('shop-aircraft')).toHaveCount(3);
  await page.screenshot({path:'artifacts/desktop-specialist-shop.png'});
  await page.getByRole('button',{name:'购买云雀 8F',exact:true}).click();await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  await page.getByRole('button',{name:'关闭飞机商店'}).click();await page.getByRole('button',{name:'下一架飞机'}).click();
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 0 人');
  await page.getByRole('button',{name:'同目的地装载',exact:true}).click();await expect(page.getByTestId('onboard-count')).toHaveText('4');
  await page.getByRole('button',{name:'机队管理',exact:true}).click();
  await page.getByRole('button',{name:/云雀 8F.*AC0002/}).click();
  await page.getByRole('button',{name:'升级发动机',exact:true}).click();await expect(page.getByTestId('upgrade-engine')).toContainText('Lv.1');
  await page.getByRole('button',{name:/^扩建 2 个机位/}).click();await expect(page.getByTestId('hangar-capacity')).toHaveText('机位 2 / 6');
  await page.screenshot({path:'artifacts/desktop-hangar.png'});
  await page.reload();await page.getByRole('button',{name:'机队管理',exact:true}).click();await expect(page.getByTestId('hangar-capacity')).toHaveText('机位 2 / 6');
  await page.getByRole('button',{name:/云雀 8F.*AC0002/}).click();await expect(page.getByTestId('upgrade-engine')).toContainText('Lv.1');
});
test('map plan executes two legs, survives reload and does not pay twice',async({page})=>{
  await ready(page);await plan(page);await page.screenshot({path:'artifacts/desktop-plan.png'});
  await page.getByRole('button',{name:'执行运输计划',exact:true}).click();await expect(page.getByTestId('active-plan')).toContainText('上海');
  await page.reload();await expect(page.getByTestId('active-plan')).toContainText('上海');
  await page.clock.fastForward(220000);await expect(page.getByTestId('flights-count')).toHaveText('2 班');
  await expect(page.getByTestId('onboard-count')).toHaveText('0');const credits=await page.getByTestId('credits').textContent();
  await page.reload();await expect(page.getByTestId('flights-count')).toHaveText('2 班');await expect(page.getByTestId('credits')).toHaveText(credits!);
});
test('cancel plan in flight only removes onward destinations',async({page})=>{
  await ready(page);await plan(page);await page.getByRole('button',{name:'执行运输计划',exact:true}).click();
  await page.getByRole('button',{name:'取消剩余计划',exact:true}).click();await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await page.clock.fastForward(200000);await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.locator('.gate-sign')).toContainText('武汉');await expect(page.getByTestId('onboard-count')).not.toHaveText('0');
});
test('v2 import preserves manifest and exports v4 upgrade fields',async({page})=>{
  const previousPlane = v2.fleet[0];
  if (!previousPlane?.flight) throw new Error('v2 migration fixture must contain an active flight');
  await ready(page);page.on('dialog',d=>void d.accept());await page.getByRole('button',{name:'存档设置',exact:true}).click();
  await page.getByLabel('选择存档文件').setInputFiles({name:'v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(v2))});
  await expect(page.getByTestId('credits')).toHaveText(`¥ ${v2.credits.toLocaleString('zh-CN')}`);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();
  const file=await pending,s=JSON.parse(await readFile((await file.path())!,'utf8'));
  expect(s.version).toBe(5);expect(s.hangarSlots).toBe(4);expect(s.orders).toEqual(v2.orders);expect(s.fleet[0].flight).toEqual(previousPlane.flight);
  expect(s.fleet[0].upgrades).toEqual({capacity:0,engine:0,range:0,efficiency:0});
});
test('landscape plan editor and workshop stay reachable',async({page})=>{
  await page.setViewportSize({width:844,height:390});await ready(page);await plan(page);
  await expect(page.getByRole('button',{name:'执行运输计划',exact:true})).toBeInViewport();
  await page.screenshot({path:'artifacts/landscape-plan.png'});
  await page.getByRole('button',{name:'机队管理',exact:true}).click();
  await page.getByRole('button',{name:'升级舱位扩充',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'升级舱位扩充',exact:true}).click();
  await expect(page.getByTestId('upgrade-capacity')).toContainText('Lv.1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/landscape-workshop.png'});
});
