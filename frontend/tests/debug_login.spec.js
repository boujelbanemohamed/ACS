const { test, expect } = require('@playwright/test');
test('debug login', async ({ page }) => {
  await page.goto('/login');
  await page.waitForSelector('#username');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'Admin@123');
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(5000);
  const errorEl = await page.locator('.error-message');
  const errorText = await errorEl.isVisible() ? await errorEl.textContent() : 'NO ERROR';
  console.log('ERROR:', errorText);
  console.log('URL:', page.url());
});
