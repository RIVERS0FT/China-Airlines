import { test, expect, type Page } from './fixture.js';
import { readFile } from 'node:fs/promises';
import { GameCore, type GameState } from '../src/core/game.js';
import { GameCore as V7Core } from '../src/core/v7/game.js';
import { openGlobal } from './dispatch-helpers.js';
import { UI_SCALE_KEY } from '../src/ui/viewport.js';
const NOW = Date.parse('2026-09-14T02:00:00Z');
async function start(page: Page, saved?: unknown) {
  await page.clock.install({ time: new Date(NOW) }); await page.goto('./'); await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const rich = new GameCore(NOW).snapshot(); rich.credits = 1000000; rich.career.tickets = 10000;
  await openGlobal(page, '存档设置'); page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name:'organization.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(saved ?? rich)) });
  await expect(page.locator('.settings-modal')).toContainText('存档导入成功');
  await page.getByRole('button',{name:'关闭存档设置'}).click(); await openOrganization(page);
}
async function openOrganization(page:Page) { await openGlobal(page,'公司组织'); await expect(page.locator('.organization-workspace')).toBeVisible(); await expect(page.getByRole('region',{name:'公司组织架构树',exact:true})).toBeVisible(); }
async function recruit(page:Page,job:string,name:string) { await page.getByRole('button',{name:'招募',exact:true}).click(); const target=page.getByRole('button',{name:/^招募(飞行员|地勤专员|飞行部经理|地勤部经理)$/}); expect(await target.evaluate(el=>parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThanOrEqual(44); await page.getByLabel('招募岗位',{exact:true}).selectOption(job); await page.getByRole('button',{name:`招募${name}`,exact:true}).click(); }
async function exportState(page:Page) {
  await page.getByRole('button',{name:'关闭公司组织'}).click(); await openGlobal(page,'存档设置'); const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出存档',exact:true}).click(); const download=await pending;
  const saved=JSON.parse(await readFile((await download.path())!,'utf8')) as GameState;
  await page.getByRole('button',{name:'关闭存档设置'}).click(); return saved;
}
for (const [width,height] of [[1440,900],[844,390],[667,375]] as const) test(`company reporting, staffing and training persist at ${width}`,async({page})=>{
  const errors:string[]=[]; page.on('pageerror', e=>errors.push(e.message)); await page.setViewportSize({width,height}); await start(page);
  await recruit(page,'flight-specialist','飞行员'); await page.getByLabel('林航岗位').selectOption('AC0001');
  await recruit(page,'ground-specialist','地勤专员'); await page.getByLabel('顾川岗位').selectOption('PEK');
  await recruit(page,'flight-manager','飞行部经理');
  await page.getByRole('button',{name:'查看林航 · 飞行员',exact:true}).click(); await page.getByLabel('林航直属上级').selectOption('3');
  const detail=page.getByRole('complementary',{name:'员工详情'}); await expect(detail).toContainText('苏晴的管理效果生效');
  await detail.getByRole('tab',{name:'培养',exact:true}).click(); await detail.getByRole('button',{name:/^专业培训/}).click(); await expect(detail.locator('.org-attributes').getByText('1',{exact:true})).toBeVisible();
  const tree=page.getByRole('region',{name:'公司组织架构树',exact:true}); await page.locator('.org-view-menu > summary').click(); await page.getByRole('button',{name:'折叠飞行部',exact:true}).click();
  await expect(tree.locator('[data-employee-id="1"]')).toHaveCount(0); await page.getByRole('button',{name:'展开飞行部',exact:true}).click();
  await expect(tree.locator('[data-employee-id="1"]')).toHaveCount(1);
  await page.getByRole('button',{name:'放大组织树'}).click(); await expect(page.getByLabel('组织树缩放')).toHaveText('90%');
  await page.getByRole('button',{name:'复位',exact:true}).click(); await expect(page.getByLabel('组织树缩放')).toHaveText('80%');
  await page.locator('.org-view-menu > summary').click();
  await expect(page.locator('.org-pending')).toHaveCount(0);
  await expect(tree.locator('[data-employee-id="1"]')).toBeInViewport({ratio:1});
  await expect(tree.locator('[data-employee-id="2"]')).toBeInViewport({ratio:1});
  await page.screenshot({path:`artifacts/company-organization-${width}.png`});
  const state=await exportState(page); expect(state.version).toBe(9); expect(state.career.employees).toHaveLength(3); expect(Object.keys(state.career)).not.toContain('pilots');
  expect(state.career.employees[0]).toMatchObject({name:'林航',planeId:'AC0001',managerId:3,skill:1}); expect(state.career.employees[1]!.airportId).toBe('PEK');
  await page.reload(); await openOrganization(page); await page.getByRole('button',{name:'查看林航 · 飞行员',exact:true}).click();
  await expect(page.getByLabel('林航直属上级')).toHaveValue('3'); await expect(page.getByLabel('林航岗位')).toHaveValue('AC0001');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); expect(errors).toEqual([]);
});
test('legacy pilots migrate once and the organization remains usable offline',async({page,context})=>{
  const old=new V7Core(NOW);old.execute({type:'recruit-pilot'},NOW);old.execute({type:'assign-pilot',pilotId:1,planeId:'AC0001'},NOW);
  await start(page,old.snapshot()); await page.getByRole('button',{name:'查看林航 · 飞行员',exact:true}).click();
  await expect(page.getByLabel('林航岗位')).toHaveValue('AC0001'); await page.getByRole('tab',{name:'履历',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'员工详情'})).toContainText('历史入职时间未知');
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);await page.reload();await openOrganization(page);await page.getByRole('button',{name:'查看林航 · 飞行员',exact:true}).click();
  await expect(page.getByLabel('林航岗位')).toHaveValue('AC0001'); const saved=await exportState(page);expect(saved.career.employees).toHaveLength(1);
  expect(saved.career.employees[0]!.paidUntil).toBe(old.snapshot().career.pilots[0]!.paidUntil);expect(saved.credits).toBe(old.snapshot().credits);
});
test('promotion, portrait return and 150 percent UI scale do not break staffing',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.addInitScript(key=>localStorage.setItem(key,'150'),UI_SCALE_KEY);await start(page);
  await recruit(page,'flight-specialist','飞行员');await page.getByLabel('林航岗位').selectOption('AC0001');
  const detail=page.getByRole('complementary',{name:'员工详情'});
  await detail.getByRole('tab',{name:'培养',exact:true}).click();
  for(let i=0;i<2;i++)await detail.getByRole('button',{name:/^专业培训/}).click();await detail.getByRole('button',{name:/^管理培训/}).click();
  page.once('dialog',d=>void d.accept());await detail.getByRole('button',{name:'晋升部门经理',exact:true}).click();await expect(detail).toContainText('飞行部经理');
  await expect(page.getByRole('button',{name:'查看林航 · 飞行部经理',exact:true})).toBeInViewport({ratio:1});
  await page.screenshot({path:'artifacts/company-organization-844-scale150.png'});
  const s=await exportState(page);expect(s.fleet[0]!.dispatcher).toBe(false);expect(s.career.employees[0]!.role).toBe('manager');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.rotate-screen')).toBeVisible();await page.setViewportSize({width:844,height:390});await expect(page.locator('.rotate-screen')).toBeHidden();
  await openOrganization(page);await expect(page.getByRole('button',{name:'查看林航 · 飞行部经理',exact:true})).toBeVisible();
});
test('organization pan and zoom are UI-only and preserve same-aspect layout',async({page})=>{
  const c=new GameCore(NOW),s=c.snapshot();s.credits=1000000;s.career.tickets=10000;const full=new GameCore(NOW,s);
  full.execute({type:'recruit-employee',department:'flight',role:'manager'},NOW);
  for(let i=0;i<7;i++){full.execute({type:'recruit-pilot'},NOW);full.execute({type:'report-to',employeeId:i+2,managerId:1},NOW);}
  await page.setViewportSize({width:1280,height:720});await start(page,full.snapshot());
  const tree=page.getByRole('region',{name:'公司组织架构树',exact:true});
  await tree.focus();await page.keyboard.press('ArrowDown');expect(await tree.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  const box=(await tree.boundingBox())!;await page.mouse.move(box.x+12,box.y+box.height-20);await page.mouse.down();await page.mouse.move(box.x+12,box.y+30,{steps:8});await page.mouse.up();
  expect(await tree.evaluate(el=>el.scrollTop)).toBeGreaterThan(60);
  await page.locator('.org-view-menu > summary').click(); await page.getByRole('button',{name:'复位',exact:true}).click();await expect(tree).toHaveJSProperty('scrollTop',0);
  const dimensions=()=>tree.evaluate(el=>{const r=el.getBoundingClientRect();return [r.width/innerWidth,r.height/innerHeight];});
  const before=await dimensions();await page.setViewportSize({width:640,height:360});await expect(page.getByTestId('game-layout')).toHaveAttribute('data-screen-scale','0.5');const after=await dimensions();
  expect(after[0]).toBeCloseTo(before[0]!,4);expect(after[1]).toBeCloseTo(before[1]!,4);
  const saved=await exportState(page);expect(saved.credits).toBe(full.snapshot().credits);expect(saved.career.employees).toEqual(full.snapshot().career.employees);
});
