import { expect, test, type Page } from './fixture.js';
const NOW=Date.parse('2026-09-13T02:00:00Z');
async function start(page:Page,fleetCount='1 架'){await page.clock.install({time:new Date(NOW)});await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText(fleetCount);}
for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:667,height:375}])test(`career and organization use distinct navigation at ${viewport.width}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize(viewport);await start(page);
  const hud=page.locator('.game-hud'),dock=page.getByRole('navigation',{name:'主导航'}),tickets=page.getByTestId('tickets-resource'),count=page.getByTestId('tickets-count');
  const career=dock.getByRole('button',{name:'经营中心',exact:true}),organization=dock.getByRole('button',{name:'公司组织',exact:true}),dialog=page.getByRole('dialog',{name:'公司经营中心',exact:true});
  const balance=await count.innerText(),credits=await page.getByTestId('credits').innerText();
  await expect(hud.getByRole('button',{name:/经营中心|点券/})).toHaveCount(0);await expect(hud.getByTestId('tickets-resource')).toHaveCount(1);await expect(tickets.locator('small')).toHaveText('点券');await expect(count).toHaveText(/^\d+ 券$/);
  expect(await tickets.evaluate(el=>({tag:el.tagName,tabIndex:(el as HTMLElement).tabIndex,interactive:Boolean(el.closest('button,a,[role="button"]'))}))).toEqual({tag:'DIV',tabIndex:-1,interactive:false});
  await tickets.hover();expect(await tickets.evaluate(el=>getComputedStyle(el).cursor)).not.toBe('pointer');await count.click();await expect(dialog).toHaveCount(0);await expect(count).toHaveText(balance);await expect(page.getByTestId('credits')).toHaveText(credits);
  await expect(dock.locator(':scope > button > span')).toHaveText(['地图','机场装载','机场目录','机队管理','飞机商店','公司组织','经营中心','制定路线']);
  await expect(career).toBeEnabled();await expect(career).toBeInViewport();await expect(career).toHaveAttribute('aria-haspopup','dialog');await expect(organization).not.toHaveAttribute('aria-haspopup','dialog');
  const shop=(await dock.getByRole('button',{name:'飞机商店',exact:true}).boundingBox())!,org=(await organization.boundingBox())!,biz=(await career.boundingBox())!,route=(await dock.getByRole('button',{name:'制定路线',exact:true}).boundingBox())!;
  expect(org.x).toBeGreaterThanOrEqual(shop.x+shop.width-1);expect(biz.x).toBeGreaterThanOrEqual(org.x+org.width-1);expect(biz.x+biz.width).toBeLessThanOrEqual(route.x+1);expect(route.x+route.width).toBeLessThanOrEqual(viewport.width+1);
  await career.click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('tab',{name:'物流园',exact:true})).toBeVisible();await expect(dialog.getByRole('tab',{name:'公司组织',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'关闭公司经营中心',exact:true}).click();
  await organization.click();const workspace=page.locator('.organization-workspace');await expect(workspace).toBeVisible();await expect(organization).toHaveAttribute('aria-current','page');await expect(hud).toBeVisible();await expect(dock).toBeVisible();
  await expect(workspace.getByRole('heading',{name:'公司组织',exact:true})).toBeVisible();await expect(workspace.getByRole('region',{name:'公司组织架构树',exact:true})).toBeVisible();await expect(workspace.locator('.org-detail')).toHaveCount(0);await expect(workspace.locator('.org-recruit')).toHaveCount(0);
  await expect(workspace).not.toContainText(/COMPANY COMMAND|REPORTING MAP|PERSONNEL FILE/);await expect(page.getByRole('dialog',{name:'公司组织',exact:true})).toHaveCount(0);
  await expect(count).toHaveText(balance);await expect(page.getByTestId('credits')).toHaveText(credits);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/career-navigation-${viewport.width}.png`});await page.getByRole('button',{name:'关闭公司组织',exact:true}).click();await expect(workspace).toHaveCount(0);
  await page.reload();await expect(career).toBeVisible();await expect(count).toHaveText(balance);await expect(hud.getByRole('button',{name:/经营中心|点券/})).toHaveCount(0);await career.click();await expect(dialog).toBeVisible();expect(errors).toEqual([]);
});
for(const key of ['Enter','Space'])test(`organization page supports ${key} activation and excludes balance from tab order`,async({page})=>{
  await start(page);await page.getByRole('button',{name:'机队管理概览',exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'操作帮助',exact:true})).toBeFocused();
  const dock=page.getByRole('navigation',{name:'主导航'}),entry=dock.getByRole('button',{name:'公司组织',exact:true});await dock.getByRole('button',{name:'飞机商店',exact:true}).focus();await page.keyboard.press('Tab');await expect(entry).toBeFocused();await page.keyboard.press(key);await expect(page.locator('.organization-workspace')).toBeVisible();await page.getByRole('button',{name:'关闭公司组织',exact:true}).click();await expect(page.locator('.organization-workspace')).toHaveCount(0);
});
test('organization and recruitment titles follow English without decorative subtitles',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('china-airlines:locale:v1','en-US'));await start(page,'1 aircraft');await page.getByRole('button',{name:'Organization',exact:true}).click();const workspace=page.locator('.organization-workspace');
  await expect(workspace.getByRole('heading',{name:'Company Organization',exact:true})).toBeVisible();await expect(workspace.getByRole('region',{name:'Company Organization Tree',exact:true})).toBeVisible();await expect(workspace).not.toContainText(/COMPANY COMMAND|REPORTING MAP|PERSONNEL FILE|组织指挥室/);
  await workspace.getByRole('button',{name:'Recruit',exact:true}).click();await expect(workspace.getByRole('heading',{name:'Choose your next colleague',exact:true})).toBeVisible();await expect(workspace.getByLabel('Recruitment role',{exact:true})).toBeVisible();await expect(workspace.getByRole('button',{name:'Hire Pilot',exact:true})).toBeEnabled();
});
