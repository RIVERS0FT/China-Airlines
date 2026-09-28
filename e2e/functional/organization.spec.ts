import { test, expect, type Page } from '../helpers/configured-airport.js';
import { readFile } from 'node:fs/promises';
import { GameCore, type GameState } from '../helpers/configured-game.js';
import { openGlobal } from '../helpers/dispatch-helpers.js';
import { UI_SCALE_KEY } from '../../src/ui/viewport.js';
const NOW = Date.parse('2026-09-14T02:00:00Z');
// Fractional viewport transforms can report 0.9999989 for a fully contained node.
// This subpixel tolerance excludes visible clipping without demanding float32 exactness.
const FULL_VISIBILITY = 1 - 1e-5;
async function start(page: Page, saved?: unknown) {
  await page.clock.install({ time: new Date(NOW) }); await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const rich = new GameCore(NOW).snapshot(); rich.credits = 1000000; rich.career.tickets = 10000;
  await openGlobal(page, '存档设置'); page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name:'organization.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(saved ?? rich)) });
  await expect(page.locator('.settings-modal')).toContainText('存档导入成功');
  await page.getByRole('button',{name:'关闭存档设置'}).click(); await openOrganization(page);
}
async function openOrganization(page:Page) { await openGlobal(page,'公司组织'); await expect(page.locator('.organization-workspace')).toBeVisible(); await expect(page.getByRole('region',{name:'公司组织架构树',exact:true})).toBeVisible(); }
async function recruit(page:Page,job:string,name:string) { await page.getByRole('button',{name:'人才市场',exact:true}).click(); const card=page.locator(`[data-talent-position="${job}"] [data-candidate-id]`).first(),candidateName=(await card.locator('.org-candidate-name').innerText()).trim(); const target=card.getByRole('button',{name:`招募${candidateName} · ${name}`,exact:true}); expect(await target.evaluate(el=>parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThanOrEqual(44); await target.click(); }
async function exportState(page:Page) {
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'机场装载',exact:true}).click(); await openGlobal(page,'存档设置'); const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出存档',exact:true}).click(); const download=await pending;
  const saved=JSON.parse(await readFile((await download.path())!,'utf8')) as GameState;
  await page.getByRole('button',{name:'关闭存档设置'}).click(); return saved;
}
for (const [width,height] of [[1440,900],[844,390],[667,375]] as const) test(`company reporting, staffing and training persist at ${width}`,async({page})=>{
  const errors:string[]=[]; page.on('pageerror', e=>errors.push(e.message)); await page.setViewportSize({width,height}); await start(page);
  await expect(page.getByRole('region',{name:'公司组织架构树',exact:true})).not.toContainText('可由玩家直接管理');
  await recruit(page,'flight-specialist','飞行员'); await expect(page.getByLabel('林航岗位')).toHaveValue('AC0001');
  await recruit(page,'ground-specialist','地勤专员'); await expect(page.getByLabel('顾川岗位')).toHaveValue('PEK');
  await recruit(page,'flight-manager','飞行部经理');
  await page.getByRole('button',{name:'查看林航 · 飞行员',exact:true}).click(); await page.getByLabel('林航直属上级').selectOption('3');
  const detail=page.getByRole('complementary',{name:'员工详情'}); await expect(detail).toContainText('苏晴的管理效果生效');
  await detail.getByRole('tab',{name:'培养',exact:true}).click(); await detail.getByRole('button',{name:/^专业培训/}).click(); await expect(detail.locator('.org-attributes').getByText('1',{exact:true})).toBeVisible();
  const tree=page.getByRole('region',{name:'公司组织架构树',exact:true});
  await expect(page.locator('.company-organization').getByText('视图',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('组织树显示控制')).toHaveCount(0);
  await expect(page.locator('.company-organization')).not.toContainText('实线：经理直属');
  await expect(page.locator('.company-organization')).not.toContainText('组建第一支团队');
  await expect(page.locator('.org-pending')).toHaveCount(0);
  await expect(tree.locator('[data-employee-id="1"]')).toBeInViewport({ratio:FULL_VISIBILITY});
  await expect(tree.locator('[data-employee-id="2"]')).toBeInViewport({ratio:FULL_VISIBILITY});
  const generalSlot=page.getByTestId('general-manager-slot');await expect(generalSlot).toContainText('待任命');
  await generalSlot.click();const market=page.getByRole('region',{name:'人才市场',exact:true});
  await expect(market.getByRole('combobox')).toHaveCount(0);await expect(page.getByLabel('招募岗位',{exact:true})).toHaveCount(0);
  await expect(market.locator('article[data-candidate-id]')).toHaveCount(15);await expect(market.locator('[data-candidate-id][aria-pressed]')).toHaveCount(0);
  for(const [position,hireGold,hireTickets,renewGold,renewTickets] of [['flight-specialist',1800,3,600,2],['ground-specialist',1200,2,400,1],['flight-manager',2400,4,800,2],['ground-manager',2400,4,800,2],['company-manager',2400,4,800,2]] as const){
    const group=market.locator(`[data-talent-position="${position}"]`),cards=group.locator('[data-candidate-id]');await expect(cards).toHaveCount(3);
    for(const card of await cards.all()){
      const price=card.locator('.org-candidate-price');await expect(price.locator('dt')).toHaveText(['招募费用','续约薪资 / 7天']);
      await expect(price.locator('dd')).toHaveText([`${hireGold} 金币 + ${hireTickets} 券`,`${renewGold} 金币 + ${renewTickets} 券`]);await expect(card).toContainText('招募含7天合同');
      await expect(card.getByRole('button')).toHaveText('招募');
      if(position==='flight-manager'||position==='flight-specialist'){
        await expect(card.getByRole('button')).toBeDisabled();
        await expect(card.locator('.org-candidate-unavailable')).toHaveText(position==='flight-manager'?'岗位已满':'没有可分配的空闲飞机');
      }
      if(position==='ground-specialist')await expect(card.locator('.org-candidate-assignment')).toHaveText('自动分配：上海');
      if(position==='company-manager')await expect(card.locator('.org-candidate-assignment')).toHaveText('自动分配：总经理');
    }
  }
  const generalGroup=market.locator('[data-talent-position="company-manager"]');await expect(generalGroup).toBeInViewport();
  const generalCard=generalGroup.locator('[data-candidate-id]').nth(1),generalName=(await generalCard.locator('.org-candidate-name').innerText()).trim();
  await expect(page.getByRole('heading',{name:'人才市场',exact:true})).toBeVisible();
  await expect(page.getByTestId('talent-refresh-countdown')).toHaveText(/^\d{2}:\d{2}$/);
  await page.screenshot({path:`artifacts/talent-market-${width}.png`});
  await generalCard.getByRole('button',{name:`招募${generalName} · 总经理`,exact:true}).click();
  await expect(generalSlot).toHaveCount(0);await expect(detail.getByRole('heading',{name:generalName,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const fullGeneralButtons=page.locator('[data-talent-position="company-manager"] [data-candidate-id]').getByRole('button');await expect(fullGeneralButtons).toHaveCount(3);
  for(const button of await fullGeneralButtons.all())await expect(button).toBeDisabled();
  await page.getByRole('button',{name:'返回组织树',exact:true}).click();
  await expect(detail).toContainText('总经理');await expect(detail.getByRole('combobox')).toHaveCount(0);
  await detail.getByRole('tab',{name:'培养',exact:true}).click();
  await expect(detail.getByRole('button',{name:'转任专业岗位',exact:true})).toHaveCount(0);
  await expect(detail.getByRole('button',{name:/^专业培训/})).toBeVisible();
  await page.getByRole('button',{name:'查看苏晴 · 飞行部经理',exact:true}).click();
  await expect(page.getByLabel('苏晴直属上级')).toHaveValue('4');
  await page.getByLabel('苏晴直属上级').selectOption('');await expect(page.getByLabel('苏晴直属上级')).toHaveValue('');
  await page.getByLabel('苏晴直属上级').selectOption('4');
  await page.getByRole('button',{name:'收起人员档案',exact:true}).click();
  await expect(page.getByRole('button',{name:`查看${generalName} · 总经理`,exact:true})).toBeInViewport({ratio:FULL_VISIBILITY});
  const portraits=await tree.locator('.employee-portrait').evaluateAll(elements=>elements.map(element=>{
    const view=(element as SVGSVGElement).viewBox.baseVal, image=element.querySelector('image')!.getBBox();
    return image.x<=view.x && image.y<=view.y && image.x+image.width>=view.x+view.width && image.y+image.height>=view.y+view.height;
  }));
  expect(portraits).toHaveLength(4);expect(portraits.every(Boolean)).toBe(true);
  await page.screenshot({path:`artifacts/company-organization-${width}.png`});
  const state=await exportState(page); expect(state.version).toBe(15); expect(state.career.employees).toHaveLength(4); expect(Object.keys(state.career)).not.toContain('pilots');
  expect(state.career.employees[0]).toMatchObject({name:'林航',planeId:'AC0001',managerId:3,skill:1}); expect(state.career.employees[1]!.airportId).toBe('PEK');
  expect(state.fleet[0]!.dispatcher).toBe(true);
  expect(state.career.employees[2]!.managerId).toBe(4);expect(state.career.employees[3]).toMatchObject({name:generalName,department:'company',role:'manager',managerId:null,planeId:null,airportId:null,skill:2,management:1});
  await page.reload(); await openOrganization(page); await page.getByRole('button',{name:'查看林航 · 飞行员',exact:true}).click();
  await expect(page.getByLabel('林航直属上级')).toHaveValue('3'); await expect(page.getByLabel('林航岗位')).toHaveValue('AC0001');
  await page.getByRole('button',{name:'查看顾川 · 地勤专员',exact:true}).click();await expect(page.getByLabel('顾川岗位')).toHaveValue('PEK');
  await page.getByRole('button',{name:'查看苏晴 · 飞行部经理',exact:true}).click();await expect(page.getByLabel('苏晴直属上级')).toHaveValue('4');
  await page.getByRole('button',{name:`查看${generalName} · 总经理`,exact:true}).click();await expect(detail.getByRole('heading',{name:generalName,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); expect(errors).toEqual([]);
});
test('promotion frees an aircraft for automatic recruitment at 150 percent UI scale',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.addInitScript(key=>localStorage.setItem(key,'150'),UI_SCALE_KEY);await start(page);
  await recruit(page,'flight-specialist','飞行员');await expect(page.getByLabel('林航岗位')).toHaveValue('AC0001');
  await page.getByRole('button',{name:'人才市场',exact:true}).click();
  const pilots=page.locator('[data-talent-position="flight-specialist"] [data-candidate-id]');await expect(pilots).toHaveCount(3);
  for(const card of await pilots.all()){
    await expect(card.getByRole('button')).toBeDisabled();await expect(card.locator('.org-candidate-unavailable')).toHaveText('没有可分配的空闲飞机');
  }
  await page.getByRole('button',{name:'返回组织树',exact:true}).click();
  const detail=page.getByRole('complementary',{name:'员工详情'});
  await detail.getByRole('tab',{name:'培养',exact:true}).click();
  for(let i=0;i<2;i++)await detail.getByRole('button',{name:/^专业培训/}).click();await detail.getByRole('button',{name:/^管理培训/}).click();
  page.once('dialog',d=>void d.accept());await detail.getByRole('button',{name:'晋升部门经理',exact:true}).click();await expect(detail).toContainText('飞行部经理');
  await expect(page.getByRole('button',{name:'查看林航 · 飞行部经理',exact:true})).toBeInViewport({ratio:FULL_VISIBILITY});
  await page.screenshot({path:'artifacts/company-organization-844-scale150.png'});
  const s=await exportState(page);expect(s.fleet[0]!.dispatcher).toBe(false);expect(s.career.employees[0]!.role).toBe('manager');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.rotate-screen')).toBeVisible();await page.setViewportSize({width:844,height:390});await expect(page.locator('.rotate-screen')).toBeHidden();
  await openOrganization(page);await expect(page.getByRole('button',{name:'查看林航 · 飞行部经理',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'人才市场',exact:true}).click();
  for(const card of await pilots.all()){
    await expect(card.getByRole('button')).toBeEnabled();await expect(card.locator('.org-candidate-assignment')).toHaveText('自动分配：AC0001');
  }
  const replacement=pilots.first(),replacementName=(await replacement.locator('.org-candidate-name').innerText()).trim();
  await replacement.getByRole('button',{name:`招募${replacementName} · 飞行员`,exact:true}).click();
  await expect(page.getByLabel(`${replacementName}岗位`,{exact:true})).toHaveValue('AC0001');
  await expect(page.getByLabel(`${replacementName}直属上级`,{exact:true})).toHaveValue('1');
  const staffed=await exportState(page);expect(staffed.fleet[0]!.dispatcher).toBe(true);
  expect(staffed.career.employees).toHaveLength(2);expect(staffed.career.employees[1]).toMatchObject({name:replacementName,planeId:'AC0001',managerId:1});
  expect(staffed.credits).toBe(s.credits-1800);expect(staffed.career.tickets).toBe(s.career.tickets-3);
  await page.reload();await openOrganization(page);await page.getByRole('button',{name:`查看${replacementName} · 飞行员`,exact:true}).click();
  await expect(page.getByLabel(`${replacementName}岗位`,{exact:true})).toHaveValue('AC0001');await expect(page.getByLabel(`${replacementName}直属上级`,{exact:true})).toHaveValue('1');
  await page.getByRole('button',{name:'人才市场',exact:true}).click();
  for(const card of await pilots.all())await expect(card.getByRole('button')).toBeDisabled();
});
for(const viewport of [{width:1280,height:720,zoom:100},{width:667,height:375,zoom:100},{width:844,height:390,zoom:150}])test(`organization canvas fits all staff and supports pan and zoom at ${viewport.width}/${viewport.zoom}`,async({page})=>{
  const c=new GameCore(NOW),s=c.snapshot();s.credits=1000000;s.career.tickets=10000;s.hangarSlots=8;const full=new GameCore(NOW,s);
  for(let i=1;i<8;i++)full.execute({type:'buy',modelId:'diamond-da40',airportId:'PEK',passengers:1,cargo:0},NOW);
  for(const airportId of ['CAN','WUH'])full.execute({type:'unlock',airportId},NOW);
  for(const department of ['company','flight','ground'] as const)full.execute({type:'recruit-employee',department,role:'manager'},NOW);
  for(let i=0;i<8;i++)full.execute({type:'recruit-pilot'},NOW);
  for(let i=0;i<4;i++)full.execute({type:'recruit-employee',department:'ground',role:'specialist'},NOW);
  // An existing unassigned employee remains reachable directly in the tree.
  full.execute({type:'assign-pilot',pilotId:4,planeId:null},NOW);full.execute({type:'report-to',employeeId:4,managerId:null},NOW);
  await page.setViewportSize(viewport);await page.addInitScript(({key,zoom})=>localStorage.setItem(key,String(zoom)),{key:UI_SCALE_KEY,zoom:viewport.zoom});await start(page,full.snapshot());
  const tree=page.getByRole('region',{name:'公司组织架构树',exact:true});
  const camera=async()=>JSON.parse((await tree.getAttribute('data-camera'))!) as {x:number;y:number;zoom:number};
  const allVisible=async()=>{await expect(tree.locator('.org-person')).toHaveCount(15);for(const node of await tree.locator('.org-person,.org-vacancy').all())await expect(node).toBeInViewport({ratio:FULL_VISIBILITY});};
  await expect(tree).toHaveAttribute('data-camera-ready','true');await expect(tree).toHaveCSS('overflow','clip');await allVisible();
  await expect(page.locator('.org-pending')).toHaveCount(0);await expect(page.getByText('待分配人员',{exact:true})).toHaveCount(0);
  await expect(tree.locator('[data-employee-id="4"]')).toHaveAttribute('data-state','waiting');
  const baseline=await camera(),box=(await tree.boundingBox())!,anchor={x:box.x+box.width*.55,y:box.y+box.height*.4};
  await page.mouse.move(anchor.x,anchor.y);await page.mouse.wheel(0,-180);
  await expect.poll(async()=>(await camera()).zoom).toBeGreaterThan(baseline.zoom);
  const zoomed=await camera();await page.clock.runFor(1000);expect(await camera()).toEqual(zoomed);
  await tree.getByRole('button',{name:'聚焦全部',exact:true}).click();await expect.poll(camera).toEqual(baseline);await allVisible();
  await tree.getByRole('button',{name:'放大组织树',exact:true}).click();expect((await camera()).zoom).toBeGreaterThan(baseline.zoom);
  await tree.getByRole('button',{name:'缩小组织树',exact:true}).click();expect((await camera()).zoom).toBeCloseTo(baseline.zoom);
  await tree.focus();await page.keyboard.press('ArrowDown');expect((await camera()).y).toBeCloseTo(baseline.y-60);
  const beforeDrag=await camera();await page.mouse.move(box.x+12,box.y+12);await page.mouse.down();await page.mouse.move(box.x+72,box.y+42,{steps:8});await page.mouse.up();
  expect((await camera()).x).toBeGreaterThan(beforeDrag.x+30);
  await tree.focus();await page.keyboard.press('Home');await expect.poll(camera).toEqual(baseline);
  await page.keyboard.press('+');expect((await camera()).zoom).toBeGreaterThan(baseline.zoom);await page.keyboard.press('Home');
  // Real touch input exercises the same logical camera under 100% and 150% game scale.
  const touch=await page.context().newCDPSession(page),cx=box.x+box.width/2,cy=box.y+box.height*.4;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-25,y:cy,id:1},{x:cx+25,y:cy,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-50,y:cy,id:1},{x:cx+50,y:cy,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>(await camera()).zoom).toBeGreaterThan(baseline.zoom*1.5);
  await tree.focus();await page.keyboard.press('Tab');
  await tree.locator('[data-employee-id="4"]').focus();
  await expect(tree.locator('[data-employee-id="4"]')).toBeInViewport({ratio:FULL_VISIBILITY});
  expect(await page.locator('.game-screen').evaluate(el=>[el.scrollLeft,el.scrollTop])).toEqual([0,0]);
  await expect(page.locator('.org-detail')).toHaveCount(0);
  await tree.getByRole('button',{name:'聚焦全部',exact:true}).click();await allVisible();
  // A touch drag that starts on an avatar must transfer implicit capture without opening its profile.
  const avatar=(await tree.locator('[data-employee-id="1"] .org-portrait-ring').boundingBox())!,tx=avatar.x+avatar.width/2,ty=avatar.y+avatar.height/2;
  const beforeTouch=await camera();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1}]});
  for(const offset of [20,40,60])await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+offset,y:ty+20,id:1}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>(await camera()).x).toBeGreaterThan(beforeTouch.x+30);await expect(page.locator('.org-detail')).toHaveCount(0);
  await tree.getByRole('button',{name:'聚焦全部',exact:true}).click();await allVisible();
  await tree.locator('[data-employee-id="4"]').click();await expect(page.getByRole('complementary',{name:'员工详情'})).toBeVisible();await allVisible();
  await expect(page.locator('.org-detail-content').getByRole('combobox').nth(1)).toHaveValue('');
  await page.getByRole('button',{name:'收起人员档案',exact:true}).click();await allVisible();
  expect(await tree.evaluate(el=>{el.scrollLeft=100;el.scrollTop=100;return [el.scrollLeft,el.scrollTop];})).toEqual([0,0]);
  await page.screenshot({path:`artifacts/organization-canvas-${viewport.width}-${viewport.zoom}.png`});
  if(viewport.width===1280){await page.setViewportSize({width:640,height:360});await expect(page.getByTestId('game-layout')).toHaveAttribute('data-screen-scale','0.5');await allVisible();}
  const saved=await exportState(page);expect(saved.credits).toBe(full.snapshot().credits);expect(saved.career.employees).toEqual(full.snapshot().career.employees);
  await page.reload();await openOrganization(page);await allVisible();
});
