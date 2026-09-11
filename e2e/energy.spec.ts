import { test, expect, type Page } from '@playwright/test';
import { GameCore, quote, planQuote, type GameState } from '../src/core/game.js';
import { ENERGY_CAPACITY_SECONDS as CAP } from '../src/core/energy.js';
import legacy from '../tests/fixtures/v4-energy-migration.json' with { type: 'json' };
const NOW = Date.parse('2026-09-12T00:00:00Z'), ID = 'AC0001';
const money=(n:number)=>`¥ ${Math.round(n).toLocaleString('zh-CN')}`;
let errors: string[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));
function readyState(seconds=13) {
  const c=new GameCore(NOW);c.execute({type:'route',from:'PEK',to:'PVG'},NOW);c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
  const s=c.snapshot();s.fleet[0]!.energy.availableSeconds=seconds;return s;
}
async function load(page:Page,state:GameState|typeof legacy){
  await page.clock.install({time:new Date(NOW)});await page.clock.pauseAt(new Date(NOW+1000));
  await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button',{name:'存档设置',exact:true}).click();page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'energy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});
  await expect(page.getByTestId('credits')).toHaveText(money(state.credits));
  await expect(page.getByText('存档导入成功，旧进度已保留为备份。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭存档设置',exact:true}).click();
  await page.getByRole('button',{name:'关闭提示',exact:true}).click();
}
for(const [width,height] of [[1440,900],[844,390],[667,375]] as const){
  test(`energy shortage, service cancellation and exact completion persist at ${width}`,async({page})=>{
    await page.setViewportSize({width,height});const s=readyState();await load(page,s);
    await expect(page.getByTestId('plane-energy')).toBeInViewport();
    await page.getByRole('button',{name:'航线地图',exact:true}).click();
    await expect(page.getByTestId('network-energy')).toContainText('本段需');await expect(page.getByTestId('dispatch')).toBeDisabled();
    await expect(page.locator('.destination-detail')).toContainText('能量不足');
    await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
    await page.getByRole('button',{name:'机队管理',exact:true}).click();
    const service=page.getByRole('region',{name:'飞机能量管理'}); // section has an accessible name.
    await page.getByRole('button',{name:'开始地勤补能',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button',{name:'开始地勤补能',exact:true})).toBeInViewport();
    await expect(service).toContainText('暂定规则');
    await page.screenshot({path:`artifacts/energy-service-${width}.png`});
    await page.getByRole('button',{name:'开始地勤补能',exact:true}).click();await expect(page.getByTestId('energy-service-status')).toContainText('地勤补能中');
    await page.clock.fastForward(60000);await expect(page.getByTestId('hangar-energy')).toHaveText('0.22 / 240 点');
    await page.getByRole('button',{name:'取消地勤补能',exact:true}).click();await expect(page.getByTestId('hangar-energy')).toHaveText('0.22 / 240 点');
    await page.getByRole('button',{name:'开始地勤补能',exact:true}).click();await expect(page.getByTestId('energy-service-status')).toContainText('地勤补能中');
    await page.reload();await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await expect(page.locator('.plane-status')).toContainText('地勤补能');
    await expect(page.getByTestId('loaded-order').first()).toHaveCount(0);
    await page.getByRole('button',{name:'航班运行表',exact:true}).click();await page.getByRole('button',{name:/^待命飞机/}).click();
    await expect(page.getByTestId('flight-row')).toHaveCount(0);await page.getByRole('button',{name:'关闭航班运行表',exact:true}).click();
    await page.getByRole('button',{name:'机队管理',exact:true}).click();
    await page.clock.fastForward(119000);await expect(page.getByTestId('hangar-energy')).toHaveText('0.22 / 240 点');
    await page.clock.fastForward(1000);await expect(page.getByTestId('hangar-energy')).toHaveText('240.00 / 240 点');
    await expect(page.getByRole('button',{name:'开始地勤补能',exact:true})).toBeDisabled();
    await expect(page.getByTestId('credits')).toHaveText(money(s.credits));
    await expect(page.getByTestId('flights-count')).toHaveText('0 班');
    await page.reload();await expect(page.getByTestId('plane-energy')).toHaveText('能量 240.00 点');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test('the exact flight budget is reserved once and survives reload plus stop',async({page})=>{
  const s=readyState(CAP),q=quote(s,s.fleet[0]!,'PVG');await load(page,s);
  await page.getByRole('button',{name:'航线地图',exact:true}).click();await page.getByTestId('dispatch').click();
  const energy=`能量 ${((CAP-q.duration)/60).toFixed(2)} 点`;
  await expect(page.getByTestId('plane-energy')).toHaveText(energy);
  await expect(page.getByTestId('flight-cost')).toHaveText(money(q.cost));
  await page.reload();await expect(page.getByTestId('plane-energy')).toHaveText(energy);
  await page.getByRole('button',{name:'机队管理',exact:true}).click();
  await expect(page.getByRole('button',{name:'开始地勤补能',exact:true})).toBeDisabled();
  await page.clock.fastForward((q.duration+8)*1000);await expect(page.getByTestId('hangar-energy')).toHaveText(`${((CAP-q.duration)/60).toFixed(2)} / 240 点`);
});
test('multi-leg energy shortage stops at the hub without erasing transfer cargo',async({page})=>{
  const c=new GameCore(NOW);c.execute({type:'unlock',airportId:'WUH'},NOW);c.execute({type:'load-destination',planeId:ID,to:'PVG'},NOW);
  c.execute({type:'open-plan-routes',planeId:ID,stops:['WUH','PVG']},NOW);
  const s=c.snapshot(),q=planQuote(s,s.fleet[0]!,['WUH','PVG']);s.fleet[0]!.energy.availableSeconds=q.legs[0]!.duration;await load(page,s);
  await page.getByRole('button',{name:'航线地图',exact:true}).click();await page.getByRole('button',{name:'多段计划',exact:true}).click();
  await page.getByLabel('选择机场',{exact:true}).selectOption('WUH');await page.getByRole('button',{name:'添加武汉航段',exact:true}).click();
  await page.getByLabel('选择机场',{exact:true}).selectOption('PVG');await page.getByRole('button',{name:'添加上海航段',exact:true}).click();
  await expect(page.getByTestId('plan-energy')).toContainText('只能覆盖部分航段');
  await page.getByRole('button',{name:'执行运输计划',exact:true}).click();await expect(page.getByTestId('plane-energy')).toHaveText('能量 0.00 点');
  await page.clock.fastForward((q.legs[0]!.duration+9)*1000);
  await expect(page.locator('.gate-sign')).toContainText('武汉航空港');await expect(page.getByTestId('flights-count')).toHaveText('1 班');
  await expect(page.getByTestId('loaded-order')).toHaveCount(6);await expect(page.getByTestId('credits')).toHaveText(money(s.credits-q.legs[0]!.cost));
  await expect(page.getByTestId('active-plan')).toHaveCount(0);
});
test('old v4 flight imports unchanged, without charging energy retroactively',async({page})=>{
  await load(page,legacy);await expect(page.getByTestId('plane-energy')).toHaveText('能量 240.00 点');
  await page.getByRole('button',{name:'机队管理',exact:true}).click();await expect(page.getByTestId('energy-service-status')).toContainText('旧版在途航班豁免');
  await expect(page.getByTestId('credits')).toHaveText(money(legacy.credits));
});
