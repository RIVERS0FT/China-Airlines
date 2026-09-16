import { test, expect } from './fixture.js';

const workPages = [[2,'airports'],[3,'fleet'],[4,'shop'],[5,'organization'],[6,'career']] as const;
const cases = [
  {width:1280,height:720,zoom:100,locale:'zh-CN'},
  {width:640,height:360,zoom:100,locale:'zh-CN'},
  {width:844,height:390,zoom:150,locale:'en-US'},
  {width:667,height:375,zoom:75,locale:'zh-CN'},
  {width:667,height:375,zoom:125,locale:'zh-CN'},
];
for (const config of cases) test(`shared workspaces stay usable ${config.width}/${config.zoom}/${config.locale}`, async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.setViewportSize(config);
  await page.addInitScript(({zoom,locale}) => {
    localStorage.setItem('china-airlines:ui-scale:v1',String(zoom));
    localStorage.setItem('china-airlines:locale:v1',locale);
  },config);
  await page.clock.setFixedTime(new Date('2026-09-16T00:00:00Z'));
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText(config.locale === 'zh-CN' ? '1 架' : '1 aircraft');
  const credits = await page.getByTestId('credits').textContent();
  const buttons = page.locator('.game-dock > button:not(.depart-button)');
  for (const [index,name] of workPages) {
    await buttons.nth(index).click();
    const frame = page.getByTestId(`page-${name}`);
    await expect(frame).toBeVisible();
    expect(await frame.evaluate(el => el.tagName)).toBe('MAIN');
    await expect(page.locator('.ui-page')).toHaveCount(1);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('.game-dock [aria-current="page"]')).toHaveCount(1);
    await expect(buttons.nth(index)).toHaveAttribute('aria-current','page');
    for (const button of await buttons.all()) await expect(button).toBeInViewport();
    const body = (await frame.boundingBox())!, dock = (await page.locator('.game-dock').boundingBox())!;
    expect(body.y + body.height).toBeLessThanOrEqual(dock.y + 1);
    expect(body.height).toBeGreaterThan(100);
    expect(await frame.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (name !== 'organization') {
      const header = frame.locator('.ui-page-header');
      await expect(header).toBeInViewport();
      const before = (await header.boundingBox())!;
      const scroll = frame.locator('.ui-scroll-region');
      await expect(scroll).toHaveCount(1);
      expect(await scroll.evaluate(el => el.clientHeight)).toBeGreaterThan(50);
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
      const after = (await header.boundingBox())!;
      expect(after.y).toBeCloseTo(before.y,1);
      await expect(header.locator('button')).toBeInViewport();
      await scroll.evaluate(el => { el.scrollTop = 0; });
    }
    await page.screenshot({path:`artifacts/workspace-${name}-${config.width}-${config.zoom}-${config.locale}.png`});
    await expect(page.getByTestId('credits')).toHaveText(credits!);
  }
  // Temporary overlays use native focus containment without replacing the page.
  const settingsButton = page.locator('.game-hud > button').last();
  await settingsButton.click();
  const settings = page.locator('dialog.ui-dialog.settings-modal');
  await expect(settings).toBeVisible();
  await expect(settings.locator('.ui-dialog-header')).toBeInViewport();
  const box = (await settings.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x+box.width).toBeLessThanOrEqual(config.width+1);
  expect(box.y+box.height).toBeLessThanOrEqual(config.height+1);
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(settingsButton).toBeFocused();
  await expect(page.getByTestId('page-career')).toBeVisible();
  expect(errors).toEqual([]);
});

test('work page switches preserve fleet tabs and shop category without keeping hidden work DOM',async({page}) => {
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const nav = page.locator('.game-dock');
  await nav.getByRole('button',{name:'机队管理',exact:true}).click();
  await page.getByRole('tab',{name:'航班',exact:true}).click();
  await nav.getByRole('button',{name:'飞机商店',exact:true}).click();
  await page.getByRole('button',{name:'全部机型',exact:true}).click();
  await expect(page.getByTestId('page-fleet')).toHaveCount(0);
  await nav.getByRole('button',{name:'机队管理',exact:true}).click();
  await expect(page.getByRole('tab',{name:'航班',exact:true})).toHaveAttribute('aria-selected','true');
  await nav.getByRole('button',{name:'飞机商店',exact:true}).click();
  await expect(page.getByRole('button',{name:'全部机型',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('shop-aircraft')).toHaveCount(13);
  const da40 = page.getByTestId('shop-aircraft').filter({ has: page.getByRole('heading', { name: '钻石 DA40', exact: true }) });
  await expect(da40).toHaveCount(1);
  await expect(da40.locator('.aircraft-reference')).toContainText('Diamond DA40 NG');
  await expect(page.getByTestId('page-fleet')).toHaveCount(0);
});
