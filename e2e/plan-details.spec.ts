import { test, expect, type Page } from '@playwright/test';
import { airport } from '../src/core/catalog.js';
import { mapLayout } from '../src/ui/map-camera.js';

async function openMap(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
  await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-renderer', 'ready');
}
async function clickCity(page: Page, id: string) {
  const host = page.getByTestId('map-canvas'), box = await host.boundingBox();
  if (!box) throw new Error('map canvas has no layout box');
  const focusId = await page.getByLabel('选择机场', { exact: true }).inputValue();
  const focus = airport(focusId), target = airport(id), layout = mapLayout(box.width, box.height, focus);
  const margin = Math.min(60, box.height / 3), scale = layout.scale;
  const x0 = Math.max(margin - 960 * scale, Math.min(box.width - margin, layout.x));
  const y0 = Math.max(margin - 630 * scale, Math.min(box.height - margin, layout.y));
  const x = x0 + target.x * scale, y = y0 + target.y * scale;
  await host.locator('canvas').click({ position: { x, y } });
  await expect(page.getByLabel('选择机场', { exact: true })).toHaveValue(id);
}

test('route is built only by city selection order, with no single/multi or route-unlock mode', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMap(page);
  await expect(page.getByRole('button', { name: '单段派航', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '多段计划', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /开通航线|开通计划航线/ })).toHaveCount(0);

  await clickCity(page, 'WUH');
  await page.getByRole('button', { name: /解锁机场/ }).click();
  await expect(page.getByTestId('route-preview')).toHaveAttribute('data-legs', '1');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH');

  await clickCity(page, 'PEK');
  await clickCity(page, 'PVG');
  await expect(page.getByTestId('route-preview')).toHaveAttribute('data-legs', '3');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH,PEK,PVG');
  await expect(page.getByTestId('plan-leg')).toHaveCount(3);
  await expect(page.getByTestId('plan-summary')).toContainText('3 段');
  await expect(page.getByRole('columnheader', { name: '航线建设', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '撤销末站', exact: true }).click();
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH,PEK');
  await page.getByLabel('选择机场', { exact: true }).selectOption('PVG');
  await expect(page.getByTestId('map-canvas')).toHaveAttribute('data-preview-path', 'WUH,PEK,PVG');

  page.once('dialog', dialog => void dialog.accept());
  await page.getByTestId('dispatch').click();
  await expect(page.getByTestId('active-plan')).toContainText('北京 → 上海');
});

test('short landscape keeps the same ordered route editor without mode buttons', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openMap(page);
  await page.getByLabel('选择机场', { exact: true }).selectOption('PVG');
  await expect(page.getByTestId('route-preview')).toHaveAttribute('data-legs', '1');
  await expect(page.getByTestId('dispatch')).toBeVisible();
  await expect(page.getByRole('button', { name: '单段派航', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '多段计划', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /开通航线|开通计划航线/ })).toHaveCount(0);
  await page.getByRole('button', { name: '清空路线', exact: true }).click();
  await expect(page.getByTestId('route-preview')).toHaveAttribute('data-legs', '0');
});
