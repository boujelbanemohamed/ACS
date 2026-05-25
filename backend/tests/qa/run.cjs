const { chromium } = require('/Users/mohamedboujelbane/Desktop/ACS/frontend/node_modules/playwright');

const BASE = 'http://localhost:8088';
const API = 'http://localhost:5001';
const results = [];

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      results.push({ name, status: 'passed' });
      console.log(`PASS: ${name}`);
    } catch (e) {
      results.push({ name, status: 'failed', error: e.message });
      console.log(`FAIL: ${name} — ${e.message}`);
    }
  })();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // 1. LOGIN
  await test('Login super_admin', async () => {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector("input[name='username']");
    await page.fill("input[name='username']", 'admin');
    await page.fill("input[name='password']", 'Admin@123');
    await page.click("button[type='submit']");
    await page.waitForURL('**/dashboard');
    await page.close();
  });

  let page;
  for (const { label, path, assertText, wait } of [
    { label: 'Dashboard', path: '/dashboard', assertText: 'Bonjour', wait: 2000 },
    { label: 'Banques', path: '/banks', assertText: 'Banque', wait: 1500 },
    { label: 'Traitement', path: '/processing', wait: 1500 },
    { label: 'Enregistrements', path: '/records', assertText: 'Enregistrements', wait: 3000 },
    { label: 'Historique', path: '/history', assertText: 'Historique', wait: 1500 },
    { label: 'Scan Automatique', path: '/cron', wait: 1500 },
    { label: 'Utilisateurs', path: '/users', wait: 1500 },
    { label: 'Notifications', path: '/notifications', wait: 1500 },
    { label: 'Monitoring', path: '/monitoring', wait: 2500 },
    { label: 'Journal Activité', path: '/audit-logs', assertText: 'Journal', wait: 1500 },
    { label: 'Permissions', path: '/role-features', wait: 1500 },
    { label: 'Documentation API', path: '/api-docs', wait: 1500 },
    { label: 'Tests Plateforme', path: '/platform-tests', assertText: 'Test', wait: 1500 },
    { label: 'Profil', path: '/profile', assertText: 'Profil', wait: 1500 },
    { label: 'Test API', path: '/api-tester', wait: 1500 },
  ]) {
    await test(`Page ${label} se charge`, async () => {
      page = await ctx.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await sleep(wait);
      if (assertText) {
        const body = await page.textContent('body');
        if (!body.includes(assertText)) throw new Error(`"${assertText}" introuvable dans ${path}`);
      }
      await page.close();
    });
  }

  // LIVE — SSE page
  await test('Live affiche des événements', async () => {
    page = await ctx.newPage();
    await page.goto(`${BASE}/live`, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    const events = page.locator('.live-event');
    const count = await events.count();
    if (count === 0) throw new Error('Aucun événement affiché sur /live');
    await page.close();
  });

  // Flux complet
  await test('Flow login → live → événements', async () => {
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector("input[name='username']");
    await page.fill("input[name='username']", 'admin');
    await page.fill("input[name='password']", 'Admin@123');
    await page.click("button[type='submit']");
    await page.waitForURL('**/dashboard');
    await sleep(1000);

    const link = page.locator('a.nav-link', { hasText: 'Flux en direct' });
    const linkCount = await link.count();
    if (linkCount === 0) throw new Error('Lien Flux en direct introuvable');
    await link.click();
    await sleep(5000);

    const events = page.locator('.live-event');
    const count = await events.count();
    if (count === 0) throw new Error('Aucun événement après navigation');
    await page.close();
  });

  // Bank user blocked
  await test('Bank user ne voit pas Flux en direct', async () => {
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector("input[name='username']");
    await page.fill("input[name='username']", 'bankuser');
    await page.fill("input[name='password']", 'Bank1234!');
    await page.click("button[type='submit']");
    await page.waitForURL('**/dashboard');
    await sleep(1000);

    const link = page.locator('a.nav-link', { hasText: 'Flux en direct' });
    const count = await link.count();
    if (count > 0) throw new Error('Bank user ne devrait pas voir Flux en direct');
    await page.close();
  });

  // Sidebar (re-login as admin first)
  await test('Sidebar contient tous les liens', async () => {
    page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector("input[name='username']");
    await page.fill("input[name='username']", 'admin');
    await page.fill("input[name='password']", 'Admin@123');
    await page.click("button[type='submit']");
    await page.waitForURL('**/dashboard');
    await sleep(1500);
    const links = await page.locator('.nav-link').allTextContents();
    const allText = links.join(' ');
    for (const item of ['Dashboard', 'Enregistrements', 'Flux en direct', 'Tests Plateforme']) {
      if (!allText.includes(item)) throw new Error(`Lien "${item}" manquant dans la sidebar`);
    }
    await page.close();
  });

  await browser.close();

  // Output final JSON for platform tests to parse
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  console.log(`\n##QA_RESULT##${JSON.stringify({ results, passed, failed })}##END##`);
})();
