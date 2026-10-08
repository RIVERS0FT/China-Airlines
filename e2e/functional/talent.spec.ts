import { offerCandidates, STAFFING_OFFERS } from '../../tests/helpers/talent-market.js';
import {test,expect,type Page} from '../helpers/configured-airport.js';
import {readFile} from 'node:fs/promises';
import {GameCore,type GameState} from '../helpers/configured-game.js';
import {openGlobal} from '../helpers/dispatch-helpers.js';
const NOW=Date.parse('2026-09-14T02:00:00Z');
async function prepare(page:Page,state?:GameState,pause=false){
  await page.clock.install({time:new Date(NOW)});if(pause)await page.clock.pauseAt(new Date(NOW+1000));await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const s=state??new GameCore(NOW).snapshot();if(!state){s.credits=1000000;offerCandidates(s,STAFFING_OFFERS);}await openGlobal(page,'存档设置');page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'talent.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await expect(page.locator('.settings-modal')).toContainText('存档导入成功');await page.getByRole('button',{name:'关闭存档设置'}).click();await openGlobal(page,'公司组织');
}
async function exportState(page:Page){await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();await openGlobal(page,'存档设置');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();const download=await pending;const saved=JSON.parse(await readFile((await download.path())!,'utf8')) as GameState;await page.getByRole('button',{name:'关闭存档设置'}).click();return saved;}
test('candidate choices, mentoring and employee profiles survive reload and offline use without company panels',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await prepare(page);
  await expect(page.locator('.org-detail')).toHaveCount(0);await expect(page.locator('.org-recruit')).toHaveCount(0);
  await page.getByRole('button',{name:'人才市场',exact:true}).click();const candidates=page.locator('[data-candidate-id]'),initial=await candidates.allTextContents();
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();expect(await candidates.allTextContents()).toEqual(initial);
  const chosen=page.locator('[data-talent-position="flight-specialist"] [data-candidate-id]').filter({has:page.getByRole('heading',{name:'周远',exact:true})}),chosenId=Number(await chosen.getAttribute('data-candidate-id'));await chosen.getByRole('button',{name:'招募周远 · 飞行员',exact:true}).click();await expect(page.getByLabel('周远岗位',{exact:true})).toHaveValue('AC0001');
  await expect(page.getByTestId('credits')).toHaveText('¥ 997,900');await expect(page.getByTestId('tickets-count')).toHaveCount(0);
  await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const mentorCard=page.locator('[data-talent-position="flight-manager"] [data-candidate-id]').filter({has:page.getByRole('heading',{name:'苏晴',exact:true})});
  const mentorTrait=(await mentorCard.innerText()).includes('善于带教'),trainingGold=Math.ceil(400*(100-(mentorTrait?7:2))/100)+300;
  await mentorCard.getByRole('button',{name:'招募苏晴 · 飞行部经理',exact:true}).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 995,100');await expect(page.getByTestId('tickets-count')).toHaveCount(0);
  await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();await page.getByLabel('周远直属上级',{exact:true}).selectOption('2');
  // A valid mentor makes the old training advice eligible; its removed UI must still stay absent.
  const organization=page.getByRole('region',{name:'公司组织管理',exact:true});
  await expect(organization.getByRole('button',{name:/^公司事务/})).toHaveCount(0);await expect(organization.getByRole('button',{name:'公司纪事',exact:true})).toHaveCount(0);
  await expect(organization.locator('.org-affair-dot,[aria-label="有公司事务"]')).toHaveCount(0);await expect(organization.locator('.org-person').filter({hasText:'!'})).toHaveCount(0);
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();await openGlobal(page,'任务中心');
  const tasks=page.locator('.task-center');await expect(tasks).toBeVisible();await expect(tasks.locator('.task-company-affairs,[data-affair]')).toHaveCount(0);await expect(tasks.getByText(/^公司事务/)).toHaveCount(0);await page.getByRole('button',{name:'关闭任务中心',exact:true}).click();
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();
  const detail=page.getByRole('complementary',{name:'员工详情'});await expect(page.getByLabel('周远直属上级',{exact:true})).toHaveValue('2');await expect(page.getByLabel('周远岗位',{exact:true})).toHaveValue('AC0001');await expect(detail.locator('.org-contract')).toContainText('合同剩余');
  await detail.getByRole('tab',{name:'培养',exact:true}).click();const training=detail.getByRole('button',{name:/^专业培训/});await expect(training).toHaveText(`专业培训 · ${trainingGold}金币`);await training.click();await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');
  await detail.getByRole('tab',{name:'任职',exact:true}).click();await page.getByLabel('周远直属上级',{exact:true}).selectOption('');await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');
  await page.screenshot({path:'artifacts/company-talent-employee-history.png'});
  await page.getByRole('button',{name:'人才市场',exact:true}).click();await expect(page.locator('[data-candidate-id]').first()).toBeVisible();await page.screenshot({path:'artifacts/employee-portraits-candidates.png'});
  await page.getByRole('button',{name:'机队管理',exact:true}).click();await page.getByRole('button',{name:'负责飞行员 · 周远',exact:true}).click();await expect(detail.getByRole('heading',{name:'周远',exact:true})).toBeVisible();
  const saved=await exportState(page);expect(saved.version).toBe(18);expect(saved.talent.mentoring).toHaveLength(1);expect(saved.talent.mentoring[0]).toMatchObject({employeeId:1,mentorId:2,level:1});expect(saved.talent.mentoring[0]!.at).toBeGreaterThanOrEqual(0);expect(saved.talent.mentoring[0]!.at).toBeLessThanOrEqual(saved.simTime);expect(saved.talent.candidates.some(c=>c.id===chosenId)).toBe(false);expect(saved.career.employees[0]!.managerId).toBeNull();
  expect(saved.career.employees[0]!.planeId).toBe('AC0001');expect(saved.fleet[0]!.dispatcher).toBe(true);
  expect(saved.credits).toBe(1000000-2100-2800-trainingGold);for(const employee of saved.career.employees){expect(employee.joinedAt).not.toBeNull();expect(employee.paidUntil).toBe(employee.joinedAt!+7*86400);}
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));await context.setOffline(true);await page.reload();await openGlobal(page,'公司组织');
  await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');await expect(page.locator('.toast')).toHaveCount(0);expect(errors).toEqual([]);
});
test('organization keeps a mounted map and returns without losing camera or game state',async({page})=>{
  await page.setViewportSize({width:844,height:390});await prepare(page);await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();await page.getByRole('button',{name:'地图',exact:true}).click();const canvas=page.getByTestId('map-canvas');await expect(canvas).toHaveAttribute('data-renderer','ready');
  await canvas.evaluate(el=>el.setAttribute('data-talent-camera-probe','same-mount'));const credits=await page.getByTestId('credits').innerText();await page.getByRole('button',{name:'公司组织',exact:true}).click();await expect(canvas).toBeHidden();await expect(canvas).toHaveAttribute('data-talent-camera-probe','same-mount');await expect(page.locator('.org-tree-viewport')).toBeVisible();
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'地图',exact:true}).click();await expect(canvas).toBeVisible();await expect(canvas).toHaveAttribute('data-talent-camera-probe','same-mount');await expect(page.getByTestId('credits')).toHaveText(credits);await expect(page.locator('.map-zoom-controls')).toHaveCount(0);
});

