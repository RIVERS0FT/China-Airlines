import { displayScale } from './display-helpers.js';
import { expect, test, type Page } from '@playwright/test';
import { routeDetails, selectCity } from './dispatch-helpers.js';

async function ready(page: Page) {
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('uxPageErrors', () => errors);
});
test.afterEach(async ({ page }) => {
  if (!page.isClosed()) {
    const errors = await page.evaluate(() => (window as unknown as { uxPageErrors: () => Promise<string[]> }).uxPageErrors());
    expect(errors).toEqual([]);
  }
});

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]] as const) {
  test(`airport query, filter, focus and touch targets survive a detail round-trip at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await ready(page);
    const credits = await page.getByTestId('credits').textContent();
    await page.getByRole('button', { name: '机场目录', exact: true }).click();
    let directory = page.getByRole('dialog', { name: '机场目录', exact: true });
    await directory.getByRole('button', { name: /^全部/ }).click();
    await directory.getByLabel('搜索机场', { exact: true }).fill(' pVg ');
    await expect(directory.getByRole('status')).toContainText('找到 1 座');
    await directory.getByRole('button', { name: '查看上海机场', exact: true }).click();
    await page.getByRole('button', { name: '返回机场目录', exact: true }).click();
    directory = page.getByRole('dialog', { name: '机场目录', exact: true });
    await expect(directory.getByLabel('搜索机场', { exact: true })).toHaveValue(' pVg ');
    await expect(directory.getByRole('button', { name: /^全部/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(directory.getByRole('button', { name: '查看上海机场', exact: true })).toBeFocused();
    await directory.getByRole('button', { name: '清空机场搜索', exact: true }).click();
    await expect(directory.getByLabel('搜索机场', { exact: true })).toBeFocused();
    await expect(directory.getByLabel('搜索机场', { exact: true })).toHaveValue('');
    const targets = directory.locator(':scope > header button, .airport-directory-tools button, .airport-directory-tools input');
    for (const target of await targets.all()) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull(); expect(box!.height).toBeGreaterThanOrEqual(44 * await displayScale(page) - .02);
    }
    expect(await directory.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/browse-ux-airports-${width}.png` });
    await expect(page.getByTestId('credits')).toHaveText(credits!);
  });
}

