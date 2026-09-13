import { HistoricalSession as GameCore } from '../tests/career-fixtures.js';
import { selectCity, detailValue, launchRoute, openGlobal } from './dispatch-helpers.js';
import orderedV4 from '../tests/fixtures/v4-ordered-route.json' with { type: 'json' };
import { test, expect, type Page } from '@playwright/test';
import { quote, planQuote, type GameState } from '../src/core/game.js';
import { ENERGY_CAPACITY_SECONDS as CAP } from '../src/core/energy.js';
import legacy from '../tests/fixtures/v4-energy-migration.json' with { type: 'json' };
const NOW = Date.parse('2026-09-12T00:00:00Z'), ID = 'AC0001';
const money=(n:number)=>`¥ ${Math.round(n).toLocaleString('zh-CN')}`;
let errors: string[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));
function readyState(seconds=13) {
  const c=new GameCore(NOW);c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
  const s=c.snapshot();s.fleet[0]!.energy.availableSeconds=seconds;return s;
}
async function load(page:Page,state:GameState|typeof legacy|typeof orderedV4){
  await page.clock.install({time:new Date(NOW)});await page.clock.pauseAt(new Date(NOW+1000));
  await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await openGlobal(page, '存档设置');page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'energy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits));
  // Settings intentionally hides the global notice; inspect it only after closing.
  await page.getByRole('button',{name:'关闭存档设置',exact:true}).click();
  await expect(page.getByText('存档导入成功，旧进度已保留为备份。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭提示',exact:true}).click();
}
for(const [width,height] of [[1440,900],[844,390],[667,375]] as const){
  test(`energy shortage, service cancellation and exact completion persist at ${width}`,async({page})=>{
    await page.setViewportSize({width,height});const s=readyState();await load(page,s);
    await expect(page.getByTestId('plane-energy')).toBeInViewport();
    await page.getByRole('button',{name:'航线地图',exact:true}).click();await selectCity(page, 'PVG');
    await expect(await detailValue(page, 'network-energy')).toContainText('本段需');await expect(page.getByTestId('dispatch')).toBeDisabled();
    await expect(await detailValue(page, 'plan-energy')).toContainText('能量不足');
    await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
    await openGlobal(page, '机队管理');
    const service=page.getByRole('region',{name:'飞机能量管理'}); // section has an accessible name.
    await page.getByRole('button',{name:'开始地勤补能',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button',{name:'开始地勤补能',exact:true})).toBeInViewport();
    await expect(service).toContainText('历史机型继续按秒计量');
    await page.screenshot({path:`artifacts/energy-service-${width}.png`});
    await page.getByRole('button',{name:'开始地勤补能',exact:true}).click();await expect(page.getByTestId('energy-service-status')).toContainText('地勤补能中');
    await page.clock.fastForward(60000);await expect(page.getByTestId('hangar-energy')).toHaveText('0.22 / 240 点');
    await page.getByRole('button',{name:'取消地勤补能',exact:true}).click();await expect(page.getByTestId('hangar-energy')).toHaveText('0.22 / 240 点');
    await page.getByRole('button',{name:'开始地勤补能',exact:true}).click();await expect(page.getByTestId('energy-service-status')).toContainText('地勤补能中');
    await page.reload();await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await expect(page.locator('.plane-status')).toContainText('地勤补能');
    await expect(page.getByTestId('loaded-order').first()).toBeDisabled();
    await expect(page.getByTestId('loaded-order').first().locator('.job-state')).toHaveText('地勤补能中，不能装卸');
    await openGlobal(page, '航班运行表');await page.getByRole('button',{name:/^待命飞机/}).click();
    await expect(page.getByTestId('flight-row')).toHaveCount(0);await page.getByRole('button',{name:'关闭航班运行表',exact:true}).click();
    await openGlobal(page, '机队管理');
    await page.clock.fastForward(119000);await expect(page.getByTestId('hangar-energy')).toHaveText('0.22 / 240 点');
    await page.clock.fastForward(1000);await expect(page.getByTestId('hangar-energy')).toHaveText('240.00 / 240 点');
    await expect(page.getByRole('button',{name:'开始地勤补能',exact:true})).toBeDisabled();
    await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
    await expect(page.getByTestId('flights-count')).toHaveText('0 班');
    await page.reload();await expect(page.getByTestId('plane-energy')).toHaveText('能量 240.00 点');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test('the exact flight budget is reserved once and survives reload and arrival',async({page})=>{
  const s=readyState(CAP),q=quote(s,s.fleet[0]!,'PVG');await load(page,s);
  await page.getByRole('button',{name:'航线地图',exact:true}).click();await selectCity(page, 'PVG');await launchRoute(page);
  const energy=`能量 ${((CAP-q.duration)/60).toFixed(2)} 点`;
  await expect(page.getByTestId('plane-energy')).toHaveText(energy);
  await expect(page.getByTestId('flight-cost')).toHaveText(money(q.cost));
  await page.reload();await expect(page.getByTestId('plane-energy')).toHaveText(energy);
  await openGlobal(page, '机队管理');
  await expect(page.getByRole('button',{name:'开始地勤补能',exact:true})).toBeDisabled();
  await page.clock.fastForward((q.duration+8)*1000);await expect(page.getByTestId('hangar-energy')).toHaveText(`${((CAP-q.duration)/60).toFixed(2)} / 240 点`);
});
test('multi-leg energy shortage stops at the hub without erasing transfer cargo',async({page})=>{
  const c=new GameCore(NOW);c.execute({type:'unlock',airportId:'WUH'},NOW);c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
  const s=c.snapshot(),q=planQuote(s,s.fleet[0]!,['WUH','PVG']);s.fleet[0]!.energy.availableSeconds=q.legs[0]!.duration;await load(page,s);
  await page.getByRole('button',{name:'航线地图',exact:true}).click();
  await selectCity(page, 'WUH');
  await selectCity(page, 'PVG');
  await expect(await detailValue(page, 'plan-energy')).toContainText('只能覆盖部分航段');
  await launchRoute(page);await expect(page.getByTestId('plane-energy')).toHaveText('能量 0.00 点');
  await page.clock.fastForward((q.legs[0]!.duration+9)*1000);
  await expect(page.locator('.gate-sign')).toContainText('武汉航空港');await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.getByTestId('loaded-order')).toHaveCount(7);await expect(page.getByTestId('credits')).toHaveText(money(s.credits-q.legs[0]!.cost));
  await expect(page.getByTestId('active-plan')).toHaveCount(0);
});
for(const [label,s] of [['legacy',legacy],['ordered-route',orderedV4]] as const)test(`old v4 ${label} flight imports unchanged, without charging energy retroactively`,async({page})=>{
  await load(page,s);await expect(page.getByTestId('plane-energy')).toHaveText('能量 240.00 点');
  await openGlobal(page, '机队管理');await expect(page.getByTestId('energy-service-status')).toContainText('旧版在途航班豁免');
  await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
});
