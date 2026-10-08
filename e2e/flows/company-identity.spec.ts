import { test, expect, exportCompany } from '../helpers/new-company.js';
import type { Page } from '@playwright/test';

async function setup(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: '新游戏', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '创建航空公司', exact: true })).toBeVisible();
}
async function create(page: Page) {
  await page.getByRole('button', { name: '创建公司并启航', exact: true }).click();
  await expect(page.getByTestId('company-name')).toBeVisible();
}
async function imageFile(page: Page, type = 'image/png', width = 64) {
  const data = await page.evaluate(({ type, width }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 32;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#135d9a'; ctx.fillRect(0, 0, width / 2, 32);
    ctx.fillStyle = '#d8ad50'; ctx.fillRect(width / 2, 0, width / 2, 32);
    return canvas.toDataURL(type).split(',')[1]!;
  }, { type, width });
  return { name: 'my-airline', mimeType: type, buffer: Buffer.from(data, 'base64') };
}

for (const width of [1440, 667]) test(`company name and preset logo remain visible after navigation and reload at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 375 });
  await setup(page);
  const name = '云海国际航空公司 Cloud Air';
  await expect(page.getByLabel('公司名称', { exact: true })).toBeFocused();
  await page.getByLabel('公司名称', { exact: true }).fill(`  ${name}  `);
  await page.getByRole('button', { name: '环宇', exact: true }).click();
  await expect(page.getByRole('button', { name: '环宇', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '创建公司并启航', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: '上传自定义图片', exact: true })).toBeInViewport({ ratio: 1 });
  for (const locator of [page.getByLabel('公司名称', { exact: true }), page.getByRole('button', { name: '环宇', exact: true }), page.getByRole('button', { name: '创建公司并启航', exact: true })]) {
    const bounds = (await locator.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `artifacts/company-setup-${width}.png` });
  await create(page);
  await expect(page.getByTestId('company-name')).toHaveText(name);
  await expect(page.getByTestId('company-name')).toHaveAttribute('title', name);
  await expect(page.getByTestId('company-brand').locator('[data-logo-id="orbit"]')).toBeVisible();
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.getByRole('button', { name: '飞机商店', exact: true }).click();
  await expect(page.getByTestId('company-brand')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const branding = await page.getByTestId('company-brand').boundingBox();
  const credits = await page.locator('.game-hud > .resource').first().boundingBox();
  expect(branding!.x + branding!.width).toBeLessThanOrEqual(credits!.x);
  await page.screenshot({ path: `artifacts/company-hud-${width}.png` });
  const saved = await exportCompany(page);
  expect(saved.company).toEqual({ name, logo: { kind: 'preset', id: 'orbit' } });
  expect(saved.credits).toBe(8400);
  await page.reload();
  await expect(page.getByTestId('company-name')).toHaveText(name);
  await expect(page.getByRole('dialog', { name: '创建航空公司', exact: true })).toHaveCount(0);
  if (width === 1440) {
    await page.getByRole('button', { name: '存档设置', exact: true }).click();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Close save settings', exact: true }).click();
    await expect(page.getByTestId('company-name')).toHaveText(name);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByTestId('company-name')).toHaveText(name);
    await expect(page.getByRole('dialog', { name: 'Create Your Airline', exact: true })).toHaveCount(0);
  }
});

test('custom PNG, JPEG and WebP normalize locally and survive import and offline start', async ({ page, context }) => {
  const writes: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  await setup(page);
  await page.getByLabel('公司名称', { exact: true }).fill('自定义航空');
  for (const type of ['image/jpeg', 'image/webp', 'image/png']) {
    await page.getByLabel('选择公司 Logo 图片').setInputFiles(await imageFile(page, type));
    await expect(page.locator('.company-preview img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(page.getByRole('button', { name: '创建公司并启航', exact: true })).toBeEnabled();
  }
  await create(page);
  const logo = page.getByTestId('company-brand').locator('img');
  const stored = await logo.getAttribute('src');
  expect(await logo.evaluate((node: HTMLImageElement) => ({ width: node.naturalWidth, height: node.naturalHeight }))).toEqual({ width: 128, height: 128 });
  expect(await logo.evaluate((node: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(node, 0, 0);
    return [ctx.getImageData(64, 0, 1, 1).data[3], ctx.getImageData(64, 64, 1, 1).data[3]];
  })).toEqual([0, 255]);
  const saved = await exportCompany(page);
  expect(saved.company).toEqual({ name: '自定义航空', logo: { kind: 'custom', data: stored } });
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'my-company.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByRole('status').filter({ hasText: '存档导入成功' })).toBeVisible();
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('company-name')).toHaveText('自定义航空');
  await expect(logo).toHaveAttribute('src', stored!);
  await expect.poll(() => logo.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth === 128)).toBe(true);
  expect(writes).toEqual([]);
});

test('invalid names and image files preserve the selected logo and allow correction', async ({ page }) => {
  await setup(page);
  await page.getByLabel('公司名称', { exact: true }).fill('   ');
  await page.getByRole('button', { name: '创建公司并启航', exact: true }).click();
  await expect(page.getByLabel('公司名称', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('公司名称', { exact: true }).fill('航'.repeat(25));
  await page.getByRole('button', { name: '创建公司并启航', exact: true }).click();
  await expect(page.getByLabel('公司名称', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  const files = [
    { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') },
    { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
    await imageFile(page, 'image/png', 4097),
  ];
  for (const file of files) {
    await page.getByLabel('选择公司 Logo 图片').setInputFiles(file);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.company-preview [data-logo-id="wing"]')).toBeVisible();
  }
  await page.getByLabel('公司名称', { exact: true }).fill('Valid Air');
  await page.getByRole('button', { name: '朝阳', exact: true }).click();
  await create(page);
  await expect(page.getByTestId('company-name')).toHaveText('Valid Air');
});

test('new game keeps the old company, cancellation preserves it and import restores identity', async ({ page }) => {
  await setup(page);
  await page.getByLabel('公司名称', { exact: true }).fill('原公司');
  await create(page);
  const before = await exportCompany(page);
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByRole('button', { name: '保存并返回开始界面', exact: true }).click();
  await page.getByRole('button', { name: '新游戏', exact: true }).click();
  await page.getByLabel('公司名称', { exact: true }).fill('取消的公司');
  await page.getByRole('button', { name: '取消创建公司', exact: true }).click();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  expect((await exportCompany(page)).company).toEqual(before.company);
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByRole('button', { name: '保存并返回开始界面', exact: true }).click();
  await page.getByRole('button', { name: '新游戏', exact: true }).click();
  await page.getByLabel('公司名称', { exact: true }).fill('新公司');
  await page.getByRole('button', { name: '飞羽', exact: true }).click();
  await create(page);
  await expect(page.getByTestId('company-name')).toHaveText('新公司');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'old-company.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
  await expect(page.getByTestId('company-name')).toHaveText('原公司');
});

test('a failed disk write does not create an in-memory company or skip setup after refresh', async ({ page }) => {
  await setup(page);
  await page.getByLabel('公司名称', { exact: true }).fill('写入失败');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.name === 'saves' && value.state?.company) throw new DOMException('Company save failed', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: '创建公司并启航', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '创建航空公司' }).getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('company-brand')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '新游戏', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '创建航空公司', exact: true })).toBeVisible();
  await create(page);
});

test('creation keeps keyboard focus and draft through rotation and honours physical touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  await page.getByLabel('公司名称', { exact: true }).fill('键盘航空');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '远翼', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: '朝阳', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(page.locator('.company-setup-rotate')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建公司并启航', exact: true })).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByLabel('公司名称', { exact: true })).toHaveValue('键盘航空');
  await expect(page.getByRole('button', { name: '创建公司并启航', exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'artifacts/company-setup-844.png' });
  await page.getByLabel('公司名称', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('company-name')).toHaveText('键盘航空');
});
