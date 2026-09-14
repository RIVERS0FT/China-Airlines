import { openGlobal } from './dispatch-helpers.js';
import { test, expect } from './fixture.js';

test('Chinese help explains the complete first-flight loop and uses the ticket icon', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  const ticket = page.getByTestId('tickets-resource');
  await expect(ticket.locator('img.painted-icon')).toHaveAttribute('src', /icon-ticket-v2\.png$/);

  await openGlobal(page, '操作帮助');
  const dialog = page.getByRole('dialog', { name: '起航指南', exact: true });
  for (const heading of ['首航三步', '快速开始', '球面地图', '经营入口', '资源与结算'])
    await expect(dialog.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(dialog).toContainText('最终目的地');
  await expect(dialog).toContainText('路线预览只读');
  await expect(dialog).toContainText('离线最多补算 8 小时');
  await expect(dialog.getByRole('button', { name: '开始分步引导', exact: true })).toBeEnabled();
  expect(await dialog.locator('.help-content').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/help-content-844.png' });
});

test('English help displays English headings only', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('china-airlines:locale:v1', 'en-US'));
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 aircraft');
  await openGlobal(page, 'Help');
  const dialog = page.getByRole('dialog', { name: 'Flight Guide', exact: true });
  for (const heading of ['Your first flight in three steps', 'Quick Start', 'Globe Map', 'Operations', 'Resources & Settlement'])
    await expect(dialog.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/首航|快速开始|球面地图|经营入口|资源与结算/);
});
