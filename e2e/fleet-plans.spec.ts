import { selectCity, closeRouteDetails, detailValue, launchRoute, openGlobal } from './dispatch-helpers.js';
import { test, expect, type Page } from './fixture.js';
import { rejectRetiredSave } from './retired-save-helpers.js';
import v2 from '../tests/fixtures/v2-flying.json' with { type: 'json' };
let errors: string[];
test.beforeEach(async({page})=>{ errors=[];page.on('pageerror',e=>errors.push(e.message)); });
test.afterEach(()=>expect(errors).toEqual([]));
async function ready(page:Page){await page.clock.install({time:new Date('2026-09-11T00:00:00Z')});await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');}
async function plan(page:Page){
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await page.getByRole('button',{name:'制定路线',exact:true}).click();
  await expect(page.getByRole('button',{name:'选择目的城市',exact:true})).toBeVisible();
  await selectCity(page, 'WUH');
  const detail=page.getByRole('dialog',{name:'机场详情',exact:true});
  await expect(detail).toBeVisible();
  await detail.getByRole('button',{name:/^解锁机场/}).click();
  await expect(detail).toHaveCount(0);
  await expect(await detailValue(page, 'plan-summary')).toContainText('1 段');
  await selectCity(page, 'PVG');
  await expect(await detailValue(page, 'plan-summary')).toContainText('2 段');
  await closeRouteDetails(page);await expect(page.getByRole('button',{name:'检票起飞',exact:true})).toBeEnabled();
}
test('specialist purchase, real cargo loading, workshop retrofit and hangar expansion',async({page})=>{
  await ready(page);await openGlobal(page, '飞机商店');
  await page.getByRole('button',{name:'纯货机',exact:true}).click();await expect(page.getByTestId('shop-aircraft')).toHaveCount(4);
  await page.screenshot({path:'artifacts/desktop-specialist-shop.png'});
  await page.getByRole('button',{name:'购买雨燕 货运型',exact:true}).click();await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  await page.getByRole('button',{name:'关闭飞机商店'}).click();await page.getByRole('button',{name:'下一架飞机'}).click();
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 0 / 0 人');
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();await expect(page.getByTestId('loaded-order')).toHaveCount(3);
  await openGlobal(page, '机队管理');
  await page.getByRole('button',{name:/雨燕 货运型.*AC0002/}).click();
  await page.getByRole('button',{name:'升级发动机',exact:true}).click();await expect(page.getByTestId('upgrade-engine')).toContainText('Lv.1');
  await page.getByRole('button',{name:/^扩建 2 个机位/}).click();await expect(page.getByTestId('hangar-capacity')).toHaveText('机位 2 / 6');
  await page.screenshot({path:'artifacts/desktop-hangar.png'});
  await page.reload();await openGlobal(page, '机队管理');await expect(page.getByTestId('hangar-capacity')).toHaveText('机位 2 / 6');
  await page.getByRole('button',{name:/雨燕 货运型.*AC0002/}).click();await expect(page.getByTestId('upgrade-engine')).toContainText('Lv.1');
});
test('click-order route executes two legs, survives reload and does not pay twice',async({page})=>{
  await ready(page);await plan(page);await page.screenshot({path:'artifacts/desktop-plan.png'});
  await launchRoute(page);await expect(page.getByTestId('active-plan')).toContainText('上海');
  await page.reload();await expect(page.getByTestId('active-plan')).toContainText('上海');
  await page.clock.fastForward(800000);await expect(page.getByTestId('flights-count')).toHaveText('2 班');
  await expect(page.getByTestId('loaded-order')).toHaveCount(0);const credits=await page.getByTestId('credits').textContent();
  await page.reload();await expect(page.getByTestId('flights-count')).toHaveText('2 班');await expect(page.getByTestId('credits')).toHaveText(credits!);
});
test('cancel plan in flight only removes onward destinations',async({page})=>{
  await ready(page);await plan(page);await launchRoute(page);
  await page.getByRole('button',{name:'取消剩余计划',exact:true}).click();await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await page.clock.fastForward(400000);await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.locator('.gate-sign')).toContainText('武汉');await expect(page.getByTestId('loaded-order')).not.toHaveCount(0);
});
test('retired v2 import keeps the current fleet',async({page})=>{
  await ready(page);await page.clock.pauseAt(new Date('2026-09-11T00:00:05Z'));await rejectRetiredSave(page,v2);
});
test('landscape plan editor and workshop stay reachable',async({page})=>{
  await page.setViewportSize({width:844,height:390});await ready(page);await plan(page);
  await expect(page.getByRole('button',{name:'检票起飞',exact:true})).toBeInViewport();
  await page.screenshot({path:'artifacts/landscape-plan.png'});
  await openGlobal(page, '机队管理');
  await page.getByRole('button',{name:'升级舱位扩充',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'升级舱位扩充',exact:true}).click();
  await expect(page.getByTestId('upgrade-capacity')).toContainText('Lv.1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/landscape-workshop.png'});
});
