import { expect, type Page } from './fixture.js';
import { readFile } from 'node:fs/promises';
/** Clock must be paused by caller; compare the complete exported current game. */
export async function rejectRetiredSave(page: Page, retired: unknown) {
  await page.getByRole('button', { name: '存档设置', exact: true }).click();
  const exported = async () => {
    const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:'导出存档',exact:true}).click();
    return JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  };
  const before=await exported();
  page.once('dialog',d=>void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({name:'retired.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(retired))});
  await expect(page.getByRole('alert').filter({hasText:'不再支持导入'}).first()).toBeVisible();
  expect(await exported()).toEqual(before);
  await page.getByRole('button',{name:'关闭存档设置',exact:true}).click();
  await page.reload();
  await expect(page.getByTestId('fleet-count')).toHaveText(`${before.fleet.length} 架`);
  await page.getByRole('button',{name:'存档设置',exact:true}).click();
  expect(await exported()).toEqual(before);
  await page.getByRole('button',{name:'关闭存档设置',exact:true}).click();
}
