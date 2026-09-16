import { test, expect } from './fixture.js';

test('game shell has no outer border or rounded frame', async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('./');
    const shell = page.locator('.aviation-game');
    await expect(shell).toBeVisible();
    const frame = await shell.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        top: style.borderTopWidth,
        right: style.borderRightWidth,
        bottom: style.borderBottomWidth,
        left: style.borderLeftWidth,
        radius: style.borderRadius,
      };
    });
    expect(frame).toEqual({ top: '0px', right: '0px', bottom: '0px', left: '0px', radius: '0px' });
  }
});
