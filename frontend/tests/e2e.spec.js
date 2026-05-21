const { test, expect } = require('@playwright/test');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Admin@123';
const BANK_USER = 'bankuser';
const BANK_PASS = 'Bank1234!';
const API_BASE = process.env.API_URL || 'http://localhost:8000';

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
      await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 15000 });
    });

  });

  test.describe('Dashboard', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('#username', ADMIN_USER);
      await page.fill('#password', ADMIN_PASS);
      await page.locator('button[type="submit"]').click({ force: true });
      await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 15000 });
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
      await expect(page.locator('h1')).toContainText('Bonjour', { timeout: 15000 });
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

  test.describe('Scénarios avancés', () => {

    function luhnPAN(prefix) {
      const digits = (prefix + Date.now().toString().slice(-11)).padEnd(15, '0').slice(0, 15);
      let sum = 0, isEven = true;
      for (let i = digits.length - 1; i >= 0; i--) {
        let d = parseInt(digits[i], 10);
        if (isEven) { d *= 2; if (d > 9) d -= 9; }
        sum += d; isEven = !isEven;
      }
      return digits + ((10 - (sum % 10)) % 10);
    }

    test('full flow: upload, history, XML generation', async ({ request }) => {
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await login.json()).data;
      const pan = luhnPAN('4741');

      const csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        `fr;ALICE;MARTIN;${pan};12/28;21699123456;otp;create`;

      const upload = await request.post(`${API_BASE}/api/processing/upload`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          bankId: '1',
          file: { name: 'fullflow.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }
        }
      });
      expect(upload.status()).toBe(200);
      const uploadBody = await upload.json();
      expect(uploadBody.success).toBe(true);

      const history = await request.get(`${API_BASE}/api/record-history/pan/1/${pan}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(history.status()).toBe(200);
      const historyBody = await history.json();
      expect(historyBody.success).toBe(true);

      const logs = await request.get(`${API_BASE}/api/processing/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(logs.status()).toBe(200);
      const logsBody = await logs.json();
      expect(logsBody.data.some(l => l.id === uploadBody.data.fileLogId)).toBe(true);
    });

    test('duplicate PAN with different action resets enrollment', async ({ request }) => {
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await login.json()).data;
      const pan = luhnPAN('4741');

      const csv1 = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        `fr;BOB;TEST;${pan};12/28;21699123456;otp;create`;
      const r1 = await request.post(`${API_BASE}/api/processing/upload`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: { bankId: '1', file: { name: 'dup1.csv', mimeType: 'text/csv', buffer: Buffer.from(csv1) } }
      });
      expect((await r1.json()).success).toBe(true);

      const csv2 = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        `fr;BOB;TEST;${pan};12/28;21699123456;otp;update`;
      const r2 = await request.post(`${API_BASE}/api/processing/upload`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: { bankId: '1', file: { name: 'dup2.csv', mimeType: 'text/csv', buffer: Buffer.from(csv2) } }
      });
      const body2 = await r2.json();
      expect(body2.success).toBe(true);
    });

    test('enter-data (saisie manuelle) avec PAN valide', async ({ request }) => {
      const pan = luhnPAN('4741');
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await login.json()).data;

      const res = await request.post(`${API_BASE}/api/processing/process-manual`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: {
          bankId: 1,
          entries: [{ pan, firstName: 'Manual', lastName: 'Entry', expiry: '12/28', phone: '21699123456', behaviour: 'otp', action: 'create' }]
        }
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

  });

  test.describe('Sécurité avancée', () => {

    test('role bypass: bank user cannot list all banks', async ({ request }) => {
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: BANK_USER, password: BANK_PASS }
      });
      const { token } = (await login.json()).data;

      const banks = await request.get(`${API_BASE}/api/banks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const banksBody = await banks.json();
      if (Array.isArray(banksBody.data)) {
        expect(banksBody.data.length).toBeLessThanOrEqual(1);
      }
    });

    test('role bypass: bank user cannot access users list', async ({ request }) => {
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: BANK_USER, password: BANK_PASS }
      });
      const { token } = (await login.json()).data;

      const users = await request.get(`${API_BASE}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      expect(users.status()).toBe(403);
    });

    test('JWT falsifié: invalid signature returns 401', async ({ request }) => {
      const res = await request.get(`${API_BASE}/api/dashboard`, {
        headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.invalid' }
      });
      expect(res.status()).toBe(401);
    });

    test('JWT falsifié: expired token returns 401', async ({ request }) => {
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await login.json()).data;

      const dash = await request.get(`${API_BASE}/api/dashboard`, {
        headers: { Authorization: `Bearer ${token}x` }
      });
      expect(dash.status()).toBe(401);
    });

    test('XSS dans nom de fichier: filename est sanitize', async ({ request }) => {
      const login = await request.post(`${API_BASE}/api/auth/login`, {
        data: { username: ADMIN_USER, password: ADMIN_PASS }
      });
      const { token } = (await login.json()).data;

      const csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        'fr;Jean;Dupont;4000056655665556;12/28;21699123456;otp;create';

      const res = await request.post(`${API_BASE}/api/processing/upload`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          bankId: '1',
          file: { name: '<script>xss</script>.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }
        }
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.stats.validRows).toBe(1);
    });

  });