test('ground recruitment fills vacant airports, disables full assignments and persists a replacement',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await prepare(page);
  await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const managerCard=page.locator('[data-talent-position="ground-manager"] [data-candidate-id]').first();
  const managerName=(await managerCard.locator('.org-candidate-name').innerText()).trim();
  await managerCard.getByRole('button',{name:`招募${managerName} · 地勤部经理`,exact:true}).click();
  const groundCards=page.locator('[data-talent-position="ground-specialist"] [data-candidate-id]');let remaining=3;
  async function hireGround(airportId:string,city:string){
    await page.getByRole('button',{name:'人才市场',exact:true}).click();await expect(groundCards).toHaveCount(remaining);
    for(const card of await groundCards.all()){
      await expect(card.getByRole('button')).toBeEnabled();await expect(card.locator('.org-candidate-assignment')).toHaveText(`自动分配：${city}`);
    }
    const card=groundCards.first(),name=(await card.locator('.org-candidate-name').innerText()).trim();
    await card.getByRole('button',{name:`招募${name} · 地勤专员`,exact:true}).click();
    await expect(page.getByLabel(`${name}岗位`,{exact:true})).toHaveValue(airportId);
    await expect(page.getByLabel(`${name}直属上级`,{exact:true})).toHaveValue('1');
    remaining--;return name;
  }
  async function expectNoAirportVacancy(){
    await page.getByRole('button',{name:'人才市场',exact:true}).click();await expect(groundCards).toHaveCount(remaining);
    for(const card of await groundCards.all()){
      await expect(card.getByRole('button')).toBeDisabled();await expect(card.locator('.org-candidate-unavailable')).toHaveText('没有空缺地勤岗位的机场');
      await expect(card.locator('.org-candidate-assignment')).toHaveCount(0);
    }
  }
  const firstName=await hireGround('PEK','北京'),secondName=await hireGround('PVG','上海');
  await expectNoAirportVacancy();
  await expect(page.locator('[data-talent-position="ground-specialist"] > header')).toContainText('已聘 2/4');
  const full=await exportState(page);expect(full.career.employees).toHaveLength(3);
  expect(full.career.employees[1]).toMatchObject({name:firstName,airportId:'PEK',managerId:1});
  expect(full.career.employees[2]).toMatchObject({name:secondName,airportId:'PVG',managerId:1});
  await openGlobal(page,'公司组织');await page.getByRole('button',{name:`查看${firstName} · 地勤专员`,exact:true}).click();
  await page.getByLabel(`${firstName}岗位`,{exact:true}).selectOption('');
  await expect(page.getByLabel(`${firstName}岗位`,{exact:true})).toHaveValue('');
  const replacementName=await hireGround('PEK','北京');
  const replaced=await exportState(page);expect(replaced.career.employees).toHaveLength(4);
  expect(replaced.career.employees[1]!.airportId).toBeNull();
  expect(replaced.career.employees[3]).toMatchObject({name:replacementName,airportId:'PEK',managerId:1});
  expect(replaced.credits).toBe(full.credits-1400);
  await page.reload();await openGlobal(page,'公司组织');
  await page.getByRole('button',{name:`查看${replacementName} · 地勤专员`,exact:true}).click();
  await expect(page.getByLabel(`${replacementName}岗位`,{exact:true})).toHaveValue('PEK');
  await expect(page.getByLabel(`${replacementName}直属上级`,{exact:true})).toHaveValue('1');
  await expectNoAirportVacancy();
  const restored=await exportState(page);expect(restored.career.employees).toEqual(replaced.career.employees);
  expect(restored.credits).toBe(replaced.credits);
});

