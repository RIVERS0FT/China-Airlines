import { expect, test, type Page } from '@playwright/test';

const NOW = Date.parse('2026-09-13T02:00:00Z');

async function start(page: Page) {
  await page.clock.install({ time: new Date(NOW) });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`career opens only from the bottom navigation at ${viewport.width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await start(page);

    const hud = page.locator('.game-hud');
    const dock = page.getByRole('navigation', { name: '主导航' });
    const entry = dock.getByRole('button', { name: '经营中心', exact: true });
    const tickets = page.getByTestId('tickets-resource');
    const count = page.getByTestId('tickets-count');
    const dialog = page.getByRole('dialog', { name: '公司经营中心', exact: true });
    const balance = await count.innerText();
    const credits = await page.getByTestId('credits').innerText();

    await expect(hud.getByRole('button', { name: /经营中心|点券/ })).toHaveCount(0);
    await expect(hud.getByTestId('tickets-resource')).toHaveCount(1);
    await expect(tickets.locator('small')).toHaveText('点券');
    await expect(count).toHaveText(/^\d+ 券$/);
    expect(await tickets.evaluate(element => ({
      tag: element.tagName,
      tabIndex: (element as HTMLElement).tabIndex,
      interactive: Boolean(element.closest('button, a, [role="button"]')),
    }))).toEqual({ tag: 'DIV', tabIndex: -1, interactive: false });
    await tickets.hover();
    expect(await tickets.evaluate(element => getComputedStyle(element).cursor)).not.toBe('pointer');
    await count.click();
    await expect(dialog).toHaveCount(0);
    await expect(count).toHaveText(balance);
    await expect(page.getByTestId('credits')).toHaveText(credits);

    await expect(dock.locator(':scope > button > span')).toHaveText([
      '机场装载', '地图', '机场目录', '机队管理', '飞机商店', '经营中心', '制定路线',
    ]);
    await expect(entry).toBeEnabled();
    await expect(entry).toBeInViewport();
    await expect(entry).toHaveAttribute('aria-haspopup', 'dialog');
    const shop = await dock.getByRole('button', { name: '飞机商店', exact: true }).boundingBox();
    const career = await entry.boundingBox();
    const route = await dock.getByRole('button', { name: '制定路线', exact: true }).boundingBox();
    expect(shop).not.toBeNull();
    expect(career).not.toBeNull();
    expect(route).not.toBeNull();
    expect(career!.x).toBeGreaterThanOrEqual(shop!.x + shop!.width - 1);
    expect(career!.x + career!.width).toBeLessThanOrEqual(route!.x + 1);
    expect(route!.x + route!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await entry.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: '物流园', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '关闭公司经营中心', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(count).toHaveText(balance);
    await expect(page.getByTestId('credits')).toHaveText(credits);
    await page.screenshot({ path: `artifacts/career-navigation-${viewport.width}.png` });

    await page.reload();
    await expect(entry).toBeVisible();
    await expect(count).toHaveText(balance);
    await expect(hud.getByRole('button', { name: /经营中心|点券/ })).toHaveCount(0);
    await entry.click();
    await expect(dialog).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('career navigation supports keyboard activation while ticket balance is skipped', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page);
  await page.getByRole('button', { name: '机队管理概览', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '操作帮助', exact: true })).toBeFocused();

  const dock = page.getByRole('navigation', { name: '主导航' });
  const entry = dock.getByRole('button', { name: '经营中心', exact: true });
  const dialog = page.getByRole('dialog', { name: '公司经营中心', exact: true });
  for (const key of ['Enter', 'Space']) {
    await dock.getByRole('button', { name: '飞机商店', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(entry).toBeFocused();
    await page.keyboard.press(key);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '关闭公司经营中心', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
