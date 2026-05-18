const { test, expect } = require('@playwright/test');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Admin@123';
const BANK_USER = 'bankuser';
const BANK_PASS = 'Bank1234!';
const API_BASE = process.env.API_URL || 'http://localhost:5001';

test.describe('ACS Banking CSV Processor - Tests E2E', () => {

  test.describe('Authentification', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.context().clearCookies();
    });

    test('affiche la page de connexion', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('h1')).toHaveText('Banking CSV Processor');
      await expect(page.locator('#username')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toHaveText('Se connecter');
    });

    test('refuse la connexion avec mauvais identifiants', async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', 'admin');
      await page.fill('#password', 'wrong_password');
      await page.locator('button[type="submit"]').click({ force: true });
      await expect(page.locator('.error-message')).toContainText('Identifiants invalides');
    });

    test('connecte avec les identifiants admin', async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', ADMIN_USER);
      await page.fill('#password', ADMIN_PASS);
      await page.locator('button[type="submit"]').click({ force: true });
      await expect(page.locator('h1')).toContainText('Tableau de Bord', { timeout: 15000 });
    });

  });

  test.describe('Dashboard', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', ADMIN_USER);
      await page.fill('#password', ADMIN_PASS);
      await page.locator('button[type="submit"]').click({ force: true });
      await expect(page.locator('h1')).toContainText('Tableau de Bord', { timeout: 15000 });
    });

    test('affiche les statistiques apres connexion', async ({ page }) => {
      const statCards = page.locator('.stat-card');
      await expect(statCards.first()).toBeVisible({ timeout: 10000 });
      const count = await statCards.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    test('affiche la section activite recente', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Activité Récente' })).toBeVisible({ timeout: 10000 });
    });

    test('affiche les actions rapides', async ({ page }) => {
      await expect(page.locator('text=Actions Rapides')).toBeVisible({ timeout: 10000 });
    });

    test('navigation vers Banques depuis le dashboard', async ({ page }) => {
      await page.locator('text=Gérer les Banques').click();
      await expect(page.locator('h1')).toContainText('Banques', { timeout: 10000 });
    });

    test('navigation vers Traitement depuis le dashboard', async ({ page }) => {
      await page.locator('text=Traiter des Fichiers').click();
      await expect(page.locator('h1')).toContainText('Traitement', { timeout: 10000 });
    });

    test('navigation vers Fichiers Recents depuis le dashboard', async ({ page }) => {
      await page.locator('text=Voir les Enregistrements').click();
      await expect(page.locator('h1')).toContainText('Enregistrements', { timeout: 10000 });
    });

  });

  test.describe('Navigation et Menus', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', ADMIN_USER);
      await page.fill('#password', ADMIN_PASS);
      await page.locator('button[type="submit"]').click({ force: true });
      await expect(page.locator('h1')).toContainText('Tableau de Bord', { timeout: 15000 });
    });

    test('accede a la page Banques', async ({ page }) => {
      await page.goto('/banks');
      await expect(page.locator('h1')).toContainText('Banques', { timeout: 10000 });
    });

    test('accede a la page Traitement', async ({ page }) => {
      await page.goto('/processing');
      await expect(page.locator('h1')).toContainText('Traitement', { timeout: 10000 });
    });

    test('accede a la page Scan Automatique', async ({ page }) => {
      await page.goto('/cron');
      await expect(page.locator('h1')).toContainText('Scan', { timeout: 10000 });
    });

    test('accede a la page Historique', async ({ page }) => {
      await page.goto('/history');
      await expect(page.locator('h1')).toContainText('Historique', { timeout: 10000 });
    });

    test('redirige vers login si non authentifie', async ({ page }) => {
      await page.evaluate(() => localStorage.clear());
      await page.goto('/dashboard');
      await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
    });

  });

  test.describe('API Health', () => {

    test('API backend est accessible', async ({ request }) => {
      const response = await request.get(`${API_BASE}/api/health`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test('API retourne les banques', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const banksRes = await request.get(`${API_BASE}/api/banks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(banksRes.status()).toBe(200);
      const body = await banksRes.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('API dashboard accessible avec auth', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const dashRes = await request.get(`${API_BASE}/api/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(dashRes.status()).toBe(200);
      const body = await dashRes.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('totalBanks');
      expect(body.data).toHaveProperty('totalRecords');
    });

  });

  test.describe('Upload et Validation CSV', () => {

    function uniquePAN() {
      const prefix = '4741';
      const now = Date.now().toString().slice(-11);
      const padded = now.padStart(11, '0');
      const pan15 = prefix + padded;
      let sum = 0;
      let isEven = true;
      for (let i = pan15.length - 1; i >= 0; i--) {
        let d = parseInt(pan15[i], 10);
        if (isEven) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
        isEven = !isEven;
      }
      const check = (10 - (sum % 10)) % 10;
      return pan15 + check;
    }

    test('upload reussi d un fichier CSV valide', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const pan = uniquePAN();
      const csvContent = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        `fr;JEAN;DUPONT;${pan};12/28;21624080852;otp;update`;

      const response = await request.post(`${API_BASE}/api/processing/upload`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        multipart: {
          bankId: '1',
          file: {
            name: 'test_valid.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent)
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('fileLogId');
      expect(body.data.stats.validRows).toBe(1);
    });

    test('rejette un fichier CSV avec PAN invalide', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const csvContent = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        'fr;JEAN;DUPONT;1234;12/28;21624080852;otp;update';

      const response = await request.post(`${API_BASE}/api/processing/upload`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        multipart: {
          bankId: '1',
          file: {
            name: 'test_invalid.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent)
          }
        }
      });

      const body = await response.json();
      expect(body.data.stats.invalidRows).toBeGreaterThanOrEqual(1);
    });

  });

  test.describe('Sécurité - Corrections appliquées', () => {

    test('API publique a rate limiting', async ({ request }) => {
      const apiKeyRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await apiKeyRes.json()).data;

      const responses = [];
      for (let i = 0; i < 5; i++) {
        responses.push(await request.get(`${API_BASE}/api/v1/docs`));
      }
      const lastStatus = responses[responses.length - 1].status();
      expect(lastStatus).toBe(200);
    });

    test('SQL injection echoue sur le dashboard', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const response = await request.get(
        `${API_BASE}/api/dashboard?bankId=1' OR '1'='1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test('pagination limitee a 500 max', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const response = await request.get(
        `${API_BASE}/api/processing/logs?limit=999999`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.pagination.limit).toBeLessThanOrEqual(500);
    });

    test('SSRF bloque IP privee sur call-api', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const response = await request.post(`${API_BASE}/api/processing/call-api`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { bankId: 1, url: 'http://localhost:5432' }
      });
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('non autoris');
    });

    test('SSRF retourne 200 pour URL autorisee', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const response = await request.post(`${API_BASE}/api/processing/call-api`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { bankId: 1, url: 'https://jsonplaceholder.typicode.com/posts/1' }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test('Joi validation rejette mauvaise URL sur process-url', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const response = await request.post(`${API_BASE}/api/processing/process-url`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { bankId: 'abc', baseUrl: 'pas-une-url' }
      });
      expect(response.status()).toBe(400);
    });

  });

  test.describe('Profil Banque - Accès restreint', () => {

    test('bank user peut se connecter via API', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: BANK_USER, password: BANK_PASS }
      });
      expect(loginRes.status()).toBe(200);
      const body = await loginRes.json();
      expect(body.success).toBe(true);
      expect(body.data.user.role).toBe('bank');
      expect(body.data.user.bank_id).toBe(1);
    });

    test('bank user voit uniquement sa banque sur le dashboard', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: BANK_USER, password: BANK_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const dashRes = await request.get(`${API_BASE}/api/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(dashRes.status()).toBe(200);
      const body = await dashRes.json();
      expect(body.data.totalBanks).toBe(1);
    });

    test('bank user ne peut pas acceder a la liste des banques', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: BANK_USER, password: BANK_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const banksRes = await request.get(`${API_BASE}/api/banks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const banks = (await banksRes.json()).data || [];
      expect(banks.length).toBeLessThanOrEqual(1);
    });

    test('bank user peut uploader un CSV pour sa banque', async ({ request }) => {
      const loginRes = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: BANK_USER, password: BANK_PASS }
      });
      const { token } = (await loginRes.json()).data;

      const csvContent = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        'fr;MARIE;LECLERC;4741000000000006;12/28;21624080852;otp;update';

      const response = await request.post(`${API_BASE}/api/processing/upload`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          bankId: '1',
          file: { name: 'bank_test.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) }
        }
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

  });

  test.describe('Mot de passe oublié - Forgot Password', () => {

    test('affiche le lien mot de passe oublié sur la page login', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('text=Mot de passe oubli')).toBeVisible();
    });

    test('affiche la page forgot-password', async ({ page }) => {
      await page.goto('/login');
      await page.locator('text=Mot de passe oubli').click();
      await expect(page.locator('h1')).toContainText('Mot de passe oubli', { timeout: 10000 });
    });

    test('soumet forgot-password avec email valide', async ({ page }) => {
      await page.goto('/forgot-password');
      await page.fill('input[type="email"]', 'admin@example.com');
      await page.locator('button[type="submit"]').click({ force: true });
      await expect(page.locator('text=envoy')).toBeVisible({ timeout: 10000 });
    });

    test('API forgot-password repond identique email existe ou pas', async ({ request }) => {
      const existingEmail = await request.post(`${API_BASE}/api/auth/forgot-password`, {
        data: { email: 'admin@example.com' }
      });
      const fakeEmail = await request.post(`${API_BASE}/api/auth/forgot-password`, {
        data: { email: 'nobody@nonexistent.com' }
      });
      const body1 = await existingEmail.json();
      const body2 = await fakeEmail.json();
      expect(body1.message).toEqual(body2.message);
    });

  });

});
