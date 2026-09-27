import {test,expect,type Page} from '../helpers/configured-airport.js';
import {readFile} from 'node:fs/promises';
import {GameCore,type GameState} from '../helpers/configured-game.js';
import {openGlobal} from '../helpers/dispatch-helpers.js';
const NOW=Date.parse('2026-09-14T02:00:00Z');
async function prepare(page:Page,state?:GameState,pause=false){
  await page.clock.install({time:new Date(NOW)});if(pause)await page.clock.pauseAt(new Date(NOW+1000));await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const s=state??new GameCore(NOW).snapshot();if(!state){s.credits=1000000;s.career.tickets=10000;}await openGlobal(page,'存档设置');page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'talent.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await expect(page.locator('.settings-modal')).toContainText('存档导入成功');await page.getByRole('button',{name:'关闭存档设置'}).click();await openGlobal(page,'公司组织');
}
async function exportState(page:Page){await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();await openGlobal(page,'存档设置');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();const download=await pending;const saved=JSON.parse(await readFile((await download.path())!,'utf8')) as GameState;await page.getByRole('button',{name:'关闭存档设置'}).click();return saved;}
test('candidate choices, mentoring and employee profiles survive reload and offline use without company panels',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await prepare(page);
  await expect(page.locator('.org-detail')).toHaveCount(0);await expect(page.locator('.org-recruit')).toHaveCount(0);
  await page.getByRole('button',{name:'人才市场',exact:true}).click();const candidates=page.locator('[data-candidate-id]'),initial=await candidates.allTextContents();
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();expect(await candidates.allTextContents()).toEqual(initial);
  await page.locator('[data-talent-position="flight-specialist"] [data-candidate-id]').filter({has:page.getByRole('heading',{name:'周远',exact:true})}).getByRole('button',{name:'招募周远 · 飞行员',exact:true}).click();await expect(page.getByLabel('周远岗位',{exact:true})).toHaveValue('AC0001');
  await expect(page.getByTestId('credits')).toHaveText('¥ 998,200');await expect(page.getByTestId('tickets-count')).toHaveText('9997 券');
  await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const mentorCard=page.locator('[data-talent-position="flight-manager"] [data-candidate-id]').filter({has:page.getByRole('heading',{name:'苏晴',exact:true})});
  const mentorTrait=(await mentorCard.innerText()).includes('善于带教'),trainingGold=Math.ceil(400*(100-(mentorTrait?7:2))/100);
  await mentorCard.getByRole('button',{name:'招募苏晴 · 飞行部经理',exact:true}).click();
  await expect(page.getByTestId('credits')).toHaveText('¥ 995,800');await expect(page.getByTestId('tickets-count')).toHaveText('9993 券');
  await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();await page.getByLabel('周远直属上级',{exact:true}).selectOption('2');
  // A valid mentor makes the old training advice eligible; its removed UI must still stay absent.
  const organization=page.getByRole('region',{name:'公司组织管理',exact:true});
  await expect(organization.getByRole('button',{name:/^公司事务/})).toHaveCount(0);await expect(organization.getByRole('button',{name:'公司纪事',exact:true})).toHaveCount(0);
  await expect(organization.locator('.org-affair-dot,[aria-label="有公司事务"]')).toHaveCount(0);await expect(organization.locator('.org-person').filter({hasText:'!'})).toHaveCount(0);
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click();await openGlobal(page,'任务中心');
  const tasks=page.locator('.task-center');await expect(tasks).toBeVisible();await expect(tasks.locator('.task-company-affairs,[data-affair]')).toHaveCount(0);await expect(tasks.getByText(/^公司事务/)).toHaveCount(0);await page.getByRole('button',{name:'关闭任务中心',exact:true}).click();
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();
  const detail=page.getByRole('complementary',{name:'员工详情'});await expect(page.getByLabel('周远直属上级',{exact:true})).toHaveValue('2');await expect(page.getByLabel('周远岗位',{exact:true})).toHaveValue('AC0001');await expect(detail.locator('.org-contract')).toContainText('合同剩余');
  await detail.getByRole('tab',{name:'培养',exact:true}).click();const training=detail.getByRole('button',{name:/^专业培训/});await expect(training).toHaveText(`专业培训 · ${trainingGold}金币＋3券`);await training.click();await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');
  await detail.getByRole('tab',{name:'任职',exact:true}).click();await page.getByLabel('周远直属上级',{exact:true}).selectOption('');await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');
  await page.screenshot({path:'artifacts/company-talent-employee-history.png'});
  await page.getByRole('button',{name:'人才市场',exact:true}).click();await expect(page.locator('[data-candidate-id]').first()).toBeVisible();await page.screenshot({path:'artifacts/employee-portraits-candidates.png'});
  await page.getByRole('button',{name:'机队管理',exact:true}).click();await page.getByRole('button',{name:'负责飞行员 · 周远',exact:true}).click();await expect(detail.getByRole('heading',{name:'周远',exact:true})).toBeVisible();
  const saved=await exportState(page);expect(saved.version).toBe(14);expect(saved.talent.mentoring).toHaveLength(1);expect(saved.talent.mentoring[0]).toMatchObject({employeeId:1,mentorId:2,level:1});expect(saved.talent.mentoring[0]!.at).toBeGreaterThanOrEqual(0);expect(saved.talent.mentoring[0]!.at).toBeLessThanOrEqual(saved.simTime);expect(saved.talent.candidates.some(c=>c.id===3)).toBe(false);expect(saved.career.employees[0]!.managerId).toBeNull();
  expect(saved.career.employees[0]!.planeId).toBe('AC0001');expect(saved.fleet[0]!.dispatcher).toBe(true);
  expect(saved.credits).toBe(1000000-1800-2400-trainingGold);expect(saved.career.tickets).toBe(10000-3-4-3);for(const employee of saved.career.employees){expect(employee.joinedAt).not.toBeNull();expect(employee.paidUntil).toBe(employee.joinedAt!+7*86400);}
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
  const managerCard=page.locator('[data-talent-position="ground-manager"] [data-candidate-id]').nth(2);
  const managerName=(await managerCard.locator('.org-candidate-name').innerText()).trim();
  await managerCard.getByRole('button',{name:`招募${managerName} · 地勤部经理`,exact:true}).click();
  const groundCards=page.locator('[data-talent-position="ground-specialist"] [data-candidate-id]');
  async function hireGround(airportId:string,city:string){
    await page.getByRole('button',{name:'人才市场',exact:true}).click();await expect(groundCards).toHaveCount(3);
    for(const card of await groundCards.all()){
      await expect(card.getByRole('button')).toBeEnabled();await expect(card.locator('.org-candidate-assignment')).toHaveText(`自动分配：${city}`);
    }
    const card=groundCards.first(),name=(await card.locator('.org-candidate-name').innerText()).trim();
    await card.getByRole('button',{name:`招募${name} · 地勤专员`,exact:true}).click();
    await expect(page.getByLabel(`${name}岗位`,{exact:true})).toHaveValue(airportId);
    await expect(page.getByLabel(`${name}直属上级`,{exact:true})).toHaveValue('1');
    return name;
  }
  async function expectNoAirportVacancy(){
    await page.getByRole('button',{name:'人才市场',exact:true}).click();await expect(groundCards).toHaveCount(3);
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
  expect(replaced.credits).toBe(full.credits-1200);expect(replaced.career.tickets).toBe(full.career.tickets-2);
  await page.reload();await openGlobal(page,'公司组织');
  await page.getByRole('button',{name:`查看${replacementName} · 地勤专员`,exact:true}).click();
  await expect(page.getByLabel(`${replacementName}岗位`,{exact:true})).toHaveValue('PEK');
  await expect(page.getByLabel(`${replacementName}直属上级`,{exact:true})).toHaveValue('1');
  await expectNoAirportVacancy();
  const restored=await exportState(page);expect(restored.career.employees).toEqual(replaced.career.employees);
  expect(restored.credits).toBe(replaced.credits);expect(restored.career.tickets).toBe(replaced.career.tickets);
});

