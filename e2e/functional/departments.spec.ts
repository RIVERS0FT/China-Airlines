import { offerCandidates } from '../../tests/helpers/talent-market.js';
import { test, expect, type Page } from '../helpers/configured-airport.js';
import { readFile } from 'node:fs/promises';
import { GameCore, type GameState } from '../helpers/configured-game.js';
import { DEPARTMENT_CATALOG, SUPPORT_DEPARTMENTS } from '../../src/core/departments.js';
import { openGlobal } from '../helpers/dispatch-helpers.js';
const NOW=Date.parse('2026-09-29T02:00:00Z');
async function prepare(page:Page) {
  await page.clock.install({time:new Date(NOW)});await page.goto('./');
  const s=new GameCore(NOW).snapshot();s.credits=1000000;offerCandidates(s,[['publicity','manager'],...SUPPORT_DEPARTMENTS.map(d=>[d,'specialist'] as const)]);
  await openGlobal(page,'存档设置');page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'departments.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});
  await expect(page.locator('.settings-modal')).toContainText('存档导入成功');await page.getByRole('button',{name:'关闭存档设置'}).click();await openGlobal(page,'公司组织');
}
async function exported(page:Page) {
  await openGlobal(page,'存档设置');const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出存档',exact:true}).click();
  const download=await pending,state=JSON.parse(await readFile((await download.path())!,'utf8')) as GameState;
  await page.getByRole('button',{name:'关闭存档设置'}).click();return state;
}
for(const [width,height] of [[1440,900],[667,375]] as const) test(`airline departments recruit, train and survive offline reload at ${width}`,async({page,context})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height});await prepare(page);
  await page.getByLabel('部门视图',{exact:true}).selectOption('publicity');await expect(page.getByTestId('department-effect')).toHaveText('机场推广费用 −0%');
  await page.getByRole('button',{name:'招募宣传部经理',exact:true}).click();
  const managerCard=page.locator('[data-talent-position="publicity-manager"] [data-candidate-id]').first();
  await managerCard.getByRole('button').click();await expect(page.locator('.org-detail')).toContainText('宣传部经理');
  await page.locator('.org-detail').getByRole('tab',{name:'培养',exact:true}).click();
  await expect(page.locator('.org-detail')).toContainText('管理每级：直属专员效能＋1个百分点');
  await expect(page.locator('.org-detail')).not.toContainText('专业每级：部门效能＋2个百分点');
  for(const department of SUPPORT_DEPARTMENTS){
    await page.getByRole('button',{name:'人才市场',exact:true}).click();await page.getByLabel('招聘部门',{exact:true}).selectOption(department);
    await expect(page.locator('[data-candidate-id]')).toHaveCount(1);
    const card=page.locator(`[data-talent-position="${department}-specialist"] [data-candidate-id]`).first();
    await expect(card).toContainText('1400 金币');await card.getByRole('button').click();
    await expect(page.getByLabel('部门视图',{exact:true})).toHaveValue(department);
    const detail=page.locator('.org-detail');await expect(detail).toContainText(DEPARTMENT_CATALOG[department].specialist);
    await expect(detail.getByLabel(/岗位$/)).toHaveCount(0);
    await expect(page.getByTestId('department-effect')).not.toHaveText(/ [−+]0%$/);
    if(department==='publicity'){
      await expect(detail.getByRole('combobox')).toHaveValue('1');
      await detail.getByRole('tab',{name:'培养',exact:true}).click();await detail.getByRole('button',{name:/^专业培训/}).click();
      await expect(detail.locator('.org-attributes').getByText('2',{exact:true})).toBeVisible();
    }
  }
  await page.getByRole('button',{name:'收起人员档案',exact:true}).click();await page.getByLabel('部门视图',{exact:true}).selectOption('publicity');
  await page.screenshot({path:`artifacts/airline-departments-${width}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const saved=await exported(page);expect(saved.version).toBe(18);expect(saved.career.employees).toHaveLength(8);expect(saved.talent.candidates).toHaveLength(0);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await context.setOffline(true);
  try {
    await page.reload();await openGlobal(page,'公司组织');
    for(const department of SUPPORT_DEPARTMENTS){
      await page.getByLabel('部门视图',{exact:true}).selectOption(department);
      await expect(page.locator(`.org-person[data-department="${department}"]`)).toHaveCount(department==='publicity'?2:1);
      await expect(page.getByTestId('department-effect')).not.toHaveText(/ [−+]0%$/);
    }
    expect((await exported(page)).career.employees).toEqual(saved.career.employees);
  } finally {await context.setOffline(false);}
  expect(errors).toEqual([]);
});
