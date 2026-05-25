const { test, expect } = require('@playwright/test');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Admin@123';
const API_BASE = process.env.API_URL || 'http://localhost:5001';

async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.fill('#username', ADMIN_USER);
  await page.fill('#password', ADMIN_PASS);
  await page.locator('button[type="submit"]').click({ force: true });
  await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 15000 });
}

async function getAdminToken(request) {
  const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS }
  });
  return (await loginRes.json()).data.token;
}

test.describe('Mot de passe oublié - Tous les rôles', () => {
  const API_BASE_LOCAL = API_BASE;

  test('forgot-password API retourne 200 pour super_admin', async ({ request }) => {
    const res = await request.post(`${API_BASE_LOCAL}/api/auth/forgot-password`, {
      data: { email: 'admin@banking.com' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('envoy');
  });

  test('forgot-password API retourne 200 pour bank_admin', async ({ request }) => {
    const res = await request.post(`${API_BASE_LOCAL}/api/auth/forgot-password`, {
      data: { email: 'ba@test.com' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('envoy');
  });

  test('forgot-password API retourne 200 pour bank user', async ({ request }) => {
    const res = await request.post(`${API_BASE_LOCAL}/api/auth/forgot-password`, {
      data: { email: 'bankuser_new@test.com' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('envoy');
  });

  test('forgot-password retourne meme message pour email inexistant (securite)', async ({ request }) => {
    const res = await request.post(`${API_BASE_LOCAL}/api/auth/forgot-password`, {
      data: { email: 'nobody@nonexistent.com' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('envoy');
  });

  test('reset-password rejette token invalide', async ({ request }) => {
    const res = await request.post(`${API_BASE_LOCAL}/api/auth/reset-password`, {
      data: { token: 'invalid-token-that-does-not-exist-in-db', password: 'NewPass123!' }
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  test('reset-password rejette mot de passe court', async ({ request }) => {
    const res = await request.post(`${API_BASE_LOCAL}/api/auth/reset-password`, {
      data: { token: 'some-token', password: '12' }
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Dashboard - Filtre Date', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('affiche le bouton filtre date', async ({ page }) => {
    await expect(page.locator('.filter-toggle')).toBeVisible({ timeout: 10000 });
  });

  test('affiche les inputs date apres clic sur le filtre', async ({ page }) => {
    await page.locator('.filter-toggle').click();
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.filter-apply')).toBeVisible();
  });

  test('masque les inputs apres second clic', async ({ page }) => {
    await page.locator('.filter-toggle').click();
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5000 });
    await page.locator('.filter-toggle').click();
    await expect(page.locator('input[type="date"]').first()).not.toBeVisible();
  });

  test('affiche le badge actif quand le filtre est ouvert', async ({ page }) => {
    await page.locator('.filter-toggle').click();
    await expect(page.locator('.filter-active')).toContainText('actif');
  });

  test('applique le filtre date et recharge les stats', async ({ page }) => {
    await page.locator('.filter-toggle').click();
    const today = new Date().toISOString().split('T')[0];
    await page.locator('input[type="date"]').first().fill(today);
    await page.locator('input[type="date"]').nth(1).fill(today);
    await page.locator('.filter-apply').click();
    await expect(page.locator('.metric-card').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Navigation - Toutes les pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  const pages = [
    { path: '/banks', title: 'Banques' },
    { path: '/processing', title: 'Traitement' },
    { path: '/records', title: 'Enregistrements' },
    { path: '/history', title: 'Historique' },
    { path: '/cron', title: 'Scan' },
    { path: '/users', title: 'Utilisateurs' },
    { path: '/profile', title: 'Profil' },
    { path: '/notifications', title: 'Notifications' },
    { path: '/monitoring', title: 'Monitoring' },
    { path: '/audit-logs', title: 'Journal' },
    { path: '/role-features', title: 'Permissions' },
  ];

  for (const { path, title } of pages) {
    test(`affiche la page ${path} avec son titre`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toContainText(title, { timeout: 15000 });
    });
  }

  test('sidebar est visible sur toutes les pages', async ({ page }) => {
    await page.goto('/banks');
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 5000 });
    await page.goto('/users');
    await expect(page.locator('.sidebar')).toBeVisible();
  });
});

test.describe('Dashboard - Statistiques API', () => {
  test('API dashboard retourne toutes les stats', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalBanks');
    expect(body.data).toHaveProperty('totalRecords');
    expect(body.data).toHaveProperty('todayFiles');
    expect(body.data).toHaveProperty('pendingErrors');
    expect(body.data).toHaveProperty('recentActivity');
    expect(body.data).toHaveProperty('bankStats');
  });

  test('API dashboard avec filtre date', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/dashboard?dateFrom=2026-01-01&dateTo=2026-12-31`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

test.describe('Banques - API CRUD', () => {
  test('liste les banques', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/banks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('code');
    }
  });

  test('affiche les stats d une banque', async ({ request }) => {
    const token = await getAdminToken(request);
    const banksRes = await request.get(`${API_BASE}/api/banks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const banks = (await banksRes.json()).data;
    if (banks.length > 0) {
      const res = await request.get(`${API_BASE}/api/banks/${banks[0].id}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).success).toBe(true);
    }
  });
});

test.describe('Utilisateurs - API', () => {
  test('liste les utilisateurs', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const data = (await res.json()).data;
    expect(Array.isArray(data)).toBe(true);
  });

  test('recupere son profil', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/users/me/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).data.username).toBe(ADMIN_USER);
  });
});

test.describe('Historique - API', () => {
  test('recupere l historique avec pagination', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/history?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('pagination');
    expect(body.pagination.limit).toBe(10);
  });

  test('recupere les stats historique', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/history/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('total');
  });

  test('filtre historique par date', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/history?dateFrom=2026-01-01&dateTo=2026-12-31`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

test.describe('Journal d audit - API', () => {
  test('recupere les logs d audit', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/audit-logs?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('liste les actions disponibles', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/audit-logs/actions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('filtre audit par action', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/audit-logs?action=LOGIN_SUCCESS&limit=5`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

test.describe('Enrôlement - API', () => {
  test('recupere les stats enrolement', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/enrollment/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('recupere les logs enrolement', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/enrollment/logs?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Clés API - API', () => {
  test('liste les cles API', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/api-keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test('stats des cles API', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/api-keys/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('total_keys');
  });
});

test.describe('Logs XML - API', () => {
  test('liste les logs XML', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/xml-logs?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('pagination');
  });

  test('stats XML', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/xml-logs/stats/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

test.describe('Monitoring - API', () => {
  test('health check retourne tous les composants', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/monitoring/health`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('globalStatus');
    expect(body.data.components).toHaveProperty('database');
    expect(body.data.components).toHaveProperty('smtp');
    expect(body.data.components).toHaveProperty('cron');
    expect(body.data).toHaveProperty('system');
    expect(body.data.system).toHaveProperty('nodeVersion');
    expect(body.data.system).toHaveProperty('uptime');
    expect(body.data.system).toHaveProperty('memory');
  });
});

test.describe('Paramètres - API', () => {
  test('recupere les parametres', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('cron_schedule');
    expect(body.data).toHaveProperty('cron_enabled');
  });
});

test.describe('Scanner - API', () => {
  let baUserId = null;
  let baToken = null;

  test.beforeAll(async ({ request }) => {
    const adminToken = await getAdminToken(request);
    const baRes = await request.post(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      data: { username: `e2e_ba_scanner_${Date.now()}`, email: `ba_scanner_${Date.now()}@test.com`, password: 'TestBa1234!', role: 'bank_admin', bankId: 1 }
    });
    if (baRes.status() === 200) {
      baUserId = (await baRes.json()).data.id;
      const baLogin = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: `e2e_ba_scanner_${Date.now()}`, password: 'TestBa1234!' }
      });
      if (baLogin.status() === 200) baToken = (await baLogin.json()).data.token;
    }
  });

  test.afterAll(async ({ request }) => {
    if (!baUserId) return;
    const adminToken = await getAdminToken(request);
    await request.delete(`${API_BASE}/api/users/${baUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  test('super_admin recupere le statut du scanner', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/scanner/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('enabled');
  });

  test('super_admin recupere les logs du scanner', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/scanner/logs?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test('bank_admin recupere le statut du scanner', async ({ request }) => {
    if (!baToken) return;
    const res = await request.get(`${API_BASE}/api/scanner/status`, {
      headers: { Authorization: `Bearer ${baToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('enabled');
  });

  test('bank_admin recupere les logs du scanner', async ({ request }) => {
    if (!baToken) return;
    const res = await request.get(`${API_BASE}/api/scanner/logs?limit=10`, {
      headers: { Authorization: `Bearer ${baToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Monitoring - Accès par rôle', () => {
  let createdUserId = null;
  let bankAdminToken = null;
  let bankUserToken = null;

  test.beforeAll(async ({ request }) => {
    const adminToken = await getAdminToken(request);
    const baRes = await request.post(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      data: { username: `e2e_ba_mon_${Date.now()}`, email: `ba_mon_${Date.now()}@test.com`, password: 'TestBa1234!', role: 'bank_admin', bankId: 1 }
    });
    if (baRes.status() === 200) {
      createdUserId = (await baRes.json()).data.id;
      const baLogin = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: `e2e_ba_mon_${Date.now()}`, password: 'TestBa1234!' }
      });
      if (baLogin.status() === 200) bankAdminToken = (await baLogin.json()).data.token;
    }

    const buLogin = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (buLogin.status() === 200) bankUserToken = (await buLogin.json()).data.token;
  });

  test.afterAll(async ({ request }) => {
    if (!createdUserId) return;
    const adminToken = await getAdminToken(request);
    await request.delete(`${API_BASE}/api/users/${createdUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  test('bank_admin peut acceder a health et recoit donnees simplifiees', async ({ request }) => {
    if (!bankAdminToken) return;
    const res = await request.get(`${API_BASE}/api/monitoring/health`, {
      headers: { Authorization: `Bearer ${bankAdminToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('globalStatus');
    expect(body.data).toHaveProperty('components');
    expect(body.data).toHaveProperty('system');
    expect(body.data.system).toHaveProperty('role');
    expect(body.data.system).not.toHaveProperty('nodeVersion');
    expect(body.data.system).not.toHaveProperty('memory');
  });

  test('bank_admin peut acceder a debug avec bank_id filtre', async ({ request }) => {
    if (!bankAdminToken) return;
    const res = await request.get(`${API_BASE}/api/monitoring/debug?bankId=1`, {
      headers: { Authorization: `Bearer ${bankAdminToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('summary');
    expect(body.data).toHaveProperty('file_errors_by_status');
  });

  test('bank_user recoit donnees simplifiees si la feature est activee', async ({ request }) => {
    if (!bankUserToken) return;
    const res = await request.get(`${API_BASE}/api/monitoring/health`, {
      headers: { Authorization: `Bearer ${bankUserToken}` }
    });
    if (res.status() === 403) return;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveProperty('globalStatus');
    expect(body.data.system).toHaveProperty('role');
  });
});

test.describe('Scanner - Accès par rôle', () => {
  let createdUserId = null;
  let bankAdminToken = null;

  test.beforeAll(async ({ request }) => {
    const adminToken = await getAdminToken(request);
    const baRes = await request.post(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      data: { username: `e2e_ba_scan_${Date.now()}`, email: `ba_scan_${Date.now()}@test.com`, password: 'TestBa1234!', role: 'bank_admin', bankId: 1 }
    });
    if (baRes.status() === 200) {
      createdUserId = (await baRes.json()).data.id;
      const baLogin = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: `e2e_ba_scan_${Date.now()}`, password: 'TestBa1234!' }
      });
      if (baLogin.status() === 200) bankAdminToken = (await baLogin.json()).data.token;
    }
  });

  test.afterAll(async ({ request }) => {
    if (!createdUserId) return;
    const adminToken = await getAdminToken(request);
    await request.delete(`${API_BASE}/api/users/${createdUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  });

  test('bank_admin peut acceder au scanner status', async ({ request }) => {
    if (!bankAdminToken) return;
    const res = await request.get(`${API_BASE}/api/scanner/status`, {
      headers: { Authorization: `Bearer ${bankAdminToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('enabled');
  });

  test('bank_admin peut acceder aux logs scanner', async ({ request }) => {
    if (!bankAdminToken) return;
    const res = await request.get(`${API_BASE}/api/scanner/logs?limit=5`, {
      headers: { Authorization: `Bearer ${bankAdminToken}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Role Features - API', () => {
  test('recupere les features pour super_admin', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/role-features/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('recupere toutes les features', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/role-features`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('roles');
  });

  test('liste les banques pour role-features', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/role-features/banks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test('liste les utilisateurs pour role-features', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/role-features/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });
});

test.describe('Notifications - API', () => {
  test('recupere la config SMTP', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/notifications/smtp`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('recupere les logs notifications', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/notifications/logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).data)).toBe(true);
  });

  test('recupere la config cron notifications', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/notifications/cron-config`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('schedule');
    expect(body.data).toHaveProperty('enabled');
  });
});

test.describe('Notifications - Emails API', () => {
  test('recupere les emails de notification pour banque 1', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/notifications/emails/1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

test.describe('Records - Pagination API', () => {
  test('recupere les enregistrements avec pagination', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${API_BASE}/api/records?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body).toHaveProperty('pagination');
    expect(body.pagination.limit).toBe(10);
  });
});

test.describe('Permissions - Sécurité renforcée', () => {
  test('bank user ne peut pas creer de banque', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (loginRes.status() !== 200) return;
    const { token } = (await loginRes.json()).data;

    const res = await request.post(`${API_BASE}/api/banks`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { code: 'HACK', name: 'Hack Bank', source_url: '/hack', destination_url: '/hack', old_url: '/hack', xml_output_url: '/hack' }
    });
    expect(res.status()).toBe(403);
  });

  test('bank user ne peut pas acceder aux utilisateurs', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (loginRes.status() !== 200) return;
    const { token } = (await loginRes.json()).data;

    const res = await request.get(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(403);
  });

  test('bank user ne peut pas acceder aux parametres', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (loginRes.status() !== 200) return;
    const { token } = (await loginRes.json()).data;

    const res = await request.get(`${API_BASE}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(403);
  });

  test('bank user peut acceder au monitoring si feature activee (donnees simplifiees sans nodeVersion)', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (loginRes.status() !== 200) return;
    const { token } = (await loginRes.json()).data;

    const res = await request.get(`${API_BASE}/api/monitoring/health`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Par defaut bank user n'a pas monitoring -> 403
    // Si super_admin active la feature -> 200 avec donnees simplifiees
    if (res.status() === 403) return;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('globalStatus');
    expect(body.data.system).toHaveProperty('role');
    expect(body.data.system).not.toHaveProperty('nodeVersion');
    expect(body.data.system).not.toHaveProperty('memory');
  });

  test('bank user ne peut pas acceder au monitoring debug sans la feature', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (loginRes.status() !== 200) return;
    const { token } = (await loginRes.json()).data;

    const res = await request.get(`${API_BASE}/api/monitoring/debug?bankId=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(403);
  });

  test('bank user peut acceder au scanner (feature cron activee par defaut)', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (loginRes.status() !== 200) return;
    const { token } = (await loginRes.json()).data;

    const statusRes = await request.get(`${API_BASE}/api/scanner/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(statusRes.status()).toBe(200);

    const logsRes = await request.get(`${API_BASE}/api/scanner/logs?bankId=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(logsRes.status()).toBe(200);
  });

  test('bank user ne peut pas acceder aux cles API stats', async ({ request }) => {
    const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: 'bankuser', password: 'Bank1234!' }
    });
    if (loginRes.status() !== 200) return;
    const { token } = (await loginRes.json()).data;

    const res = await request.get(`${API_BASE}/api/api-keys/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Pages UI - Contenu specifique', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('page Banques affiche la liste', async ({ page }) => {
    await page.goto('/banks');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
    const btn = page.locator('button:has-text("Nouvelle Banque")');
    if (await btn.isVisible()) {
      await expect(btn).toBeEnabled();
    }
  });

  test('page Utilisateurs affiche le tableau', async ({ page }) => {
    await page.goto('/users');
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.btn-primary:has-text("Nouvel")')).toBeVisible();
  });

  test('page Profil affiche les formulaires', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('.profile-avatar')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Informations personnelles' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Changer le mot de passe' })).toBeVisible();
  });

  test('page Historique affiche les filtres', async ({ page }) => {
    await page.goto('/history');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
    const filterBtn = page.locator('button:has-text("Filtres")').first();
    if (await filterBtn.isVisible()) {
      await expect(filterBtn).toBeEnabled();
    }
  });

  test('page Permissions affiche les onglets', async ({ page }) => {
    await page.goto('/role-features');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Par Rôle')).toBeVisible();
    await expect(page.locator('text=Par Banque')).toBeVisible();
    await expect(page.locator('text=Par Utilisateur')).toBeVisible();
  });

  test('page Monitoring affiche les composants', async ({ page }) => {
    await page.goto('/monitoring');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
  });

  test('page Notifications affiche la configuration', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
  });

  test('page Audit Logs affiche les filtres', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
  });

  test('page Scan automatique affiche la configuration', async ({ page }) => {
    await page.goto('/cron');
    await expect(page.locator('.cron-manager')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Scan', { timeout: 5000 });
  });

  test('page Traitement affiche les onglets', async ({ page }) => {
    await page.goto('/processing');
    await expect(page.locator('.processing-page')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Upload Fichier')).toBeVisible();
  });
});

test.describe('Cycle de vie - Utilisateur Banque', () => {
  test('bank user ne voit pas Nouvelle Banque', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'bankuser');
    await page.fill('#password', 'Bank1234!');
    await page.locator('button[type="submit"]').click({ force: true });
    await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 15000 });

    await page.goto('/banks');
    await expect(page.locator('h1')).toContainText('Ma Banque', { timeout: 10000 });
    await expect(page.locator('button:has-text("Nouvelle Banque")')).not.toBeVisible();
  });

  test('bank user ne voit pas Gestion des Utilisateurs', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'bankuser');
    await page.fill('#password', 'Bank1234!');
    await page.locator('button[type="submit"]').click({ force: true });
    await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 15000 });

    await page.goto('/users');
    await expect(page).toHaveURL(/\/users/, { timeout: 5000 });
    const text = await page.locator('body').textContent();
    expect(text).not.toContain('newuser@');
  });

  test.describe('Notifications - Ecriture Configuration', () => {

    test('super_admin met a jour la config SMTP', async ({ request }) => {
      const token = await getAdminToken(request);
      const res = await request.put(`${API_BASE}/api/notifications/smtp`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { host: 'mail.example.com', port: 587, user: 'test@test.com', pass: 'secret' }
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('super_admin ajoute un email de notification', async ({ request }) => {
      const token = await getAdminToken(request);
      const res = await request.post(`${API_BASE}/api/notifications/emails/1`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { email: 'e2e_test@example.com' }
      });
      expect([200, 201]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('super_admin toggle un email de notification', async ({ request }) => {
      const token = await getAdminToken(request);
      const emails = await request.get(`${API_BASE}/api/notifications/emails/1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const list = (await emails.json()).data || [];
      const target = list.find(e => e.email === 'e2e_test@example.com');
      if (!target) return;

      const res = await request.put(`${API_BASE}/api/notifications/emails/${target.id}/toggle`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      expect(res.status()).toBe(200);
    });

    test('super_admin supprime l email de notification E2E', async ({ request }) => {
      const token = await getAdminToken(request);
      const emails = await request.get(`${API_BASE}/api/notifications/emails/1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const list = (await emails.json()).data || [];
      const target = list.find(e => e.email === 'e2e_test@example.com');
      if (!target) return;

      const res = await request.delete(`${API_BASE}/api/notifications/emails/${target.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(res.status()).toBe(200);
    });

    test('bank user ne peut pas modifier la config SMTP', async ({ request }) => {
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: 'bankuser', password: 'Bank1234!' }
      });
      const { token } = (await login.json()).data;

      const res = await request.put(`${API_BASE}/api/notifications/smtp`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { host: 'evil.com', port: 25 }
      });
      expect(res.status()).toBe(403);
    });

  });

  test.describe('API Publique - Validation', () => {

    test('API publique avec cle API valide une carte', async ({ request }) => {
      const token = await getAdminToken(request);
      const keyRes = await request.post(`${API_BASE}/api/api-keys`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { bank_id: 1, name: `pubkey_${Date.now()}` }
      });
      const apiKey = (await keyRes.json()).data.api_key;

      const res = await request.post(`${API_BASE}/api/v1/cards/validate`, {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        data: { bankCode: 'BT', cards: [{ pan: '4000056655665556', phone: '21699123456', expiry: '12/28' }] }
      });
      expect(res.status()).toBe(200);
    });

    test('API publique avec cle API liste les banques', async ({ request }) => {
      const token = await getAdminToken(request);
      const keyRes = await request.post(`${API_BASE}/api/api-keys`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { bank_id: 1, name: `pubkey_${Date.now()}` }
      });
      const apiKey = (await keyRes.json()).data.api_key;

      const res = await request.get(`${API_BASE}/api/v1/banks`, {
        headers: { 'X-API-Key': apiKey }
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('API publique docs est accessible (sans cle)', async ({ request }) => {
      const res = await request.get(`${API_BASE}/api/v1/docs`);
      expect(res.status()).toBe(200);
    });

  });

});

async function loginAsUser(page, username, password) {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.locator('button[type="submit"]').click({ force: true });
  await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 15000 });
}

test.describe('Cycle de vie - Bank Admin (UI)', () => {
  const BA_USER = `e2e_ba_ui_${Date.now()}`;
  const BA_PASS = 'TestBa1234!';
  let createdUserId = null;

  test.beforeAll(async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;
    const res = await request.post(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { username: BA_USER, email: `${BA_USER}@test.com`, password: BA_PASS, role: 'bank_admin', bankId: 1 }
    });
    createdUserId = (await res.json()).data?.id;
  });

  test.afterAll(async ({ request }) => {
    if (!createdUserId) return;
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;
    await request.delete(`${API_BASE}/api/users/${createdUserId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  });

  test('se connecte et voit le dashboard', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 10000 });
  });

  test('voit le lien Permissions dans la navigation', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    const permissionLink = page.locator('a[href="/role-features"]');
    await expect(permissionLink).toBeVisible({ timeout: 10000 });
  });

  test('page Permissions: ne voit pas Par Rôle', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/role-features');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Par Banque')).toBeVisible();
    await expect(page.locator('text=Par Utilisateur')).toBeVisible();
    await expect(page.locator('text=Par Rôle')).not.toBeVisible();
  });

  test('page Banques: ne voit pas Nouvelle Banque', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/banks');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Nouvelle Banque")')).not.toBeVisible();
  });

  test('page Utilisateurs est accessible', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/users');
    await expect(page.locator('.search-bar')).toBeVisible({ timeout: 10000 });
  });

  test('page Monitoring est accessible', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/monitoring');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
  });

  test('page Notifications affiche Acces refuse', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/notifications');
    await expect(page.locator('.access-denied')).toBeVisible({ timeout: 10000 });
  });

  test('page Audit Logs est accessible', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/audit-logs');
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
  });

  test('page Traitement est accessible', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/processing');
    await expect(page.locator('.processing-page')).toBeVisible({ timeout: 15000 });
  });

  test('page Scan automatique est accessible', async ({ page }) => {
    await loginAsUser(page, BA_USER, BA_PASS);
    await page.goto('/cron');
    await expect(page.locator('.cron-manager')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Cycle de vie - Bank User (UI)', () => {
  test('ne voit pas le lien Permissions dans la navigation', async ({ page }) => {
    await loginAsUser(page, 'bankuser', 'Bank1234!');
    const permissionLink = page.locator('a[href="/role-features"]');
    await expect(permissionLink).not.toBeVisible({ timeout: 10000 });
  });

  test('page Monitoring affiche le header mais pas les donnees', async ({ page }) => {
    await loginAsUser(page, 'bankuser', 'Bank1234!');
    await page.goto('/monitoring', { timeout: 10000 });
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
    const text = await page.locator('body').textContent();
    expect(text).toContain('Monitoring');
  });

  test('page Notifications affiche Acces refuse', async ({ page }) => {
    await loginAsUser(page, 'bankuser', 'Bank1234!');
    await page.goto('/notifications', { timeout: 10000 });
    await expect(page.locator('.access-denied')).toBeVisible({ timeout: 10000 });
  });

  test('page Audit Logs est accessible (page vide ou filtre restreint)', async ({ page }) => {
    await loginAsUser(page, 'bankuser', 'Bank1234!');
    await page.goto('/audit-logs', { timeout: 10000 });
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 10000 });
  });
});
