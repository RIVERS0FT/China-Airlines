import { selectCity, inspectCity, routeDetails, detailValue, openGlobal } from './dispatch-helpers.js';
import { test, expect, type Page } from '@playwright/test';
import { GameCore, type GameState } from '../src/core/game.js';
const NOW = Date.parse('2026-09-11T00:00:00Z'), ID = 'AC0001';
const money = (n:number) => `¥ ${Math.round(n).toLocaleString('zh-CN')}`;
function prepared() {
  const c=new GameCore(NOW);
  c.execute({type:'unlock',airportId:'WUH'},NOW);
  c.execute({type:'buy',modelId:'swift-f',airportId:'PEK'},NOW);
  c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
  c.execute({type:'open-plan-routes',planeId:ID,stops:['WUH','PVG','PEK']},NOW);
  return c;
}
function flying() {const c=prepared();c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG','PEK']},NOW);return c.snapshot();}
let errors:string[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));
async function load(page:Page,s:GameState){
  await page.clock.install({time:new Date(NOW)});await page.clock.pauseAt(new Date(NOW+1000));
  await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await openGlobal(page, '存档设置');
  page.once('dialog', dialog => { expect(dialog.type()).toBe('confirm'); expect(dialog.message()).toContain('导入将替换'); void dialog.accept(); });
  await page.getByLabel('选择存档文件').setInputFiles({name:'flight-view.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});
  await expect(page.getByTestId('fleet-count')).toHaveText(`${s.fleet.length} 架`);
  await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
  await page.getByRole('button',{name:'关闭存档设置'}).click();
  await page.getByRole('button',{name:'关闭提示',exact:true}).click();
}

test('empty-airport browsing and the running list keep independent aircraft locations',async({page})=>{
  const s=flying();await page.setViewportSize({width:667,height:375});await load(page,s);
  await openGlobal(page, '机场目录');
  await page.getByRole('button',{name:'查看上海机场',exact:true}).click();
  await page.getByRole('button',{name:'进入候机大厅',exact:true}).click();
  await expect(page.locator('.gate-sign')).toContainText('上海航空港');
  await expect(page.getByTestId('plane-art')).toHaveCount(0);
  await expect(page.getByTestId('flight-cost')).toHaveCount(0);
  await expect(page.getByTestId('waiting-order')).toHaveCount(12);
  await expect(page.getByRole('button', { name: /^同目的地装载：/ }).first()).toBeDisabled();
  await openGlobal(page, '机队管理概览');
  const row=page.locator(`[data-plane-id="${ID}"]`);
  await expect(row).toContainText('北京 → 武汉');
  await row.getByRole('button',{name:`查看${ID}飞机`,exact:true}).click();await expect(page.getByRole('tab', { name: '飞机', exact: true })).toHaveAttribute('aria-selected', 'true');await page.getByRole('button', { name: '前往这架飞机', exact: true }).click();
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await expect(page.locator('.gate-sign')).toContainText('北京 → 武汉');
  await expect(page.getByRole('button',{name:/^返回所选飞机/})).toHaveCount(0);
  await expect(page.getByTestId('flight-revenue')).toHaveText('¥ 0');
  await openGlobal(page, '机队管理');
  await expect(page.locator('.hangar-selector button[aria-pressed=true]')).toContainText(ID);
  await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
});

test('airport detail inspection and incoming selection preserve the locked in-flight ledger',async({page})=>{
  const s=flying(),f=s.fleet[0]!.flight!;await load(page,s);
  await page.getByRole('button',{name:'航线地图',exact:true}).click();
  await selectCity(page, 'PVG');
  await inspectCity(page, '查看上海机场详情');
  await expect(page.getByRole('dialog',{name:'机场详情',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect((await routeDetails(page)).locator('.dispatch-route-title')).toContainText('北京 → 武汉');
  await expect(page.getByTestId('network-cost')).toHaveText(money(f.cost));
  await expect(await detailValue(page, 'network-revenue')).toHaveText('¥ 0');
  await expect(page.getByTestId('dispatch')).toHaveCount(0);
  await selectCity(page, 'WUH');
  await inspectCity(page, '查看武汉机场详情');
  await expect(page.getByTestId('airport-parked').getByRole('listitem')).toHaveCount(0);
  await page.getByTestId('airport-incoming').getByRole('button',{name:`查看航班${ID}`,exact:true}).click();
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await expect(page.getByTestId('flight-cost')).toHaveText(money(f.cost));
  await expect(page.getByTestId('flight-revenue')).toHaveText('¥ 0');
  await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
});