test('airport empty results offer a reset and reopening preserves the current search', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '机场目录', exact: true }).click();
  let directory = page.getByRole('dialog', { name: '机场目录', exact: true });
  await directory.getByLabel('搜索机场', { exact: true }).fill('不存在的机场');
  await expect(directory.getByRole('status')).toContainText('没有符合条件');
  await directory.getByRole('button', { name: '查看全部机场', exact: true }).click();
  await expect(directory.getByLabel('搜索机场', { exact: true })).toHaveValue('');
  await expect(directory.getByRole('button', { name: /^全部/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(directory.getByRole('listitem').first()).toBeVisible();
  await directory.getByLabel('搜索机场', { exact: true }).fill('PEK');
  // A focused native search field consumes the first Escape to clear its query.
  await page.keyboard.press('Escape');
  await expect(directory.getByLabel('搜索机场', { exact: true })).toHaveValue('');
  await expect(directory).toBeVisible();
  await directory.getByLabel('搜索机场', { exact: true }).fill('PEK');
  // Explicit close must retain the query, unlike the search field's clear action.
  await directory.getByRole('button', { name: '关闭机场目录', exact: true }).click();
  await expect(directory).toHaveCount(0);
  await page.getByRole('button', { name: '机场目录', exact: true }).click();
  directory = page.getByRole('dialog', { name: '机场目录', exact: true });
  await expect(directory.getByLabel('搜索机场', { exact: true })).toHaveValue('PEK');
  await expect(directory.getByRole('listitem')).toHaveCount(1);
  // Escape still closes the dialog when focus is outside the search field.
  await directory.getByRole('button', { name: '关闭机场目录', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(directory).toHaveCount(0);
});

test('airport detail navigation restores the scrolled card instead of jumping to the top', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }); await ready(page);
  await page.getByRole('button', { name: '机场目录', exact: true }).click();
  const directory = page.getByRole('dialog', { name: '机场目录', exact: true });
  await directory.getByRole('button', { name: /^全部/ }).click();
  const last = directory.locator('.airport-card').last();
  const id = await last.getAttribute('data-testid');
  await last.scrollIntoViewIfNeeded();
  const before = await directory.evaluate(el => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  await last.click();
  await page.getByRole('button', { name: '返回机场目录', exact: true }).click();
  await expect(page.getByTestId(id!)).toBeFocused();
  await expect.poll(async () => Math.abs(await directory.evaluate(el => el.scrollTop) - before)).toBeLessThanOrEqual(2);
});

test('fleet search combines with every ground-state filter and recovers from no results', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 }); await ready(page);
  const credits = await page.getByTestId('credits').textContent();
  await page.getByRole('button', { name: '机队管理概览', exact: true }).click();
  const board = page.getByRole('dialog', { name: '机队管理', exact: true });
  await board.getByLabel('搜索飞机', { exact: true }).fill(' ac0001 ');
  await expect(board.getByTestId('flight-row')).toHaveCount(1);
  for (const phase of ['turnaround', 'service', 'automatic', 'planned']) {
    await board.getByLabel('更多运行状态', { exact: true }).selectOption(phase);
    await expect(board.getByTestId('flight-row')).toHaveCount(0);
    await expect(board.getByRole('button', { name: '显示全部飞机', exact: true })).toBeVisible();
  }
  await board.getByRole('button', { name: '显示全部飞机', exact: true }).click();
  await expect(board.getByLabel('搜索飞机', { exact: true })).toHaveValue('');
  await expect(board.getByLabel('搜索飞机', { exact: true })).toBeFocused();
  await expect(board.getByTestId('flight-row')).toHaveCount(1);
  await board.getByLabel('搜索飞机', { exact: true }).fill('PEK');
  await expect(board.getByTestId('flight-row')).toHaveCount(1);
  await board.getByLabel('搜索飞机', { exact: true }).fill('没有这架飞机');
  await expect(board.getByTestId('flight-row')).toHaveCount(0);
  await board.getByRole('button', { name: '清空飞机搜索', exact: true }).click();
  await expect(board.getByTestId('flight-row')).toHaveCount(1);
  expect(await board.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/browse-ux-fleet-667.png' });
  await expect(page.getByTestId('credits')).toHaveText(credits!);
});

test('dispatch backdrop dismisses only deliberate outside clicks and preserves the map draft', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 }); await ready(page);
  await page.getByRole('button', { name: '制定路线', exact: true }).click();
  await selectCity(page, 'PVG');
  const map = page.getByTestId('map-canvas');
  await expect(map).toHaveAttribute('data-preview-path', 'PVG');
  const mapHandle = await map.elementHandle();
  const credits = await page.getByTestId('credits').textContent();
  const dialog = await routeDetails(page);
  // A drag that starts inside the dialog must not be mistaken for a backdrop tap.
  const heading = await dialog.getByRole('heading', { name: '路线详情', exact: true }).boundingBox();
  await page.mouse.move(heading!.x + 10, heading!.y + 10);
  await page.mouse.down(); await page.mouse.move(2, 2, { steps: 5 }); await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看路线', exact: true })).toBeFocused();
  await expect(map).toHaveAttribute('data-preview-path', 'PVG');
  expect(await mapHandle!.evaluate(el => el.isConnected)).toBe(true);
  await routeDetails(page); await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看路线', exact: true })).toBeFocused();
  await expect(map).toHaveAttribute('data-preview-path', 'PVG');
  await expect(page.getByTestId('credits')).toHaveText(credits!);
});
