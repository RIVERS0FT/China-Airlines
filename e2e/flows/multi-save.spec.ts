import { test, expect, exportCompany, buyFirstAircraft } from '../helpers/new-company.js';
import type { Page } from '@playwright/test';

async function createCompany(page: Page, name: string, logo = '远翼') {
  await page.getByRole('button', { name: '新游戏', exact: true }).click();
  await page.getByLabel('公司名称', { exact: true }).fill(name);
  await page.getByRole('button', { name: logo, exact: true }).click();
  await page.getByRole('button', { name: '创建公司并启航', exact: true }).click();
  await expect(page.getByTestId('company-name')).toHaveText(name);
}
async function title(page: Page) {
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByRole('button', { name: '保存并返回开始界面', exact: true }).click();
  await expect(page.getByTestId('start-screen')).toBeVisible();
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 667, height: 375 }]) {
  test(`independent companies switch, continue and resume offline at ${viewport.width}`, async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expect(page.getByRole('button', { name: '继续游戏', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '新游戏', exact: true })).toBeFocused();
    for (const label of ['继续游戏', '新游戏', '载入存档']) {
      const rect = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    await createCompany(page, '云翼航空');
    await buyFirstAircraft(page);
    await page.getByRole('button', { name: '跳过引导', exact: true }).click();
    const first = await exportCompany(page);
    expect(first.credits).toBe(3600);
    expect(first.fleet).toHaveLength(1);
    await title(page);
    await createCompany(page, '朝阳航空', '朝阳');
    const second = await exportCompany(page);
    expect(second.credits).toBe(8400);
    expect(second.fleet).toHaveLength(0);
    expect(second.company).not.toEqual(first.company);
    await title(page);
    await page.screenshot({ path: `artifacts/multi-save-title-${viewport.width}.png` });
    await page.getByRole('button', { name: '载入存档', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '载入存档', exact: true });
    await expect(dialog.getByTestId('save-slot')).toHaveCount(2);
    await expect(dialog.getByRole('button', { name: '载入云翼航空', exact: true })).toBeInViewport({ ratio: 1 });
    expect((await dialog.getByRole('button', { name: '载入云翼航空', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `artifacts/multi-save-${viewport.width}.png` });
    await dialog.getByRole('button', { name: '载入云翼航空', exact: true }).click();
    const restored = await exportCompany(page);
    expect(restored.company).toEqual(first.company);
    expect(restored.credits).toBe(first.credits);
    expect(restored.fleet).toEqual(first.fleet);
    expect(restored.airports).toEqual(first.airports);
    await expect(page.getByTestId('tutorial')).toHaveCount(0);
    await title(page);
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await expect(page.getByTestId('company-name')).toHaveText('云翼航空');
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByTestId('company-name')).toHaveText('云翼航空');
      await title(page);
      await page.getByRole('button', { name: '载入存档', exact: true }).click();
      await page.getByRole('button', { name: '载入朝阳航空', exact: true }).click();
      expect((await exportCompany(page)).company).toEqual(second.company);
      await expect(page.getByTestId('tutorial')).toHaveAttribute('data-step', 'unlock');
    } finally { await context.setOffline(false); }
  });
}

test('full slots require confirmed deletion and file import creates an independent save', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('./');
  await createCompany(page, '公司1');
  const exported = await exportCompany(page);
  await title(page);
  for (let n = 2; n <= 5; n++) { await createCompany(page, `公司${n}`); await title(page); }
  await expect(page.getByRole('button', { name: '新游戏', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '载入存档', exact: true }).click();
  await expect(page.getByTestId('save-slot')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '导入存档', exact: true })).toBeDisabled();
  page.once('dialog', dialog => void dialog.dismiss());
  await page.getByRole('button', { name: '删除公司1', exact: true }).click();
  await expect(page.getByTestId('save-slot')).toHaveCount(5);
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '删除公司1', exact: true }).click();
  await expect(page.getByTestId('save-slot')).toHaveCount(4);
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('无法解析');
  await expect(page.getByTestId('save-slot')).toHaveCount(4);
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'company.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.getByTestId('company-name')).toHaveText('公司1');
  await title(page);
  await page.reload();
  await page.getByRole('button', { name: '载入存档', exact: true }).click();
  await expect(page.getByTestId('save-slot')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '载入公司5', exact: true })).toBeEnabled();
});

test('English save picker keeps keyboard dismissal and portrait guidance', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('./');
  await createCompany(page, 'English Air');
  await title(page);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Game', exact: true });
  await expect(dialog.getByRole('button', { name: 'Load English Air', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(page.locator('.save-picker-rotate')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Load English Air', exact: true })).toBeHidden();
  await page.setViewportSize({ width: 667, height: 375 });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load Game', exact: true })).toBeFocused();
});

test('separate tabs stay pinned to their own company after another company becomes recent', async ({ page, context }) => {
  await page.goto('./');
  await createCompany(page, '甲航空');
  const other = await context.newPage();
  await other.goto('./');
  await createCompany(other, '乙航空');
  await page.reload();
  await expect(page.getByTestId('company-name')).toHaveText('甲航空');
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  await page.getByRole('button', { name: '立即保存', exact: true }).click();
  await expect(page.locator('.blocking-screen')).toHaveCount(0);
  await other.reload();
  await expect(other.getByTestId('company-name')).toHaveText('乙航空');
  await expect(other.locator('.blocking-screen')).toHaveCount(0);
  await other.close();
});