test('talent market refreshes a full batch on schedule and across offline restart without charging twice',async({page,context})=>{
  const core=new GameCore(NOW);core.tick(NOW+1798_000);const state=core.snapshot();
  await prepare(page,state,true);await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const market=page.getByRole('region',{name:'人才市场',exact:true}),countdown=page.getByTestId('talent-refresh-countdown');
  const candidates=market.locator('[data-candidate-id]'),pilots=market.locator('[data-talent-position="flight-specialist"] [data-candidate-id]');
  const allIds=async()=>{
    await expect(candidates).toHaveCount(15);
    for(const position of ['flight-specialist','ground-specialist','flight-manager','ground-manager','company-manager']){
      await expect(market.locator(`[data-talent-position="${position}"] [data-candidate-id]`)).toHaveCount(3);
    }
    return candidates.evaluateAll(nodes=>nodes.map(node=>Number(node.getAttribute('data-candidate-id'))).sort((a,b)=>a-b));
  };
  await expect(page.getByRole('heading',{name:'人才市场',exact:true})).toBeVisible();
  await expect(countdown).toHaveAttribute('data-next-refresh-at','1800');await expect(countdown).toHaveText('00:02');
  const oldIds=await allIds();expect(oldIds).toHaveLength(15);expect(new Set(oldIds).size).toBe(15);
  const oldCandidate=await pilots.nth(2).getAttribute('data-candidate-id');await pilots.nth(2).getByRole('button').focus();
  await page.clock.runFor(1000);await expect(countdown).toHaveText('00:01');
  await expect(market.locator(`[data-candidate-id="${oldCandidate}"]`).getByRole('button')).toBeEnabled();
  await page.clock.runFor(1000);await expect(countdown).toHaveAttribute('data-next-refresh-at','3600');await expect(countdown).toHaveText('30:00');
  await expect(market.locator(`[data-candidate-id="${oldCandidate}"]`)).toHaveCount(0);
  const refreshedIds=await allIds();expect(refreshedIds).toHaveLength(15);expect(refreshedIds.every(id=>!oldIds.includes(id))).toBe(true);
  expect(new Set(refreshedIds).size).toBe(15);
  const hiredCard=pilots.nth(1),hiredId=Number(await hiredCard.getAttribute('data-candidate-id'));
  const hiredName=(await hiredCard.locator('.org-candidate-name').innerText()).trim();
  await hiredCard.getByRole('button',{name:`招募${hiredName} · 飞行员`,exact:true}).click();
  await expect(page.getByRole('complementary',{name:'员工详情'}).getByRole('heading',{name:hiredName,exact:true})).toBeVisible();
  await expect(page.getByLabel(`${hiredName}岗位`,{exact:true})).toHaveValue('AC0001');
  const hired=await exportState(page);
  expect(hired.version).toBe(14);expect(hired.credits).toBe(state.credits-1800);expect(hired.career.tickets).toBe(state.career.tickets-3);
  expect(hired.career.employees).toHaveLength(1);expect(hired.career.employees[0]).toMatchObject({name:hiredName,department:'flight',role:'specialist',planeId:'AC0001',joinedAt:1800,paidUntil:1800+7*86400});expect(hired.fleet[0]!.dispatcher).toBe(true);
  const hiredIds=hired.talent.candidates.map(candidate=>candidate.id).sort((a,b)=>a-b);
  expect(hiredIds).toHaveLength(15);expect(hiredIds).not.toContain(hiredId);
  expect(hiredIds.filter(id=>refreshedIds.includes(id))).toEqual(refreshedIds.filter(id=>id!==hiredId));

  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();
  expect(await allIds()).toEqual(hiredIds);await expect(countdown).toHaveAttribute('data-next-refresh-at','3600');await expect(countdown).toHaveText('30:00');
  for(const card of await pilots.all())await expect(card.getByRole('button')).toBeDisabled();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  // Close the running game before advancing the clock, so the next batch is produced by offline startup.
  await page.goto('about:blank');
  try{
    await context.setOffline(true);await page.clock.fastForward(1800_000);await page.goto('./');
    const resume=page.getByRole('button',{name:'继续经营',exact:true});if(await resume.isVisible())await resume.click();
    await openGlobal(page,'公司组织');await page.getByRole('button',{name:'人才市场',exact:true}).click();
    await expect(countdown).toHaveAttribute('data-next-refresh-at','5400');await expect(countdown).toHaveText('30:00');
    const offlineIds=await allIds();expect(offlineIds).toHaveLength(15);expect(new Set(offlineIds).size).toBe(15);expect(offlineIds.every(id=>!hiredIds.includes(id))).toBe(true);
    for(const card of await pilots.all())await expect(card.getByRole('button')).toBeDisabled();
    const restored=await exportState(page);expect(restored.simTime).toBe(3600);
    expect(restored.career.employees).toEqual(hired.career.employees);expect(restored.credits).toBe(hired.credits);expect(restored.career.tickets).toBe(hired.career.tickets);
    expect(restored.fleet[0]!.dispatcher).toBe(true);
  }finally{await context.setOffline(false);}
});