test('five minute market refresh replaces three candidates and pauses across offline restart',async({page,context})=>{
  const core=new GameCore(NOW);core.tick(NOW+298_000);const state=core.snapshot();
  await prepare(page,state,true);await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const market=page.getByRole('region',{name:'人才市场',exact:true}),countdown=page.getByTestId('talent-refresh-countdown');
  const candidates=market.locator('[data-candidate-id]');
  const allIds=()=>candidates.evaluateAll(nodes=>nodes.map(node=>Number(node.getAttribute('data-candidate-id'))).sort((a,b)=>a-b));
  await expect(candidates).toHaveCount(3);await expect(page.getByTestId('talent-batch-summary')).toHaveText('公司 Lv.1 · 本批剩余 3/3 名 · 下批 3 名');
  await expect(countdown).toHaveAttribute('data-next-refresh-at','300');await expect(countdown).toHaveText('00:02');
  const oldIds=await allIds();await candidates.first().getByRole('button').focus();
  await page.clock.runFor(1000);await expect(countdown).toHaveText('00:01');expect(await allIds()).toEqual(oldIds);
  await page.clock.runFor(1000);await expect(countdown).toHaveAttribute('data-next-refresh-at','600');await expect(countdown).toHaveText('05:00');
  await expect(candidates).toHaveCount(3);const refreshedIds=await allIds();expect(refreshedIds.every(id=>!oldIds.includes(id))).toBe(true);
  const refreshed=await exportState(page);await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const hiredCard=candidates.first(),hiredId=Number(await hiredCard.getAttribute('data-candidate-id'));
  const hiredName=(await hiredCard.locator('.org-candidate-name').innerText()).trim();await hiredCard.getByRole('button').click();
  await expect(page.getByRole('complementary',{name:'员工详情'}).getByRole('heading',{name:hiredName,exact:true})).toBeVisible();
  const hired=await exportState(page),hiredIds=hired.talent.candidates.map(c=>c.id).sort((a,b)=>a-b);
  expect(hiredIds).toEqual(refreshedIds.filter(id=>id!==hiredId));expect(hired.talent.nextId).toBe(refreshed.talent.nextId);expect(hired.talent.seed).toBe(refreshed.talent.seed);
  expect(hired.career.employees).toHaveLength(1);expect(hired.career.employees[0]).toMatchObject({name:hiredName,joinedAt:300,paidUntil:300+7*86400});
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();
  await expect(candidates).toHaveCount(2);expect(await allIds()).toEqual(hiredIds);await expect(countdown).toHaveText('05:00');
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await page.goto('about:blank');
  try{
    await context.setOffline(true);await page.clock.fastForward(1800_000);await page.goto('./');
    await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();
    await expect(candidates).toHaveCount(2);expect(await allIds()).toEqual(hiredIds);await expect(countdown).toHaveText('05:00');
    const restored=await exportState(page);expect(restored.simTime).toBe(hired.simTime);expect(restored.talent).toEqual(hired.talent);
    expect(restored.career.employees).toEqual(hired.career.employees);expect(restored.credits).toBe(hired.credits);
  }finally{await context.setOffline(false);}
});

