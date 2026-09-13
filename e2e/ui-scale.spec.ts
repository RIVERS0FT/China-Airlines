import { expect, test, type Page } from '@playwright/test';
import { launchRoute, selectCity } from './dispatch-helpers.js';

async function settings(page: Page) {
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '本地存档与设置', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function chooseScale(page: Page, percent: number) {
  const slider = page.getByRole('slider', { name: 'UI 缩放比例' });
  await slider.focus();
  await slider.press('Home');
  for (let value = 75; value < percent; value += 5) await slider.press('ArrowRight');
  await expect(page.getByTestId('ui-scale-value')).toHaveText(`${percent}%`);
  await expect(page.getByTestId('game-viewport')).toHaveAttribute('data-ui-scale', String(percent / 100));
  await expect(slider).toBeFocused();
}

for (const viewport of [{ width: 640, height: 360 }, { width: 768, height: 576 }, { width: 1440, height: 900 }]) {
  test(`UI scaling is live, bounded, persistent and does not change the manifest: ${viewport.width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.getByTestId('waiting-order').first().click();
    await expect(page.getByTestId('loaded-order')).toHaveCount(1);
    const order = await page.getByTestId('loaded-order').getAttribute('data-order-id');
    const credits = await page.getByTestId('credits').textContent();
    await page.getByTestId('plane-art').evaluate(el => el.setAttribute('data-same-node', 'yes'));
    const dialog = await settings(page);
    const close = page.getByRole('button', { name: '关闭存档设置', exact: true });
    await chooseScale(page, 75);
    const small = (await close.boundingBox())!;
    await expect(page.getByRole('button', { name: '缩小界面', exact: true })).toBeDisabled();
    await chooseScale(page, 150);
    const large = (await close.boundingBox())!;
    expect(large.width / small.width).toBeCloseTo(2, 2);
    expect(large.height / small.height).toBeCloseTo(2, 2);
    await expect(page.getByRole('button', { name: '放大界面', exact: true })).toBeDisabled();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(close).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `artifacts/ui-scale-${viewport.width}-150-settings.png` });
    await chooseScale(page, 125);
    await expect(page.getByTestId('plane-art')).toHaveAttribute('data-same-node', 'yes');
    await close.click();
    await expect(page.getByRole('button', { name: '存档设置', exact: true })).toBeFocused();
    await expect(page.getByTestId('loaded-order')).toHaveAttribute('data-order-id', order!);
    await expect(page.getByTestId('credits')).toHaveText(credits!);
    // Required controls must be fully inside the viewport, not just clipped by overflow:hidden.
    for (const button of await page.locator('.game-dock button').all()) await expect(button).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `artifacts/ui-scale-${viewport.width}-125-airport.png` });
    await page.reload();
    await expect(page.getByTestId('game-viewport')).toHaveAttribute('data-ui-scale', '1.25');
    await expect(page.getByTestId('loaded-order')).toHaveAttribute('data-order-id', order!);
    await expect(page.getByTestId('credits')).toHaveText(credits!);
    await settings(page);
    await page.getByRole('button', { name: '缩小界面', exact: true }).click();
    await expect(page.getByTestId('ui-scale-value')).toHaveText('120%');
    await page.getByRole('button', { name: '放大界面', exact: true }).click();
    await expect(page.getByTestId('ui-scale-value')).toHaveText('125%');
    await page.getByRole('button', { name: '恢复默认缩放', exact: true }).click();
    await expect(page.getByTestId('ui-scale-value')).toHaveText('100%');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByTestId('game-viewport')).toHaveAttribute('data-ui-scale', '1');
    expect(errors).toEqual([]);
  });
}

test('150% UI supports loading, dispatch, route details and saved flight on small landscape', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('./');
  await settings(page); await chooseScale(page, 150);
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  for (const button of await page.locator('.game-dock button').all()) await expect(button).toBeInViewport({ ratio: 1 });
  await page.getByTestId('waiting-order').first().click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  await page.getByTestId('loaded-order').click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(0);
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 3 / 3 人');
  await page.getByRole('button', { name: '航线地图', exact: true }).click();
  await page.getByRole('button', { name: '关闭选路提示', exact: true }).click();
  await selectCity(page, 'PVG');
  const host = page.getByTestId('map-canvas');
  await expect(host).toHaveAttribute('data-preview-path', 'PVG');
  await expect(host).toHaveAttribute('data-renderer', 'ready');
  const camera = JSON.parse((await host.getAttribute('data-camera'))!) as { scale: number };
  expect(camera.scale).toBe(1);
  await page.getByRole('button', { name: '查看路线', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '路线详情', exact: true })).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '查看路线', exact: true })).toBeFocused();
  await expect(page.getByTestId('dispatch')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'artifacts/ui-scale-667-150-dispatch.png' });
  await launchRoute(page);
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await page.reload();
  await expect(page.locator('.aviation-stage.is-flying')).toBeVisible();
  await expect(page.getByTestId('game-viewport')).toHaveAttribute('data-ui-scale', '1.5');
});

test('blocked preference storage leaves live scaling usable without breaking saves', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'china-airlines.ui-scale.v1') throw new DOMException('Blocked', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.goto('./');
  await settings(page); await chooseScale(page, 125);
  await expect(page.getByText('浏览器未允许保存设置，当前缩放仅本次打开有效。')).toBeVisible();
  await page.getByRole('button', { name: '立即保存', exact: true }).click();
  await expect(page.getByText('进度已保存在此浏览器', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('game-viewport')).toHaveAttribute('data-ui-scale', '1');
  await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
});
