import { expect, type Locator } from '@playwright/test';

/** IntersectionObserver can report 0.99999976 for a fully visible transformed
 * dialog. Tolerate only float noise, AND check all four real screen edges so a
 * clipped control cannot pass just because almost all of its area is visible. */
export async function expectFullyInViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport({ ratio: 1 - 1e-6 });
  await expect.poll(() => locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const root = document.getElementById('root')!;
    return Math.max(0, -box.left, -box.top, box.right - root.clientWidth, box.bottom - root.clientHeight);
  })).toBeLessThanOrEqual(.01);
}
