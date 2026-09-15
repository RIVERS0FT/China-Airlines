import { selectCity, detailValue, launchRoute, openGlobal } from './dispatch-helpers.js';
import { test, expect, type Page } from './fixture.js';
import { rejectRetiredSave } from './retired-save-helpers.js';
import type { GameState } from '../src/core/game.js';
import legacy from '../tests/fixtures/v3-dispatching.json' with { type: 'json' };
let errors:string[];
test.beforeEach(async({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));});
test.afterEach(()=>expect(errors).toEqual([]));
async function ready(page:Page){await page.clock.install({time:new Date('2026-09-11T00:00:00Z')});await page.goto('./');await expect(page.getByTestId('fleet-count')).toHaveText('1 架');}
async function secondPlane(page:Page){await openGlobal(page, '飞机商店');await page.getByRole('button',{name:'纯货机',exact:true}).click();await page.getByRole('button',{name:'购买雨燕 货运型',exact:true}).click();await expect(page.getByTestId('fleet-count')).toHaveText('2 架');await page.getByRole('button',{name:'关闭飞机商店'}).click();await openGlobal(page, '机队管理');await page.getByRole('button',{name:/雨燕 货运型.*AC0002/}).click();}
async function chooseShanghai(page:Page){await selectCity(page, 'PEK');await selectCity(page, 'PVG');await expect(await detailValue(page, 'plan-summary')).toContainText('1 段');}

/** Observe only the committed main slot; never change storage to make a test pass.
 * Tutorial commands intentionally suppress toasts, so a toast is not a save ack. */
async function savedTutorial(page: Page) {
  return page.evaluate(() => new Promise<{ tutorial: GameState['tutorial']; revision: number; credits: number; fleetSize: number }>((resolve, reject) => {
    const request = indexedDB.open('china-airlines');
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('Expected an existing game database')); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Game database blocked'));
    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction('saves', 'readonly');
        const get = transaction.objectStore('saves').get('main');
        let record: { revision: number; state: GameState } | undefined;
        get.onsuccess = () => { record = get.result; };
        transaction.oncomplete = () => {
          db.close();
          if (!record) { reject(new Error('Expected a saved main slot')); return; }
          resolve({ tutorial: record.state.tutorial, revision: record.revision, credits: record.state.credits, fleetSize: record.state.fleet.length });
        };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      } catch (error) { db.close(); reject(error); }
    };
  }));
}

