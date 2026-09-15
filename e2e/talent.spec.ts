import {test,expect,type Page} from './fixture.js';
import {readFile} from 'node:fs/promises';
import {GameCore,type GameState} from '../src/core/game.js';
import {openGlobal} from './dispatch-helpers.js';
const NOW=Date.parse('2026-09-14T02:00:00Z');
async function prepare(page:Page){
  await page.clock.install({time:new Date(NOW)});await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const s=new GameCore(NOW).snapshot();s.credits=1000000;s.career.tickets=10000;await openGlobal(page,'存档设置');page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'talent.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await expect(page.locator('.settings-modal')).toContainText('存档导入成功');await page.getByRole('button',{name:'关闭存档设置'}).click();await openGlobal(page,'公司组织');
}
async function exportState(page:Page){await page.getByRole('button',{name:'关闭公司组织',exact:true}).click();await openGlobal(page,'存档设置');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();const download=await pending;const saved=JSON.parse(await readFile((await download.path())!,'utf8')) as GameState;await page.getByRole('button',{name:'关闭存档设置'}).click();return saved;}
test('candidate choices, mentoring, deferred advice and employee links survive reload and offline use',async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await prepare(page);
  await expect(page.locator('.org-detail')).toHaveCount(0);await expect(page.locator('.org-recruit')).toHaveCount(0);
  await page.getByRole('button',{name:'招募',exact:true}).click();const candidates=page.locator('[data-candidate-id]'),initial=await candidates.allTextContents();
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:'招募',exact:true}).click();expect(await candidates.allTextContents()).toEqual(initial);
  await candidates.nth(2).click();await page.getByRole('button',{name:'招募飞行员',exact:true}).click();await page.getByLabel('周远岗位',{exact:true}).selectOption('AC0001');
  await page.getByRole('button',{name:'招募',exact:true}).click();await page.getByLabel('招募岗位',{exact:true}).selectOption('flight-manager');await page.getByRole('button',{name:'招募飞行部经理',exact:true}).click();
  await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();await page.getByLabel('周远直属上级',{exact:true}).selectOption('2');
  await page.getByRole('button',{name:/^公司事务/}).click();await page.locator('[data-affair="training:1"]').getByRole('button',{name:'暂缓',exact:true}).click();await expect(page.locator('[data-affair="training:1"]')).toHaveCount(0);
  await page.reload();await openGlobal(page,'公司组织');await page.getByRole('button',{name:/^公司事务/}).click();await expect(page.locator('[data-affair="training:1"]')).toHaveCount(0);await page.getByRole('button',{name:'返回组织树',exact:true}).click();
  await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();const detail=page.getByRole('complementary',{name:'员工详情'});await detail.getByRole('tab',{name:'培养',exact:true}).click();await detail.getByRole('button',{name:/^专业培训/}).click();await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');
  await detail.getByRole('tab',{name:'任职',exact:true}).click();await page.getByLabel('周远直属上级',{exact:true}).selectOption('');await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');
  await page.getByRole('button',{name:'公司纪事',exact:true}).click();await expect(page.locator('.company-chronicle')).toContainText('苏晴指导周远完成专业培养');await page.screenshot({path:'artifacts/company-talent-chronicle.png'});
  await page.getByRole('button',{name:'返回组织树',exact:true}).click();await page.getByRole('button',{name:'招募',exact:true}).click();await expect(page.locator('[data-candidate-id]').first()).toBeVisible();await page.screenshot({path:'artifacts/employee-portraits-candidates.png'});
  await page.getByRole('button',{name:'机队管理',exact:true}).click();await page.getByRole('button',{name:'负责飞行员 · 周远',exact:true}).click();await expect(detail.getByRole('heading',{name:'周远',exact:true})).toBeVisible();
  const saved=await exportState(page);expect(saved.version).toBe(9);expect(saved.talent.mentoring).toHaveLength(1);expect(saved.talent.mentoring[0]).toMatchObject({employeeId:1,mentorId:2,level:1});expect(saved.talent.mentoring[0]!.at).toBeGreaterThanOrEqual(0);expect(saved.talent.mentoring[0]!.at).toBeLessThanOrEqual(saved.simTime);expect(saved.talent.candidates.some(c=>c.id===3)).toBe(false);expect(saved.career.employees[0]!.managerId).toBeNull();
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));await context.setOffline(true);await page.reload();await openGlobal(page,'公司组织');
  await page.getByRole('button',{name:'查看周远 · 飞行员',exact:true}).click();await detail.getByRole('tab',{name:'履历',exact:true}).click();await expect(detail).toContainText('苏晴指导周远达到专业1级');await expect(page.locator('.toast')).toHaveCount(0);expect(errors).toEqual([]);
});
test('organization keeps a mounted map and returns without losing camera or game state',async({page})=>{
  await page.setViewportSize({width:844,height:390});await prepare(page);await page.getByRole('button',{name:'关闭公司组织',exact:true}).click();await page.getByRole('button',{name:'地图',exact:true}).click();const canvas=page.getByTestId('map-canvas');await expect(canvas).toHaveAttribute('data-renderer','ready');
  await canvas.evaluate(el=>el.setAttribute('data-talent-camera-probe','same-mount'));const credits=await page.getByTestId('credits').innerText();await page.getByRole('button',{name:'公司组织',exact:true}).click();await expect(canvas).toBeHidden();await expect(canvas).toHaveAttribute('data-talent-camera-probe','same-mount');await expect(page.locator('.org-scroll')).toBeVisible();
  await page.getByRole('button',{name:'关闭公司组织',exact:true}).click();await expect(canvas).toBeVisible();await expect(canvas).toHaveAttribute('data-talent-camera-probe','same-mount');await expect(page.getByTestId('credits')).toHaveText(credits);await expect(page.locator('.map-zoom-controls')).toHaveCount(0);
});
