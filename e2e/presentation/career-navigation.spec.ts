import { expect, test, type Page } from '../helpers/configured-airport.js';
const NOW=Date.parse('2026-09-13T02:00:00Z');
async function start(page:Page,fleetCount='1 架'){await page.clock.install({time:new Date(NOW)});await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText(fleetCount);}
for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:667,height:375}])test(`career and organization use distinct navigation at ${viewport.width}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize(viewport);await start(page);
  const hud=page.locator('.game-hud'),dock=page.getByRole('navigation',{name:'主导航'}),coins=hud.locator('.resource').filter({has:page.getByTestId('credits')}),count=page.getByTestId('credits');
  const career=dock.getByRole('button',{name:'经营中心',exact:true}),organization=dock.getByRole('button',{name:'公司组织',exact:true}),workspace=page.getByRole('main',{name:'公司经营中心',exact:true});
  const balance=await count.innerText(),credits=await page.getByTestId('credits').innerText();
  await expect(hud.getByRole('button',{name:/经营中心|点券/})).toHaveCount(0);await expect(hud.getByTestId('tickets-resource')).toHaveCount(0);await expect(coins.locator('small')).toHaveText('运营资金');await expect(count).toHaveText(/^¥ /);
  expect(await coins.evaluate(el=>({tag:el.tagName,tabIndex:(el as HTMLElement).tabIndex,interactive:Boolean(el.closest('button,a,[role="button"]'))}))).toEqual({tag:'DIV',tabIndex:-1,interactive:false});
  await coins.hover();expect(await coins.evaluate(el=>getComputedStyle(el).cursor)).not.toBe('pointer');await count.click();await expect(workspace).toHaveCount(0);await expect(count).toHaveText(balance);await expect(page.getByTestId('credits')).toHaveText(credits);
  await expect(dock.locator(':scope > button > span')).toHaveText(['地图','机场装载','机场目录','机队管理','飞机商店','公司组织','经营中心','制定航线']);
  await expect(career).toBeEnabled();await expect(career).toBeInViewport();await expect(career).not.toHaveAttribute('aria-haspopup','dialog');await expect(organization).not.toHaveAttribute('aria-haspopup','dialog');
  const shop=(await dock.getByRole('button',{name:'飞机商店',exact:true}).boundingBox())!,org=(await organization.boundingBox())!,biz=(await career.boundingBox())!,route=(await dock.getByRole('button',{name:'制定航线',exact:true}).boundingBox())!;
  expect(org.x).toBeGreaterThanOrEqual(shop.x+shop.width-1);expect(biz.x).toBeGreaterThanOrEqual(org.x+org.width-1);expect(biz.x+biz.width).toBeLessThanOrEqual(route.x+1);expect(route.x+route.width).toBeLessThanOrEqual(viewport.width+1);
  await career.click();await expect(workspace).toBeVisible();await expect(page.locator('dialog[open]')).toHaveCount(0);await expect(career).toHaveAttribute('aria-current','page');await expect(workspace.getByRole('tab',{name:'物流园',exact:true})).toBeVisible();await expect(workspace.getByRole('tab',{name:'公司组织',exact:true})).toHaveCount(0);await expect(workspace.getByRole('button',{name:'关闭公司经营中心',exact:true})).toHaveCount(0);
  await organization.click();const tree=page.locator('.organization-workspace');await expect(tree).toBeVisible();await expect(organization).toHaveAttribute('aria-current','page');await expect(hud).toBeVisible();await expect(dock).toBeVisible();
  await expect(tree.getByRole('heading',{name:'公司组织',exact:true})).toHaveCount(0);await expect(tree.getByRole('region',{name:'公司组织架构树',exact:true})).toBeVisible();await expect(tree.locator('.org-detail')).toHaveCount(0);await expect(tree.locator('.org-recruit')).toHaveCount(0);
  await expect(tree.getByRole('region',{name:'公司组织架构树',exact:true})).not.toContainText('可由玩家直接管理');
  await expect(tree).not.toContainText(/COMPANY COMMAND|REPORTING MAP|PERSONNEL FILE/);await expect(page.getByRole('dialog',{name:'公司组织',exact:true})).toHaveCount(0);
  await expect(count).toHaveText(balance);await expect(page.getByTestId('credits')).toHaveText(credits);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/career-navigation-${viewport.width}.png`});await dock.getByRole('button',{name:'机场装载',exact:true}).click();await expect(tree).toHaveCount(0);
  await page.reload();await expect(career).toBeVisible();await expect(count).toHaveText(balance);await expect(hud.getByRole('button',{name:/经营中心|点券/})).toHaveCount(0);await career.click();await expect(workspace).toBeVisible();expect(errors).toEqual([]);
});
for(const key of ['Enter','Space'])test(`organization page supports ${key} activation and excludes balance from tab order`,async({page})=>{
  await start(page);await page.getByRole('button',{name:'机队管理概览',exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'操作帮助',exact:true})).toBeFocused();
  const dock=page.getByRole('navigation',{name:'主导航'}),entry=dock.getByRole('button',{name:'公司组织',exact:true});await dock.getByRole('button',{name:'飞机商店',exact:true}).focus();await page.keyboard.press('Tab');await expect(entry).toBeFocused();await page.keyboard.press(key);await expect(page.locator('.organization-workspace')).toBeVisible();await dock.getByRole('button',{name:'机场装载',exact:true}).click();await expect(page.locator('.organization-workspace')).toHaveCount(0);
});
test('organization and recruitment titles follow English without decorative subtitles',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('china-airlines:locale:v1','en-US'));await start(page,'1 aircraft');await page.getByRole('button',{name:'Organization',exact:true}).click();const workspace=page.locator('.organization-workspace');
  await expect(workspace.getByRole('heading',{name:'Company Organization',exact:true})).toHaveCount(0);await expect(workspace.getByRole('region',{name:'Company Organization Tree',exact:true})).toBeVisible();await expect(workspace).not.toContainText(/COMPANY COMMAND|REPORTING MAP|PERSONNEL FILE|组织指挥室/);
  await expect(workspace.getByRole('region',{name:'Company Organization Tree',exact:true})).not.toContainText('Player managed · manager optional');
  await workspace.getByRole('button',{name:'Talent Market',exact:true}).click();await expect(workspace.getByRole('heading',{name:'Talent Market',exact:true})).toBeVisible();const market=workspace.getByRole('region',{name:'Talent Market',exact:true});await expect(market).toBeVisible();await expect(market.getByRole('combobox',{name:'Recruiting department'})).toHaveCount(1);await expect(workspace.getByLabel('Recruitment role',{exact:true})).toHaveCount(0);
  await expect(market.locator('[data-candidate-id]')).toHaveCount(3);await expect(page.getByTestId('talent-batch-summary')).toHaveText('Company Lv.1 · 3/3 candidates left · Next batch: 3');
  await expect(market).toContainText('New candidates every 5 minutes');
  const candidate=market.locator('[data-candidate-id]').first();
  await expect(candidate.getByRole('button',{name:/^Hire .+ · /})).toBeEnabled();await expect(candidate.getByRole('button')).toHaveText('Hire');
  await expect(candidate.locator('.org-candidate-price dt')).toHaveText(['Hiring cost','Pay / 7 days']);
  await expect(candidate.locator('.org-candidate-assignment')).toHaveText(/^Auto-assign: /);
});