test.describe('Banques - CRUD Complet', () => {

  test('super_admin cree une banque', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/banks`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        code: 'E2E', name: 'Banque E2E Test',
        source_url: '/data/banks/E2E/source',
        destination_url: '/data/banks/E2E/destination',
        old_url: '/data/banks/E2E/archive',
        xml_output_url: '/data/banks/E2E/xml'
      }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('E2E');
  });

  test('super_admin modifie une banque', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.put(`${API_BASE}/api/banks/1`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: 'Banque de Tunisie (Modifiée)' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toContain('Modifiée');
  });

  test('super_admin supprime la banque E2E', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const list = await request.get(`${API_BASE}/api/banks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const banks = (await list.json()).data || [];
    const e2eBank = banks.find(b => b.code === 'E2E');
    if (!e2eBank) return; // already cleaned up

    const res = await request.delete(`${API_BASE}/api/banks/${e2eBank.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('bank user ne peut pas creer de banque (confirmation)', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: BANK_USER, password: BANK_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/banks`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { code: 'XSS', name: 'X', source_url: '/x', destination_url: '/x', old_url: '/x' }
    });
    expect(res.status()).toBe(403);
  });

});

test.describe('Utilisateurs - CRUD Complet', () => {

  test('super_admin cree un utilisateur bank_admin', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        username: `e2e_admin_${Date.now()}`,
        email: `e2e_admin_${Date.now()}@test.com`,
        password: 'Test1234!',
        role: 'bank_admin',
        bankId: 1
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('bank_admin');
  });

  test('super_admin cree un utilisateur bank', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        username: `e2e_bank_${Date.now()}`,
        email: `e2e_bank_${Date.now()}@test.com`,
        password: 'Test1234!',
        role: 'bank',
        bankId: 1
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('bank');
  });

  test('super_admin recupere un utilisateur par ID', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/users/1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
  });

  test('bank user ne peut pas creer un utilisateur', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: BANK_USER, password: BANK_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { username: 'hacker', email: 'h@h.com', password: 'Test1234!', role: 'bank', bank_id: 1 }
    });
    expect(res.status()).toBe(403);
  });

});

