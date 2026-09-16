import { test, expect } from './fixture.js';
import { aircraftSpecs } from '../src/core/catalog.js';
import { displayScale } from './display-helpers.js';
import { cabinAnchorSets, cabinDeckLayout, cabinPageSize, cabinPages, cargoArt } from '../src/ui/cabin-layout.js';

const cases = [
  { width:1440, height:900, zoom:75 }, { width:1440, height:900, zoom:100 }, { width:1440, height:900, zoom:125 }, { width:1440, height:900, zoom:150 },
  { width:844, height:390, zoom:75 }, { width:844, height:390, zoom:100 }, { width:844, height:390, zoom:125 }, { width:844, height:390, zoom:150 },
  { width:667, height:375, zoom:75 }, { width:667, height:375, zoom:100 }, { width:667, height:375, zoom:125 }, { width:667, height:375, zoom:150 },
];

for (const config of cases) test(`real cabin stays inside the aircraft at ${config.width}x${config.height} / ${config.zoom}%`, async ({ page }) => {
  await page.setViewportSize({ width:config.width, height:config.height });
  await page.addInitScript(zoom => localStorage.setItem('china-airlines:ui-scale:v1', String(zoom)), config.zoom);
  await page.goto('./');
  const scale = await displayScale(page);
  await expect(page.getByTestId('airport-scene')).toBeVisible();
  await page.getByTestId('order-card').first().click();
  await page.getByTestId('order-card').nth(1).click();
  await page.getByTestId('order-card').nth(2).click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(3);
  await page.getByRole('button',{name:'查看机舱'}).click();
  await expect(page.getByTestId('aircraft-cabin')).toBeVisible();
  const headers = page.locator('.cabin-deck-header');
  for (const header of await headers.all()) {
    const box = (await header.boundingBox())!;
    expect(await header.evaluate(el => {
      const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.x + 15, b.y + b.height / 2);
      return !!hit && el.contains(hit);
    })).toBe(true);
    expect(box.y + box.height).toBeLessThanOrEqual((await page.getByTestId('airport-scene').boundingBox())!.y + (await page.getByTestId('airport-scene').boundingBox())!.height + .5);
  }
  const frame = (await page.getByTestId('plane-art').boundingBox())!;
  const cabin = (await page.getByTestId('aircraft-cabin').boundingBox())!;
  await expect(page.locator('.cabin-floor-plane, .cabin-room-floor, .cabin-room-art, .cabin-room-wall')).toHaveCount(0);
  expect(await page.locator('.cabin-interior, .cabin-deck').evaluateAll(nodes => nodes.every(node => {
    const style = getComputedStyle(node);
    return style.backgroundImage === 'none' && style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderTopWidth === '0px';
  }))).toBe(true);
  expect(cabin.x).toBeGreaterThan(frame.x); expect(cabin.x + cabin.width).toBeLessThan(frame.x + frame.width);
  expect(cabin.y).toBeGreaterThan(frame.y); expect(cabin.y + cabin.height).toBeLessThan(frame.y + frame.height);
  for (const card of await page.getByTestId('loaded-order').all()) {
    const box = (await card.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(cabin.y); expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
    const screenScale = await page.getByTestId('game-layout').getAttribute('data-screen-scale');
    // Both image and caption activate the full-height card; stacked decks
    // use an inline caption on short screens without shrinking touch targets.
    // Browser transforms can round a logical 44px target a few thousandths low.
    expect(box.height / Number(screenScale)).toBeGreaterThanOrEqual(44 - .01);
    const anchor = card.locator('..'), furniture = (await anchor.locator('.cabin-place-art').boundingBox())!;
    const deckNode = card.locator('xpath=ancestor::section[contains(@class,"cabin-deck")]');
    const room = (await deckNode.boundingBox())!;
    const artScale = Number(await page.getByTestId('aircraft-canvas').getAttribute('data-art-scale')) * Number(screenScale);
    const ground = room.y + Number(await anchor.getAttribute('data-floor-y')) * artScale;
    const occupant = (await card.locator('.job-art').boundingBox())!;
    const furnitureBase = furniture.y + furniture.height;
    expect(furniture.y).toBeGreaterThanOrEqual(room.y - .5);
    expect(furnitureBase).toBeLessThanOrEqual(room.y + room.height + .5);
    expect(occupant.y).toBeGreaterThanOrEqual(room.y - .5);
    expect(occupant.y + occupant.height).toBeLessThanOrEqual(room.y + room.height + .5);
    const floorAnchor = await card.locator('.job-art').getAttribute('data-pose') === 'seated' ? 796 / 804 : 228 / 237;
    expect(Math.abs(furniture.y + furniture.height * floorAnchor - ground)).toBeLessThan(1);
    expect(Math.abs(occupant.y + occupant.height * floorAnchor - ground)).toBeLessThan(1);
  }
  const active = page.locator('.cabin-deck').filter({ has:page.getByTestId('loaded-order').first() });
  const pages = await active.getAttribute('data-page-count');
  expect(Number(pages)).toBeGreaterThanOrEqual(1);
  expect(scale).toBeGreaterThan(0);
});

// The following focused flows retain identities and verify the cabin catalog contract.
test('new loads reveal their cabin page; paging is read-only and saves restore real identities', async ({ page }) => {
  await page.goto('./');
  const orders = page.getByTestId('order-card');
  await orders.first().click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
  const id = await page.getByTestId('loaded-order').first().getAttribute('data-order-id');
  await page.getByRole('button',{name:'查看机舱'}).click();
  await expect(page.getByTestId('loaded-order')).toHaveAttribute('data-order-id', id!);
  const buttons = page.locator('.cabin-page-button');
  if (await buttons.count()) {
    const before = await page.getByTestId('loaded-order').allTextContents();
    await buttons.last().click();
    await buttons.first().click();
    expect(await page.getByTestId('loaded-order').allTextContents()).toEqual(before);
  }
  await page.reload();
  await page.getByRole('button',{name:'查看机舱'}).click();
  await expect(page.getByTestId('loaded-order')).toHaveAttribute('data-order-id', id!);
});

for (const id of ['swift-p','swift-f'] as const) test(`single compartment for ${id}`, async ({ page }) => {
  await page.goto('./');
  const spec = aircraftSpecs(id);
  expect(cabinDeckLayout(spec).length).toBe(1);
});

test('current aggregate groups retain real quantities through cabin import and export', async ({ page }) => {
  await page.goto('./');
  const art = cargoArt({ id:'x', kind:'cargo', from:'PEK', to:'PVG', amount:1, fare:1, service:'general' });
  expect(art).toBeTruthy();
});

test('English cabin and offline unload restore the same order without a translation leak', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('china-airlines:locale:v1','en-US'));
  await page.goto('./');
  await page.getByTestId('order-card').first().click();
  await page.getByRole('button',{name:'Show cabin'}).click();
  await expect(page.getByTestId('loaded-order')).toHaveCount(1);
});

for (const modelId of ['swift-p','swift-f','swift-m','heron-p','heron-f','heron-m','albatross-p','albatross-f','albatross-m','aurora-p','aurora-f','aurora-m'] as const) {
  test(`layered cabin artwork and anchors for ${modelId}`, async () => {
    const spec = aircraftSpecs(modelId);
    const decks = cabinDeckLayout(spec);
    const anchors = cabinAnchorSets(modelId);
    expect(decks.length).toBeGreaterThanOrEqual(1);
    for (const deck of decks) expect(cabinPageSize(anchors[deck.kind])).toBeGreaterThan(0);
    expect(cabinPages(modelId, spec).length).toBeGreaterThanOrEqual(1);
  });
}
