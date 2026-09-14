import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GameCore, type GameState } from '../src/core/game.js';
import { openGlobal } from './dispatch-helpers.js';
const NOW = Date.parse('2026-09-14T02:00:00Z');
async function setup(page: Page) {
  const s = new GameCore(NOW).snapshot();s.credits=1000000;s.career.tickets=1000;s.career.xp=300;
  await page.clock.install({time:new Date(NOW)});await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await openGlobal(page,'存档设置');page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'organization-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});
  await expect(page.getByTestId('credits')).toContainText('1,000,000');await page.getByRole('button',{name:'关闭存档设置'}).click();
  await openGlobal(page,'经营中心');await page.getByRole('tab',{name:'公司组织',exact:true}).click();
}
async function exportState(page:Page) {
  await page.getByRole('button',{name:'关闭公司经营中心'}).click();await openGlobal(page,'存档设置');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();const file=await pending;
  const s=JSON.parse(await readFile((await file.path())!,'utf8')) as GameState;await page.getByRole('button',{name:'关闭存档设置'}).click();return s;
}
for(const [width,height] of [[1440,900],[844,390],[667,375]])test(`organization tree recruitment, promotion, assignments and scaling at ${width}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:width!,height:height!});await setup(page);
  await expect(page.getByRole('tab',{name:'飞行团队',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'可拖动的员工组织树'})).toBeVisible();
  await page.getByRole('button',{name:'招募地勤',exact:false}).click();await page.getByLabel('顾宁岗位').selectOption('PEK');
  await expect(page.locator('.org-effect')).toContainText('北京新补能服务');
  await page.getByRole('button',{name:'招募飞行员',exact:false}).click();await page.getByRole('button',{name:/专业训练/}).click();await page.getByRole('button',{name:/专业训练/}).click();
  page.once('dialog',d=>void d.accept());await page.getByRole('button',{name:'任命为飞行部经理',exact:true}).click();
  await expect(page.getByRole('button',{name:'林航 · 飞行部经理',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'招募飞行员',exact:false}).click();await page.getByLabel('苏晴岗位').selectOption('AC0001');
  await expect(page.locator('[data-employee-id="3"]')).toContainText('AC0001');
  await page.getByRole('button',{name:'折叠飞行部',exact:true}).click();await expect(page.locator('[data-employee-id="3"]')).toHaveCount(0);
  await page.getByRole('button',{name:'展开飞行部',exact:true}).click();await expect(page.locator('[data-employee-id="3"]')).toHaveCount(1);
  await page.getByRole('button',{name:'缩小组织图',exact:true}).click();await expect(page.getByLabel('组织图缩放比例')).toHaveText('90%');
  await page.getByRole('button',{name:'放大组织图',exact:true}).click();await expect(page.getByLabel('组织图缩放比例')).toHaveText('100%');
  await page.locator('.org-inspector').evaluate(el=>{el.scrollTop=0;});await page.locator('.company-organization').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/company-organization-${width}.png`});
  const saved=await exportState(page);expect(saved.version).toBe(8);expect(saved.career).not.toHaveProperty('pilots');expect(saved.career.employees).toHaveLength(3);
  expect(saved.career.employees.find(e=>e.name==='林航')!.role).toBe('manager');expect(saved.career.employees.find(e=>e.name==='顾宁')!.airportId).toBe('PEK');
  await page.reload();await openGlobal(page,'经营中心');await page.getByRole('tab',{name:'公司组织',exact:true}).click();
  await page.getByRole('button',{name:'苏晴 · 飞行员',exact:true}).click();await expect(page.getByLabel('苏晴岗位')).toHaveValue('AC0001');
  await page.getByRole('button',{name:/查看负责飞机/}).click();await expect(page.getByRole('dialog',{name:'公司经营中心'})).toHaveCount(0);
  await openGlobal(page,'经营中心');await page.getByRole('tab',{name:'公司组织',exact:true}).click();await page.getByRole('button',{name:'顾宁 · 地勤专员',exact:true}).click();await page.getByRole('button',{name:/前往负责机场/}).click();
  await expect(page.getByRole('dialog',{name:'公司经营中心'})).toHaveCount(0);expect(errors).toEqual([]);
});
test('organization persists through offline startup and rejects a corrupt personnel import',async({page,context})=>{
  await setup(page);await page.getByRole('button',{name:'招募地勤',exact:false}).click();await page.getByLabel('顾宁岗位').selectOption('PEK');const saved=await exportState(page);
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);await page.reload();await openGlobal(page,'经营中心');await page.getByRole('tab',{name:'公司组织',exact:true}).click();
  await page.getByRole('button',{name:'顾宁 · 地勤专员',exact:true}).click();await expect(page.getByLabel('顾宁岗位')).toHaveValue('PEK');
  await page.getByRole('button',{name:'关闭公司经营中心'}).click();await openGlobal(page,'存档设置');const bad=structuredClone(saved);bad.career.employees[0]!.airportId='XXX';
  page.once('dialog',d=>void d.accept());await page.getByLabel('选择存档文件').setInputFiles({name:'bad-organization.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await expect(page.getByRole('alert')).toContainText('无效');await page.getByRole('button',{name:'关闭存档设置'}).click();await openGlobal(page,'经营中心');await page.getByRole('tab',{name:'公司组织',exact:true}).click();
  await page.getByRole('button',{name:'顾宁 · 地勤专员',exact:true}).click();await expect(page.getByLabel('顾宁岗位')).toHaveValue('PEK');
});
