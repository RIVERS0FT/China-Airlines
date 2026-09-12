import { expect, type Page } from '@playwright/test';

/** Exercise the new visible entry points, never force-click a hidden legacy control. */
export async function closeRouteDetails(page: Page) {
  const dialog = page.getByRole('dialog', { name: '路线详情', exact: true });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: '关闭路线详情', exact: true }).click();
}
export async function openCities(page: Page) {
  await closeRouteDetails(page);
  if (!await page.getByRole('dialog', { name: '选择城市', exact: true }).isVisible())
    await page.getByRole('button', { name: '选择目的城市', exact: true }).click();
}
export async function selectCity(page: Page, id: string) {
  await openCities(page);
  await page.getByLabel('选择机场', { exact: true }).selectOption(id);
  await expect(page.getByRole('dialog', { name: '选择城市', exact: true })).toHaveCount(0);
}
export async function inspectCity(page: Page, name: string) {
  await openCities(page);
  await page.getByRole('button', { name, exact: true }).click();
}
export async function routeDetails(page: Page) {
  const dialog = page.getByRole('dialog', { name: '路线详情', exact: true });
  if (!await dialog.isVisible()) await page.getByRole('button', { name: '查看路线', exact: true }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function detailValue(page: Page, id: string) {
  await routeDetails(page);
  return page.getByTestId(id);
}
export async function launchRoute(page: Page) {
  await closeRouteDetails(page);
  await page.getByTestId('dispatch').click();
  // A click starts an async save; navigation follows only its successful result.
  await expect(page.locator('.route-dispatch-view')).toHaveCount(0);
  await expect(page.locator('.game-hud')).toBeVisible();
}
export async function leaveMap(page: Page) {
  await closeRouteDetails(page);
  if (await page.locator('.route-dispatch-view').isVisible()) {
    const back = page.getByRole('button', { name: /^(取消起飞|返回航班)$/, exact: true });
    await back.click();
  }
}
export async function openGlobal(page: Page, name: string) {
  await leaveMap(page);
  await page.getByRole('button', { name, exact: true }).click();
}