test('hire and confirm or cancel empty-aircraft resale with persistent money',async({page})=>{
  await ready(page);await secondPlane(page);await expect(page.getByTestId('crew-status')).toContainText('未雇用');
  await page.getByRole('button',{name:'雇用随航调度员',exact:true}).click();await expect(page.getByTestId('crew-status')).toContainText('已雇用');await expect(page.getByTestId('credits')).toHaveText('¥ 9,550');
  page.once('dialog',d=>void d.accept());await page.getByRole('button',{name:'人员下岗',exact:true}).click();await page.getByRole('button',{name:'出售这架飞机',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/desktop-crew-sale.png'});
  await page.getByRole('button',{name:'出售这架飞机',exact:true}).click();await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  page.once('dialog',d=>void d.accept());await page.getByRole('button',{name:'出售这架飞机',exact:true}).click();await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await expect(page.getByTestId('credits')).toHaveText('¥ 12,875');await expect(page.getByRole('button',{name:'出售这架飞机',exact:true})).toBeDisabled();
  await page.reload();await expect(page.getByTestId('fleet-count')).toHaveText('1 架');await expect(page.getByTestId('credits')).toHaveText('¥ 12,875');
});
test('hangar duty can start for a reachable unlocked city without route purchase',async({page})=>{
  await ready(page);await openGlobal(page, '机队管理');await page.getByRole('button',{name:'雇用随航调度员',exact:true}).click();
  await expect(page.getByLabel('值勤目的地',{exact:true})).toHaveValue('PVG');
  await page.getByRole('button',{name:'启动自动值勤',exact:true}).click();await expect(page.getByTestId('crew-status')).toContainText('自动值勤');
  await page.getByRole('button',{name:'停止自动值勤',exact:true}).click();await expect(page.getByRole('button',{name:'人员下岗',exact:true})).toBeDisabled();await page.getByRole('button',{name:'关闭机队管理'}).click();
  await openGlobal(page, '机场装载');await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();await page.clock.fastForward(400000);await expect(page.getByTestId('flights-count')).toHaveText('1 班');await expect(page.getByTestId('loaded-order')).toHaveCount(0);
});
test('retired v3 automatic flight cannot replace current progress',async({page})=>{
  await ready(page);await page.clock.pauseAt(new Date('2026-09-11T00:00:05Z'));await rejectRetiredSave(page,legacy);
});
for(const width of [1440,844])test(`guided real first flight persists at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===1440?900:390});await ready(page);await openGlobal(page, '操作帮助');await page.getByRole('button',{name:'开始分步引导',exact:true}).click();
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','load');await expect(page.getByTestId('waiting-order').first()).toHaveClass(/tutorial-target/);await page.screenshot({path:`artifacts/tutorial-loading-${width}.png`});
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','map');await page.getByRole('button',{name:'制定路线',exact:true}).click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);await expect(page.getByRole('button',{name:'选择目的城市',exact:true})).toBeVisible();await chooseShanghai(page);
  await launchRoute(page);await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','flight');await page.reload();await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','flight');
  await page.clock.fastForward(400000);await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','reward');await page.getByRole('button',{name:'查看首航任务',exact:true}).click();
  await page.getByRole('button',{name:'领取奖励',exact:true}).first().click();await page.getByRole('button',{name:'关闭任务中心'}).click();await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','done');
  await page.getByRole('button',{name:'完成引导',exact:true}).click();
  await expect.poll(async () => (await savedTutorial(page)).tutorial).toBe('completed');
  await expect(page.getByTestId('tutorial')).toHaveCount(0);const credits=await page.getByTestId('credits').textContent();
  await page.reload();await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await expect(page.getByTestId('credits')).toHaveText(credits!);
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  expect((await savedTutorial(page)).tutorial).toBe('completed');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('narrow landscape personnel controls and skip remain reachable',async({page})=>{
  await page.setViewportSize({width:667,height:375});await ready(page);await secondPlane(page);await page.getByRole('button',{name:'雇用随航调度员',exact:true}).click();await expect(page.getByTestId('crew-status')).toContainText('已雇用');
  page.once('dialog',d=>void d.accept());await page.getByRole('button',{name:'人员下岗',exact:true}).click();await page.getByRole('button',{name:'出售这架飞机',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'出售这架飞机',exact:true})).toBeInViewport();await page.screenshot({path:'artifacts/landscape-personnel.png'});
  await page.getByRole('button',{name:'关闭机队管理'}).click();await openGlobal(page, '操作帮助');await page.getByRole('button',{name:'开始分步引导',exact:true}).click();
  await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step','load');
  await expect.poll(async () => (await savedTutorial(page)).tutorial).toBe('active');
  const previous = await savedTutorial(page);
  await page.getByRole('button',{name:'跳过引导',exact:true}).click();
  // A click schedules an asynchronous save. Read its committed result, not a
  // deliberately suppressed toast, before navigating away or testing absence.
  await expect.poll(() => savedTutorial(page)).toMatchObject({ tutorial: 'skipped', credits: 9550, fleetSize: 2 });
  expect((await savedTutorial(page)).revision).toBeGreaterThan(previous.revision);
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'存档设置',exact:true})).toContainText('已存档');
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.reload();await expect(page.getByTestId('fleet-count')).toHaveText('2 架');
  await expect(page.getByTestId('credits')).toHaveText('¥ 9,550');
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  expect((await savedTutorial(page)).tutorial).toBe('skipped');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
