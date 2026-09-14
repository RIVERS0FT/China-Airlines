import { test, expect } from './fixture.js';
import { readFile } from 'node:fs/promises';
import type { GameState } from '../src/core/game.js';
import { GameCore as V7Core } from '../src/core/v7/game.js';
import { openGlobal } from './dispatch-helpers.js';

const NOW = Date.parse('2026-09-14T02:00:00Z');
for (const [width, height] of [[1440, 900], [667, 375]] as const) {
  test(`legacy blank names remain selectable and round-trip offline at ${width}`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.clock.install({ time: new Date(NOW) });
    const old = new V7Core(NOW);
    for (let i = 0; i < 2; i++) old.execute({ type: 'recruit-pilot' }, NOW);
    old.execute({ type: 'assign-pilot', pilotId: 1, planeId: 'AC0001' }, NOW);
    for (let i = 0; i < 2; i++) old.execute({ type: 'train-pilot', pilotId: 2 }, NOW);
    const saved = old.snapshot(), names = ['\t \n', '\u3000'];
    saved.career.pilots.forEach((pilot, i) => { pilot.name = names[i]!; });
    await page.goto('./');
    await expect(page.getByTestId('fleet-count')).toHaveText('1 架');
    await openGlobal(page, '存档设置');
    page.once('dialog', dialog => void dialog.accept());
    await page.getByLabel('选择存档文件').setInputFiles({
      name: 'legacy-blank-names.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
    });
    await expect(page.locator('.settings-modal')).toContainText('存档导入成功');
    await page.getByRole('button', { name: '关闭存档设置' }).click();
    const openOrganization = async () => {
      await openGlobal(page, '公司组织');
      await expect(page.getByRole('dialog', { name: '公司组织', exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: '公司组织架构树', exact: true })).toBeVisible();
    };
    await openOrganization();
    const detail = page.getByRole('complementary', { name: '员工详情' });
    await page.getByRole('button', { name: '查看员工 #2 · 飞行员', exact: true }).click();
    await expect(detail.getByRole('heading', { name: '员工 #2', exact: true })).toBeVisible();
    await detail.getByRole('button', { name: /^管理培训/ }).click();
    page.once('dialog', dialog => void dialog.accept());
    await detail.getByRole('button', { name: '晋升部门经理', exact: true }).click();
    await expect(page.getByRole('button', { name: '查看员工 #2 · 飞行部经理', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看员工 #1 · 飞行员', exact: true }).click();
    await expect(page.getByLabel('员工 #1岗位', { exact: true })).toHaveValue('AC0001');
    await page.getByLabel('员工 #1直属上级', { exact: true }).selectOption('2');
    await expect(page.getByRole('option', { name: '员工 #2 · 飞行部经理', exact: true })).toHaveCount(1);
    await expect(detail).toContainText('员工 #2的管理效果生效');
    await page.screenshot({ path: `artifacts/company-organization-legacy-names-${width}.png` });

    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await openOrganization();
    await page.getByRole('button', { name: '查看员工 #1 · 飞行员', exact: true }).click();
    await expect(page.getByLabel('员工 #1直属上级', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('员工 #1岗位', { exact: true })).toHaveValue('AC0001');
    await page.getByRole('button', { name: '关闭公司组织' }).click();
    await openGlobal(page, '存档设置');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出存档', exact: true }).click();
    const download = await pending;
    const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as GameState;
    expect(exported.version).toBe(8);
    expect(exported.career.employees.map(employee => employee.name)).toEqual(names);
    expect(exported.career.employees.map(employee => employee.id)).toEqual([1, 2]);
    expect(exported.career.employees[0]!.planeId).toBe('AC0001');
    expect(exported.career.employees[0]!.managerId).toBe(2);
    expect(exported.career.employees[1]!.role).toBe('manager');
    expect(errors).toEqual([]);
  });
}
