import type { Locator } from '@playwright/test';
import { test, expect } from '../helpers/configured-airport.js';
import { launchRoute, selectCity } from '../helpers/dispatch-helpers.js';

async function appearance(button: Locator) {
  return button.evaluate(async element => {
    // Read after any short hover transition.
    getComputedStyle(element).backgroundColor;
    await Promise.all(element.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity,
    ).map(animation => animation.finished.catch(() => undefined)));
    const style = getComputedStyle(element);
    return {
      background: style.backgroundImage, fill: style.backgroundColor,
      border: style.borderColor, color: style.color,
      shadow: style.boxShadow, filter: style.filter,
      outline: style.outline, outlineStyle: style.outlineStyle, outlineOffset: style.outlineOffset,
    };
  });
}

async function expectHoverOutline(button: Locator) {
  const before = await button.boundingBox();
  await button.hover();
  expect(await appearance(button)).toMatchObject({
    outline: 'rgb(244, 253, 255) solid 2px', outlineOffset: '1px',
  });
  expect(await button.boundingBox()).toEqual(before);
}

async function contentGeometry(button: Locator) {
  return button.evaluate(element => {
    const box = element.getBoundingClientRect();
    const icon = element.querySelector('img.painted-icon')!.getBoundingClientRect();
    const caption = element.querySelector(':scope > span, :scope > strong')!.getBoundingClientRect();
    return {
      iconWidth:icon.width, iconHeight:icon.height,
      iconCenterX:icon.x + icon.width / 2 - box.x - box.width / 2,
      iconCenterY:icon.y + icon.height / 2 - box.y - box.height / 2,
      captionCenterX:caption.x + caption.width / 2 - box.x - box.width / 2,
      captionBottom:box.bottom - caption.bottom, captionHeight:caption.height,
      overlap:icon.bottom - caption.top,
      captionContained:caption.left >= box.left && caption.right <= box.right && caption.bottom <= box.bottom,
    };
  });
}

