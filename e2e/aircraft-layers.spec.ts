import { test, expect, type Page } from './fixture.js';
import { GameCore } from '../src/core/game.js';
import { ALL_MODELS } from '../src/core/catalog.js';
import layouts from '../src/ui/aircraft-layer-layouts.json' with { type: 'json' };
import { readFile } from 'node:fs/promises';
const NOW = Date.parse('2026-09-16T00:00:00Z');

async function expectRegistration(page: Page, id: string) {
  const expected = layouts[id as keyof typeof layouts];
  await expect.poll(() => page.getByTestId('plane-art').evaluate((el, layout) => {
    const hull = el.querySelector('.cutaway-airframe')!.getBoundingClientRect();
    const near = el.querySelector('.aircraft-near-layer')!.getBoundingClientRect();
    const cabin = el.querySelector('.cabin-interior')!.getBoundingClientRect();
    const frame = el.getBoundingClientRect(), sx = hull.width / 1536, sy = hull.height / 590;
    const deltas = [Math.abs(sx - sy) * 1536];
    for (const [actual, target] of [[near, layout.nearBounds], [cabin, layout.interior]] as const) {
      deltas.push(Math.abs(actual.x - hull.x - target.x * sx), Math.abs(actual.y - hull.y - target.y * sy),
        Math.abs(actual.width - target.width * sx), Math.abs(actual.height - target.height * sy));
    }
    for (const box of [hull, near]) deltas.push(Math.max(0, frame.x - box.x), Math.max(0, frame.y - box.y),
      Math.max(0, box.right - frame.right), Math.max(0, box.bottom - frame.bottom));
    return hull.width > 0 ? Math.max(...deltas) : Infinity;
  }, expected)).toBeLessThan(.75);
}

for (const model of ALL_MODELS) test(`dedicated layers cover ${model.id} without remounting or changing orders`, async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) }); await page.clock.pauseAt(new Date(NOW + 1000));
  await page.goto('./'); await expect(page.getByTestId('aircraft-cabin')).toBeVisible();
  const s = new GameCore(NOW).snapshot(); s.fleet[0]!.modelId = model.id; s.airports.forEach(a => a.level = 3);
  await page.getByRole('button', { name: '存档设置', exact: true }).click(); page.once('dialog', d => void d.accept());
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'current-aircraft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(s)) });
  await expect(page.getByRole('status').filter({ hasText: '存档导入成功' })).toBeVisible();
  await page.getByRole('button', { name: '关闭存档设置', exact: true }).click();
  await page.getByRole('button', { name: /^同目的地装载：/ }).first().click();
  const frame = page.getByTestId('plane-art'), cabin = page.getByTestId('aircraft-cabin'), near = page.getByTestId('aircraft-near-layer');
  await expect(frame).toHaveAttribute('data-model-id', model.id);
  await expect(frame.locator('.cutaway-airframe')).toHaveAttribute('src', new RegExp(`aircraft-${model.id}-cutaway-v4.png$`));
  await expect(near).toHaveAttribute('src', new RegExp(`aircraft-${model.id}-near-v4.png$`));
  await expect.poll(() => frame.locator('img').evaluateAll(nodes => nodes.every(n => (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await expect(page.locator('.cabin-deck')).toHaveCount(model.seats && model.cargo ? 2 : 1);
  await expect(frame.locator('.cabin-room-wall, .cabin-floor-plane, .cabin-front-rim')).toHaveCount(0);
  await expect(frame.locator(`img[src$="aircraft-${model.id}-cutaway-v4.png"]`)).toHaveCount(1);
  for (const element of await frame.locator('.cabin-interior, .cabin-deck, .cabin-room-floor').all()) {
    await expect(element).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(element).toHaveCSS('background-image', 'none');
    await expect(element).toHaveCSS('border-top-width', '0px');
  }
  await expectRegistration(page, model.id);
  if (model.seats && model.cargo) {
    const top = (await page.getByTestId('cabin-passengers').boundingBox())!, bottom = (await page.getByTestId('cabin-cargo').boundingBox())!;
    expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.height - .5); expect(bottom.x).toBeCloseTo(top.x, 0);
  }
  const ids = await cabin.getByTestId('loaded-order').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-order-id')));
  await cabin.evaluate(n => n.setAttribute('data-mount-marker', 'kept'));
  if (model.id === 'starter-swift') await page.screenshot({ path: 'artifacts/aircraft-v4-interior.png' });
  await page.getByRole('button', { name: '查看外观', exact: true }).click(); await expect(near).toBeVisible();
  await expectRegistration(page, model.id);
  await expect(cabin).toHaveAttribute('inert', ''); await expect(cabin).toHaveAttribute('data-mount-marker', 'kept');
  expect(await cabin.getByTestId('loaded-order').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-order-id')))).toEqual(ids);
  // Sample actual layer pixels across the whole room, not just an image bounding box.
  const coverage = await frame.evaluate(el => {
    const n = el.querySelector<HTMLImageElement>('.aircraft-near-layer')!, r = n.getBoundingClientRect(), room = el.querySelector('.cabin-interior')!.getBoundingClientRect();
    const canvas = document.createElement('canvas'); canvas.width = n.naturalWidth; canvas.height = n.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(n, 0, 0); let min = 255;
    for (let u = .05; u < 1; u += .1) for (let v = .05; v < 1; v += .1) {
      const x = Math.floor((room.x + u * room.width - r.x) / r.width * canvas.width), y = Math.floor((room.y + v * room.height - r.y) / r.height * canvas.height);
      min = Math.min(min, ctx.getImageData(x, y, 1, 1).data[3]!);
    }
    return { min, corner: ctx.getImageData(0, 0, 1, 1).data[3] };
  });
  expect(coverage.corner).toBe(0); expect(coverage.min).toBeGreaterThan(245);
  if (model.id === 'starter-swift') await page.screenshot({ path: 'artifacts/aircraft-v4-exterior.png' });
  await page.getByRole('button', { name: '查看机舱', exact: true }).click(); await expect(near).toBeHidden();
  await expect(cabin).not.toHaveAttribute('inert', ''); await expect(cabin).toHaveAttribute('data-mount-marker', 'kept');
  await cabin.getByTestId('loaded-order').first().click({ trial: true });
  if (model.id === 'starter-swift') {
    const original = page.viewportSize()!;
    for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport); await expectRegistration(page, model.id);
      await page.screenshot({ path: `artifacts/direct-cutaway-${viewport.width}.png` });
    }
    await page.setViewportSize(original); await expectRegistration(page, model.id);
  }
  await page.getByRole('button', { name: '存档设置', exact: true }).click(); const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click(); const saved = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  expect(saved.fleet[0].modelId).toBe(model.id);
  const core = new GameCore(NOW, s); core.execute({ type: 'load-destination', planeId: 'AC0001', to: 'PVG' }, NOW);
  expect(saved.orders.filter((o: { location: string }) => o.location === 'AC0001')).toEqual(core.snapshot().orders.filter(o => o.location === 'AC0001'));
});
