import { displayScale } from './display-helpers.js';
import { selectCity, openGlobal } from './dispatch-helpers.js';
import { test, expect, type Page } from './fixture.js';
import { GameCore, planQuote, type GameState } from '../src/core/game.js';
const NOW = Date.parse('2026-09-11T00:00:00Z'), ID = 'AC0001';
const money = (n:number) => `¥ ${Math.round(n).toLocaleString('zh-CN')}`;
function prepared() {
  const c=new GameCore(NOW);c.execute({type:'hire-dispatcher',planeId:ID},NOW);
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
test('active map keeps the locked route and payment while another airport is browsed',async({page})=>{
  const s=flying(),f=s.fleet[0]!.flight!;await load(page,s);
  await expect(page.getByTestId('flight-cost')).toHaveText(money(f.cost));await expect(page.getByTestId('flight-revenue')).toHaveText('¥ 0');
  await page.getByRole('button',{name:'地图',exact:true}).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
  await page.clock.runFor(50); // Render once while the business clock is paused.
  await selectCity(page, 'URC');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', '');
  await expect(page.getByTestId('network-summary')).toHaveCount(0);
  await expect(page.getByTestId('dispatch')).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'机场详情',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/^解锁机场/})).toBeVisible();
  await page.keyboard.press('Escape');
  await selectCity(page, 'PVG');
  await expect(page.getByTestId('airport-incoming')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '机场装载', exact: true }).click();
  await expect(page.getByTestId('flight-cost')).toHaveText(money(f.cost));
  await expect(page.getByTestId('flight-revenue')).toHaveText('¥ 0');
  await expect(page.getByTestId('credits')).toHaveText(money(s.credits));await page.reload();
  await expect(page.getByTestId('flight-profit')).toHaveText(money(-f.cost));await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
});
test('fleet filters switch scenes only and the workshop keeps the chosen aircraft',async({page})=>{
  const s=flying(),second=s.fleet[1]!.id;await load(page,s);await openGlobal(page, '机队管理概览');
  await expect(page.getByTestId('flight-row')).toHaveCount(2);await page.getByRole('button',{name:/^待命飞机/}).click();
  await expect(page.getByTestId('flight-row')).toHaveAttribute('data-plane-id',second);
  await page.getByRole('button',{name:`查看${second}飞机`}).click();await expect(page.getByRole('tab', { name: '飞机', exact: true })).toHaveAttribute('aria-selected', 'true');await page.getByRole('button', { name: '前往这架飞机', exact: true }).click();await expect(page.locator('.plane-status')).toContainText(second);
  await expect(page.locator('.aviation-stage.is-flying')).toHaveCount(0);await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
  await openGlobal(page, '机队管理');await expect(page.locator('.hangar-selector button[aria-pressed=true]')).toContainText(second);
  await page.getByRole('button',{name:'关闭机队管理'}).click();await openGlobal(page, '机队管理概览');
  await page.getByRole('button',{name:/^飞行中的飞机/}).click();await page.getByRole('button',{name:`查看${ID}飞机`}).click();await expect(page.getByRole('tab', { name: '飞机', exact: true })).toHaveAttribute('aria-selected', 'true');await page.getByRole('button', { name: '前往这架飞机', exact: true }).click();
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
});
test('a next leg appears only after departure and final delivery cannot be repeated by viewing',async({page})=>{
  const c=prepared(),s0=c.snapshot(),q=planQuote(s0,s0.fleet[0]!,['WUH','PVG','PEK']);
  c.execute({type:'dispatch-plan',planeId:ID,stops:['WUH','PVG','PEK']},NOW);const s=c.snapshot();await load(page,s);
  await page.clock.fastForward((q.legs[0]!.duration+9)*1000);
  await expect(page.getByTestId('flights-count')).toHaveText('1 班');await expect(page.getByTestId('flight-revenue')).toHaveText(money(q.legs[1]!.revenue));
  await openGlobal(page, '机队管理概览');await expect(page.locator(`[data-plane-id="${ID}"] .flight-route`)).toContainText('武汉 → 上海');
  await page.clock.fastForward(1_200_000);await page.getByRole('button',{name:/^飞行中的飞机/}).click();await expect(page.getByTestId('flight-row')).toHaveCount(0);
  await expect(page.getByText('当前没有飞行中的飞机。',{exact:true})).toBeVisible();await page.getByRole('button',{name:'显示全部飞机',exact:true}).click();await expect(page.getByTestId('flight-row')).toHaveCount(2);
  await page.getByRole('button',{name:'关闭机队管理'}).click();const credits=money(s0.credits-q.cost+q.revenue);
  await expect(page.getByTestId('credits')).toHaveText(credits);await expect(page.getByTestId('flights-count')).toHaveText('3 班');
  await page.reload();await expect(page.getByTestId('credits')).toHaveText(credits);await expect(page.getByTestId('flights-count')).toHaveText('3 班');
});
test('automatic waiting is not mislabeled as ready or a paid flight',async({page})=>{
  let s=prepared().snapshot();s.orders=[];const c=new GameCore(NOW,s);c.execute({type:'start-duty',planeId:ID,to:'PVG'},NOW);s=c.snapshot();await load(page,s);
  await expect(page.locator('.plane-status')).toContainText('自动值勤');await expect(page.locator('.plane-status')).not.toContainText('后可操作');
  await openGlobal(page, '机队管理概览');const row=page.locator(`[data-plane-id="${ID}"]`);
  await expect(row).toHaveAttribute('data-phase','automatic');await expect(row.getByRole('group',{name:'当前航班收支'})).toHaveCount(0);
  await expect(row).toContainText('下次调度检查');await page.getByRole('button',{name:/^待命飞机/}).click();await expect(page.getByTestId('flight-row')).toHaveCount(1);
});
for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:667,height:375}])test(`running scene and board remain readable at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);await load(page,flying());
  const toolbar=page.locator('.scene-flight-summary');
  for(const id of ['flight-cost','flight-revenue','flight-profit']){
    const text=page.getByTestId(id);await expect(text).toBeInViewport();
    const parent=await toolbar.boundingBox(),box=await text.boundingBox();expect(parent&&box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(parent!.x);expect(box!.x+box!.width).toBeLessThanOrEqual(parent!.x+parent!.width);
    expect(box!.y+box!.height).toBeLessThanOrEqual(parent!.y+parent!.height+1);
  }
  await expect(page.locator('.apron-queue')).toHaveCount(0);await expect(page.getByTestId('loaded-order')).toHaveCount(0);
  await page.screenshot({path:`artifacts/running-flight-${viewport.width}.png`});
  await openGlobal(page, '机队管理概览');await expect(page.getByRole('dialog',{name:'机队管理'})).toBeVisible();
  const row=page.getByTestId('flight-row').first();
  await expect(page.getByRole('group',{name:'运行状态筛选'})).toBeInViewport();
  const box=await row.boundingBox();expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(350 * await displayScale(page));
  expect(box!.height).toBeGreaterThan(200 * await displayScale(page));
  expect(await page.locator('.fleet-operations').evaluate(el=>getComputedStyle(el).display)).toBe('block');
  expect(await page.locator('.flight-list').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  if(viewport.width>=1000)await expect(row.getByRole('group',{name:'当前航班收支'})).toBeInViewport();
  await page.getByRole('button',{name:`查看${ID}飞机`}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:`查看${ID}飞机`})).toBeInViewport();
  await page.screenshot({path:`artifacts/fleet-board-${viewport.width}.png`});await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'机队管理概览',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