async function expectSharedContent(button: Locator, reference: Awaited<ReturnType<typeof contentGeometry>>) {
  const content = await contentGeometry(button);
  const name = await button.getAttribute('aria-label') ?? await button.innerText();
  for (const key of ['iconWidth','iconHeight','iconCenterX','iconCenterY','captionCenterX','captionBottom','captionHeight'] as const) {
    expect(Math.abs(content[key] - reference[key]), `${name}: ${key}`).toBeLessThan(.5);
  }
  expect(Math.abs(content.iconCenterX)).toBeLessThan(.5);
  expect(Math.abs(content.iconCenterY)).toBeLessThan(.5);
  expect(Math.abs(content.captionCenterX)).toBeLessThan(.5);
  expect(content.captionContained).toBe(true);
  expect(content.overlap).toBeGreaterThan(0);
  expect(content.overlap).toBeLessThan(content.captionHeight);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`button states remain distinct and keyboard accessible at ${viewport.width}`, async ({ page }) => {
    // This route also exercises image controls, every hover state and a real flight.
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('./');
    await expectHoverOutline(page.locator('.job-card:enabled').first());
    await expectHoverOutline(page.locator('.fleet-status-button'));
    const navigation = page.getByRole('navigation', { name: '主导航' });
    const directory = navigation.getByRole('button', { name: '机场目录', exact: true });
    await page.mouse.move(0, 0);
    const ordinaryNav = await appearance(directory);
    await expectHoverOutline(directory);
    expect(await appearance(directory)).not.toEqual(ordinaryNav);
    await directory.click();
    await page.mouse.move(0, 0);
    await expect(directory).toHaveAttribute('aria-current', 'page');
    expect(await appearance(directory)).not.toEqual(ordinaryNav);
    await expectHoverOutline(directory);

    const filters = page.getByRole('group', { name: '机场筛选' });
    const locked = filters.getByRole('button', { name: /^未开放/ });
    const all = filters.getByRole('button', { name: /^全部/ });
    const ordinary = await appearance(locked);
    await expectHoverOutline(locked);
    const hovered = await appearance(locked);
    expect(hovered).not.toEqual(ordinary);
    await locked.click();
    await page.mouse.move(0, 0);
    await expect(locked).toHaveAttribute('aria-pressed', 'true');
    const selected = await appearance(locked);
    expect(selected).not.toEqual(ordinary);
    expect(selected).not.toEqual(hovered);
    await expectHoverOutline(locked);
    await expect(locked).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    expect(await appearance(locked)).toEqual(selected);
    await page.screenshot({ path: `artifacts/button-filter-states-${viewport.width}.png` });

    // Selection follows keyboard activation, while focus remains independently visible.
    await locked.focus();
    await page.keyboard.press('Tab');
    await expect(all).toBeFocused();
    expect(await all.evaluate(element => {
      const style = getComputedStyle(element);
      return element.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    })).toBe(true);
    await all.hover();
    expect(await appearance(all)).toMatchObject({
      outline: 'rgb(180, 125, 25) solid 3px', outlineOffset: '3px',
    });
    await page.keyboard.press('Space');
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(locked).toHaveAttribute('aria-pressed', 'false');

    const clear = page.getByRole('button', { name: '清空机场搜索', exact: true });
    await expect(clear).toBeDisabled();
    await page.mouse.move(0, 0);
    const disabled = await appearance(clear);
    await clear.hover();
    expect(await appearance(clear)).toEqual(disabled);
    expect(disabled.outlineStyle).toBe('none');
    const clearBox = (await clear.boundingBox())!;
    await page.mouse.click(clearBox.x + clearBox.width / 2, clearBox.y + clearBox.height / 2);
    await expect(page.getByRole('searchbox', { name: '搜索机场', exact: true })).toHaveValue('');
    await expect(all).toHaveAttribute('aria-pressed', 'true');

    await navigation.getByRole('button', { name: '机场装载', exact: true }).click();
    const cabin = page.locator('.cabin-toggle');
    await expect(cabin).toHaveAttribute('aria-pressed', 'true');
    await cabin.click();
    await expect(cabin).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.move(0, 0);
    const hiddenCabin = await appearance(cabin);
    await cabin.click();
    await page.mouse.move(0, 0);
    await expect(cabin).toHaveAttribute('aria-pressed', 'true');
    expect(await appearance(cabin)).not.toEqual(hiddenCabin);
    await expectHoverOutline(cabin);

    await page.getByRole('button', { name: '任务中心', exact: true }).click();
    const activeTab = page.getByRole('tab', { name: /^进行中/ });
    const ordinaryTab = await appearance(activeTab);
    await activeTab.click();
    await page.mouse.move(0, 0);
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');
    const selectedTab = await appearance(activeTab);
    expect(selectedTab).not.toEqual(ordinaryTab);
    await expectHoverOutline(activeTab);
    const hoveredTab = await appearance(activeTab);
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(hoveredTab.background).toEqual(selectedTab.background);
    expect(hoveredTab.fill).toEqual(selectedTab.fill);
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: /^已领取/ })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: '关闭任务中心', exact: true }).click();

    await page.getByRole('button', { name: '同目的地装载：上海', exact: true }).click();
    await expect(page.getByTestId('loaded-order')).toHaveCount(5);
    const creditsBeforeFlight = await page.getByTestId('credits').innerText();
    const plan = navigation.getByRole('button', { name: '制定航线', exact: true });
    const contentReference = await contentGeometry(navigation.getByRole('button', { name: '机场装载', exact: true }));
    const navButtons = navigation.locator(':scope > button');
    for (let index = 0; index < await navButtons.count(); index++) await expectSharedContent(navButtons.nth(index), contentReference);
    const planIcon = plan.locator('img');
    await expect(planIcon).toBeVisible();
    expect(await planIcon.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    const planSource = await planIcon.getAttribute('src');
    await expectHoverOutline(plan);
    await page.screenshot({ path: `artifacts/button-content-airport-${viewport.width}.png` });
    await page.mouse.down();
    expect((await appearance(plan)).outlineStyle).toBe('none');
    await expectSharedContent(plan, contentReference);
    await page.mouse.up();
    const dispatch = page.getByRole('button', { name: '检票起飞', exact: true });
    await expect(dispatch).toBeDisabled();
    await dispatch.hover();
    expect((await appearance(dispatch)).outlineStyle).toBe('none');
    await expectSharedContent(dispatch, contentReference);
    const dispatchIcon = dispatch.locator('img');
    await expect(dispatchIcon).toBeVisible();
    expect(await dispatchIcon.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(await dispatchIcon.getAttribute('src')).not.toEqual(planSource);
    const dispatchBox = (await dispatch.boundingBox())!;
    await page.mouse.click(dispatchBox.x + dispatchBox.width / 2, dispatchBox.y + dispatchBox.height / 2);
    await expect(page.locator('.route-dispatch-view')).toBeVisible();
    await expect(page.getByTestId('network-destination')).toHaveText('—');
    await selectCity(page, 'PVG');
    await expect(dispatch).toBeEnabled();
    await page.mouse.move(0, 0);
    const ordinaryDispatch = await appearance(dispatch);
    await expectHoverOutline(dispatch);
    expect(await appearance(dispatch)).not.toEqual(ordinaryDispatch);
    await expectSharedContent(dispatch, contentReference);
    await page.screenshot({ path: `artifacts/button-dispatch-states-${viewport.width}.png` });
    await launchRoute(page);
    await expect(page.locator('.plane-status')).toContainText('飞行');
    const creditsAfterFlight = await page.getByTestId('credits').innerText();
    expect(Number(creditsAfterFlight.replace(/[^\d]/g, ''))).toBeLessThan(Number(creditsBeforeFlight.replace(/[^\d]/g, '')));
    await expect(page.getByTestId('passenger-capacity')).toHaveText('旅客 3 / 3 人');
    expect(errors).toEqual([]);
  });
}