for(const [width,height] of [[1440,900],[667,375]] as const)test(`finite candidate batch, department empty state and level growth at ${width}`,async({page})=>{
  await page.setViewportSize({width,height});
  const s=new GameCore(NOW).snapshot();offerCandidates(s,[['publicity','specialist'],['operations','specialist'],['engineering','specialist']]);s.career.xp=150;
  await prepare(page,s,true);await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const candidates=page.locator('[data-candidate-id]'),summary=page.getByTestId('talent-batch-summary');
  await expect(candidates).toHaveCount(3);await expect(summary).toHaveText('公司 Lv.2 · 本批剩余 3/3 名 · 下批 4 名');
  await page.screenshot({path:`artifacts/talent-batch-${width}.png`});
  const filter=page.getByLabel('招聘部门',{exact:true});await filter.selectOption('company');
  await expect(candidates).toHaveCount(0);await expect(page.getByRole('status')).toHaveText('本批暂无该部门候选人。');await filter.selectOption('all');
  for(let left=3;left>0;left--){
    await expect(candidates).toHaveCount(left);const button=candidates.first().getByRole('button');
    expect(await button.evaluate(el=>parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThanOrEqual(44);await button.click();
    await page.getByRole('button',{name:'人才市场',exact:true}).click();
    await expect(summary).toHaveText(`公司 Lv.2 · 本批剩余 ${left-1}/3 名 · 下批 4 名`);
  }
  await expect(candidates).toHaveCount(0);await expect(page.getByRole('status')).toHaveText('本批候选已全部录用，等待下一批人才。');
  const empty=await exportState(page);expect(empty.talent.candidates).toEqual([]);expect(empty.talent.nextId).toBe(s.talent.nextId);
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();await expect(candidates).toHaveCount(0);
  await page.clock.fastForward(300_000);await expect(candidates).toHaveCount(4);await expect(summary).toHaveText('公司 Lv.2 · 本批剩余 4/4 名 · 下批 4 名');
  await expect(page.getByTestId('talent-refresh-countdown')).toHaveText('05:00');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
