import { test } from './fixture.js';

test('portrait crop positioning', async ({ page }) => {
  await page.setContent(`<style>.a,.b{width:80px;height:80px;border-radius:50%;background-image:url(http://127.0.0.1:4173/art/employee-portraits-v1.png);background-size:1086px auto;background-repeat:no-repeat;}</style>
    <div class='a' style='background-position:-402px -40px'></div>
    <div class='b' style='background-position:402px 40px'></div>`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/portrait-position-test.png' });
});

test('portrait atlas decodes in chromium', async ({ page }) => {
  await page.setContent(`<img src='http://127.0.0.1:4173/art/employee-portraits-v1.png' style='width:543px'>`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/portrait-atlas-chromium.png', fullPage: true });
});

test('portrait paints inside app', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('china-airlines:playing:v1', 'true');
    sessionStorage.setItem('china-airlines:screen:v1', 'airport');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '公司组织', exact: true }).click();
  await page.getByRole('button', { name: '招募', exact: true }).click();
  const el = page.locator('.org-candidate-heading .employee-portrait').first();
  await el.evaluate((node) => {
    const span = node as HTMLElement;
    span.style.backgroundPosition = '-402px -40px';
    span.style.backgroundSize = '1086px auto';
    span.style.borderRadius = '0';
  });
  await page.waitForTimeout(500);
  await el.screenshot({ path: 'artifacts/portrait-in-app-square.png' });
  await el.evaluate((node) => { (node as HTMLElement).style.backgroundPosition = '0px 0px'; });
  await page.waitForTimeout(500);
  await el.screenshot({ path: 'artifacts/portrait-in-app-origin.png' });
});