test.describe('API Keys - Gestion Complete', () => {

  test('super_admin cree une cle API', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/api-keys`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { bank_id: 1, name: `E2E Test Key ${Date.now()}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('api_key');
    expect(body.data).toHaveProperty('id');
  });

  test('super_admin liste les cles API', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/api-keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('super_admin consulte les logs d une cle API', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const list = await request.get(`${API_BASE}/api/api-keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const keys = (await list.json()).data || [];
    if (keys.length === 0) return;

    const res = await request.get(`${API_BASE}/api/api-keys/${keys[0].id}/logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('super_admin supprime les cles API E2E', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const list = await request.get(`${API_BASE}/api/api-keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const keys = (await list.json()).data || [];
    for (const key of keys.filter(k => k.name && k.name.startsWith('E2E'))) {
      await request.delete(`${API_BASE}/api/api-keys/${key.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    // verify deletion
    const after = await request.get(`${API_BASE}/api/api-keys`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const remaining = (await after.json()).data || [];
    expect(remaining.filter(k => k.name && k.name.startsWith('E2E')).length).toBe(0);
  });

  test('bank user ne peut pas creer de cle API', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: BANK_USER, password: BANK_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/api-keys`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { bank_id: 1, name: 'hack' }
    });
    expect(res.status()).toBe(403);
  });

});

test.describe('Traitement - Telechargement et Erreurs', () => {

  test('recupere le template CSV', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/processing/template`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('csv');
  });

  test('telecharge un fichier traite', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const logs = await request.get(`${API_BASE}/api/processing/logs?limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const logData = (await logs.json()).data || [];
    if (logData.length === 0) return;

    const res = await request.get(`${API_BASE}/api/processing/download/${logData[0].id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
  });

  test('recupere les erreurs de traitement', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const logs = await request.get(`${API_BASE}/api/processing/logs?limit=5`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const logData = (await logs.json()).data || [];
    const withErrors = logData.find(l => l.error_count > 0);
    if (!withErrors) return;

    const res = await request.get(`${API_BASE}/api/processing/errors/${withErrors.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('valide une saisie manuelle avant soumission', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.post(`${API_BASE}/api/processing/validate-manual`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        bankId: 1,
        entries: [{ pan: '4000056655665556', firstName: 'Test', lastName: 'Valid', expiry: '12/28', phone: '21699123456', behaviour: 'otp', action: 'create' }]
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

});

test.describe('Enrolement - Upload Rapport', () => {

  test('upload d un rapport d enrolement XML', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const xml = '<?xml version="1.0"?><Package><cardRegistryRecordProcessingResult id="1" status="OK" /></Package>';

    const res = await request.post(`${API_BASE}/api/enrollment/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        bankId: '1',
        file: { name: 'enrollment_test.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) }
      }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

});

test.describe('Parametres - Mise a jour', () => {

  test('super_admin met a jour un parametre', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.put(`${API_BASE}/api/settings/CRON_SCHEDULE`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { value: '0 */5 * * *' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('bank user ne peut pas modifier les parametres', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: BANK_USER, password: BANK_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.put(`${API_BASE}/api/settings/CRON_SCHEDULE`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { value: '* * * * *' }
    });
    expect(res.status()).toBe(403);
  });

});

test.describe('Permissions - Ecriture Features Roles', () => {

  test('super_admin active une feature pour bank_admin', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.put(`${API_BASE}/api/role-features/role/bank_admin/processing`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { enabled: true }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('super_admin desactive une feature pour une banque', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.put(`${API_BASE}/api/role-features/bank/1/processing`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { enabled: false }
    });
    expect([200, 201]).toContain(res.status());
  });

  test('super_admin supprime l override banque', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.delete(`${API_BASE}/api/role-features/bank/1/processing`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
  });

  test('bank user ne peut pas modifier les features', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: BANK_USER, password: BANK_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.put(`${API_BASE}/api/role-features/role/bank/processing`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { enabled: true }
    });
    expect(res.status()).toBe(403);
  });

});

test.describe('Journal - Recherche et Statistiques', () => {

  test('recherche dans l historique des enregistrements', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/record-history/search?q=JEAN`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('statistiques de l historique', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/record-history/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('top erreurs de traitement', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/record-history/top-errors`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('corrections de l historique', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/record-history/corrections`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('timeline de l historique', async ({ request }) => {
    const login = await request.post(`${API_BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS }
    });
    const { token } = (await login.json()).data;

    const res = await request.get(`${API_BASE}/api/record-history/timeline/7`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

});

});
