const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const supertest = require('supertest');

jest.setTimeout(30000);

const TEST_PREFIX = 'E2E';
const E2E_ADMIN_PASSWORD = 'E2e-Admin#2026';
const DEFAULT_ADMIN_HASH = '$2a$10$v57TI8GSY9ZdFccfJUYV8OUgb1sGwVt2q5HaycS8kR7l6XaOnxzzq'; // Admin@123
let db;
let app;
let request;
let adminToken;
let bankId;
let userId;

beforeAll(async () => {
  // Create temp directories for E2E test file operations
  const { mkdirSync } = require('fs');
  mkdirSync('/tmp/e2e/source', { recursive: true });
  mkdirSync('/tmp/e2e/destination', { recursive: true });
  mkdirSync('/tmp/e2e/archive', { recursive: true });
  mkdirSync('/tmp/e2e/xml', { recursive: true });

  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5432';
  process.env.DB_USER = 'banking_user';
  process.env.DB_PASSWORD = 'banking_password';
  process.env.DB_NAME = 'banking_db';
  process.env.JWT_SECRET = 'dev_secret_key_not_for_production_use_only_12345678901234567890';
  process.env.JWT_EXPIRE = '24h';
  process.env.PAN_ENCRYPTION_KEY = 'dev-encryption-key-32chars!xyz';
  process.env.CORS_ORIGIN = 'http://localhost:3000';
  process.env.PORT = '0';
  process.env.TZ = 'Africa/Tunis';

  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  db = { query: (text, params) => pool.query(text, params), pool };

  await db.query('SELECT NOW()');

  jest.isolateModules(() => {
    app = require('../../server');
    require('../../services/worker');
  });

  request = supertest(app);

  await new Promise(r => setTimeout(r, 1500));
});

afterAll(async () => {
  try {
    // Remet le compte admin dans son état d'installation (mot de passe par défaut à changer)
    await db.query(
      "UPDATE users SET password = $1, must_change_password = true, token_version = 0 WHERE username = 'admin'",
      [DEFAULT_ADMIN_HASH]
    );
    await db.query(`DELETE FROM audit_logs WHERE username LIKE '${TEST_PREFIX}%'`);
    await db.query(`DELETE FROM record_history_details WHERE history_id IN (SELECT id FROM record_history WHERE username LIKE '${TEST_PREFIX}%')`);
    await db.query(`DELETE FROM record_history WHERE username LIKE '${TEST_PREFIX}%'`);
    await db.query(`DELETE FROM validation_errors WHERE file_log_id IN (SELECT id FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%'))`);
    await db.query(`DELETE FROM processed_records WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%')`);
    await db.query(`DELETE FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%')`);
    await db.query(`DELETE FROM api_rate_limits WHERE api_key_id IN (SELECT id FROM api_keys WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%'))`);
    await db.query(`DELETE FROM xml_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%')`);
    await db.query(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`);
    await db.query(`DELETE FROM banks WHERE code LIKE '${TEST_PREFIX}%'`);
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
  await db.pool.end();
});

describe('E2E: Health & Authentication', () => {
  it('GET /api/health returns 200 with DB operational', async () => {
    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('operationnelles');
  });

  it('POST /api/auth/login as admin returns JWT token', async () => {
    const res = await request.post('/api/auth/login').send({
      username: 'admin',
      password: 'Admin@123'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('super_admin');
    adminToken = res.body.data.token;
  });

  it('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await request.post('/api/auth/login').send({
      username: 'admin',
      password: 'wrong_password'
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/password-status returns password info', async () => {
    const res = await request.get('/api/auth/password-status').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.must_change_password).toBe(true);
  });

  it('blocks protected routes until the default password is changed', async () => {
    const res = await request.get('/api/banks').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('rejects a weak new password', async () => {
    const res = await request.put('/api/auth/change-password').set('Authorization', `Bearer ${adminToken}`).send({
      currentPassword: 'Admin@123',
      newPassword: 'weakpass'
    });
    expect(res.status).toBe(400);
  });

  it('PUT /api/auth/change-password changes the password and returns a fresh token', async () => {
    const oldToken = adminToken;
    const res = await request.put('/api/auth/change-password').set('Authorization', `Bearer ${adminToken}`).send({
      currentPassword: 'Admin@123',
      newPassword: E2E_ADMIN_PASSWORD
    });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    adminToken = res.body.data.token;

    // L'ancien jeton est révoqué
    const revoked = await request.get('/api/auth/password-status').set('Authorization', `Bearer ${oldToken}`);
    expect(revoked.status).toBe(401);
  });
});

describe('E2E: Banks CRUD', () => {
  it('GET /api/banks lists all banks', async () => {
    const res = await request.get('/api/banks').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/banks creates a new bank', async () => {
    const code = `${TEST_PREFIX}bank`;
    const res = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
      code,
      name: 'E2E Test Bank',
      source_url: '/tmp/e2e/source',
      destination_url: '/tmp/e2e/destination',
      old_url: '/tmp/e2e/archive',
      xml_output_url: '/tmp/e2e/xml'
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe(code.toUpperCase());
    bankId = res.body.data.id;
  });

  it('POST /api/banks rejects duplicate code', async () => {
    const res = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
      code: `${TEST_PREFIX}bank`,
      name: 'Duplicate Bank',
      source_url: '/tmp/e2e/source',
      destination_url: '/tmp/e2e/dest',
      old_url: '/tmp/e2e/archive',
      xml_output_url: '/tmp/e2e/xml'
    });
    expect(res.status).toBe(409);
  });

  it('PUT /api/banks/:id updates bank', async () => {
    const res = await request.put(`/api/banks/${bankId}`).set('Authorization', `Bearer ${adminToken}`).send({
      name: 'E2E Test Bank Updated'
    });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('E2E Test Bank Updated');
  });

  it('GET /api/banks/:id returns single bank', async () => {
    const res = await request.get(`/api/banks/${bankId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(bankId);
  });
});

describe('E2E: Users CRUD', () => {
  it('GET /api/users lists users', async () => {
    const res = await request.get('/api/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/users creates a bank user', async () => {
    const res = await request.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
      username: `${TEST_PREFIX}user`,
      password: 'TestPassword123!',
      email: `${TEST_PREFIX}user@test.com`,
      role: 'bank',
      bankId: bankId
    });
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe(`${TEST_PREFIX}user`);
    userId = res.body.data.id;
  });

  it('GET /api/users/:id returns user', async () => {
    const res = await request.get(`/api/users/${userId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(userId);
  });

  it('PUT /api/users/:id updates user', async () => {
    const res = await request.put(`/api/users/${userId}`).set('Authorization', `Bearer ${adminToken}`).send({
      email: `${TEST_PREFIX}user_updated@test.com`
    });
    expect(res.status).toBe(200);
  });
});

describe('E2E: Settings & Features', () => {
  it('GET /api/settings returns settings', async () => {
    const res = await request.get('/api/settings').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/role-features returns features for admin', async () => {
    const res = await request.get('/api/role-features/me').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

async function pollJobCompletion(jobId, maxRetries = 20, interval = 500) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await request.get(`/api/processing/status/${jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    if (res.body.data.status === 'completed' || res.body.data.status === 'failed') {
      return res.body.data;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Job ${jobId} did not complete within ${maxRetries * interval}ms`);
}

describe('E2E: Processing & Records', () => {
  const csvContent = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;Jean;Dupont;4000056655665556;12/28;21612345678;otp;create';

  it('POST /api/processing/upload processes a CSV file', async () => {
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('bankId', bankId.toString())
      .attach('file', Buffer.from(csvContent, 'utf8'), 'test_cards.csv');
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBeDefined();
    expect(res.body.data.status).toBe('pending');

    const job = await pollJobCompletion(res.body.data.jobId);
    if (job.status === 'failed') {
      console.error('Job failed error:', job.error);
    }
    expect(job.status).toBe('completed');
    expect(job.result).toBeDefined();
    expect(job.result.success).toBe(true);
  });

  it('POST /api/processing/upload returns validation errors for bad PAN', async () => {
    const badCsv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;Pierre;Martin;1234;12/28;21687654321;sms;create';
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('bankId', bankId.toString())
      .attach('file', Buffer.from(badCsv, 'utf8'), 'bad_cards.csv');
    expect(res.status).toBe(202);
    expect(res.body.data.jobId).toBeDefined();

    const job = await pollJobCompletion(res.body.data.jobId);
    if (job.status === 'failed') {
      console.error('Bad PAN job failed error:', job.error);
    }
    expect(job.status).toBe('completed');
    expect(job.result.errors.length).toBeGreaterThan(0);
  });

  it('GET /api/records returns records with filters', async () => {
    const res = await request.get(`/api/records?bankId=${bankId}&limit=10`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/dashboard returns stats', async () => {
    const res = await request.get('/api/dashboard').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('E2E: History & Audit', () => {
  it('GET /api/history returns history entries', async () => {
    const res = await request.get(`/api/history?bankId=${bankId}&limit=10`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/audit-logs returns audit entries', async () => {
    const res = await request.get('/api/audit-logs?limit=10').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /api/record-history/search returns history', async () => {
    const res = await request.get(`/api/record-history/search?bankId=${bankId}&limit=10`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('E2E: API Keys', () => {
  let apiKeyId;

  it('POST /api/api-keys creates an API key', async () => {
    const res = await request.post('/api/api-keys').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'E2E Test Key',
      bank_id: bankId
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.api_key).toContain('acs_');
    apiKeyId = res.body.data.id;
  });

  it('GET /api/api-keys lists keys', async () => {
    const res = await request.get('/api/api-keys').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/api-keys/:id deletes key', async () => {
    const res = await request.delete(`/api/api-keys/${apiKeyId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('E2E: XML Logs & Monitoring', () => {
  it('GET /api/xml-logs returns logs', async () => {
    const res = await request.get(`/api/xml-logs?bankId=${bankId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/monitoring/health returns system health', async () => {
    const res = await request.get('/api/monitoring/health').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.globalStatus).toBeDefined();
  });

  it('GET /api/scanner/status returns scanner info', async () => {
    const res = await request.get('/api/scanner/status').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('E2E: Role-based access control', () => {
  let bankUserToken;

  it('bank user login succeeds', async () => {
    const res = await request.post('/api/auth/login').send({
      username: `${TEST_PREFIX}user`,
      password: 'TestPassword123!'
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('bank');
    // Compte créé par un administrateur : changement de mot de passe obligatoire
    expect(res.body.data.must_change_password).toBe(true);
    bankUserToken = res.body.data.token;

    const changed = await request.put('/api/auth/change-password').set('Authorization', `Bearer ${bankUserToken}`).send({
      currentPassword: 'TestPassword123!',
      newPassword: 'NewTestPassword456!'
    });
    expect(changed.status).toBe(200);
    bankUserToken = changed.body.data.token;
  });

  it('bank user is blocked from admin endpoints', async () => {
    const res = await request.get('/api/users').set('Authorization', `Bearer ${bankUserToken}`);
    expect(res.status).toBe(403);
  });

  it('bank user sees own bank stats', async () => {
    const res = await request.get('/api/dashboard').set('Authorization', `Bearer ${bankUserToken}`);
    expect(res.status).toBe(200);
  });
});

describe('E2E: Security & processing pipeline', () => {
  const fsNode = require('fs');
  const cryptoNode = require('crypto');
  let bankToken;
  let otherBankFileLogId;

  beforeAll(async () => {
    const login = await request.post('/api/auth/login').send({ username: `${TEST_PREFIX}user`, password: 'NewTestPassword456!' });
    bankToken = login.body.data.token;

    // Fichier traité appartenant à une AUTRE banque (banque BT de l'installation)
    const other = await db.query(
      `INSERT INTO file_logs (bank_id, file_name, original_path, status, source_type)
       SELECT id, 'E2E_other_bank.csv', 'sftp://user:topsecret@host/in/E2E_other_bank.csv', 'validation_error', 'cron'
       FROM banks WHERE code = 'BT' RETURNING id`
    );
    otherBankFileLogId = other.rows[0].id;
  });

  afterAll(async () => {
    await db.query("DELETE FROM file_logs WHERE file_name = 'E2E_other_bank.csv'");
  });

  it('stores the PAN encrypted with a keyed (HMAC) fingerprint', async () => {
    const res = await db.query(
      "SELECT pan, pan_hash FROM processed_records WHERE bank_id = $1 AND file_name = 'test_cards.csv'",
      [bankId]
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].pan).not.toContain('4000056655665556');
    const legacySha = cryptoNode.createHash('sha256').update('4000056655665556').digest('hex');
    expect(res.rows[0].pan_hash).not.toBe(legacySha);
    expect(res.rows[0].pan_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never keeps a clear PAN in the record history or the validation errors', async () => {
    const history = await db.query('SELECT data_received FROM record_history WHERE bank_id = $1', [bankId]);
    expect(history.rows.length).toBeGreaterThan(0);
    for (const row of history.rows) {
      expect(JSON.stringify(row.data_received)).not.toMatch(/\d{12,19}/);
    }
    const details = await db.query(
      `SELECT d.field_value FROM record_history_details d JOIN record_history h ON d.history_id = h.id
       WHERE h.bank_id = $1 AND d.field_name = 'pan'`, [bankId]
    );
    for (const row of details.rows) expect(row.field_value || '').not.toMatch(/\d{12,19}/);

    const errors = await db.query(
      `SELECT ve.field_value FROM validation_errors ve JOIN file_logs fl ON ve.file_log_id = fl.id
       WHERE fl.bank_id = $1 AND ve.field_name = 'pan'`, [bankId]
    );
    expect(errors.rows.length).toBeGreaterThan(0);
    for (const row of errors.rows) expect(row.field_value).not.toBe('1234');
  });

  it('writes the XML file and links it to the processed file', async () => {
    const xml = await db.query(
      `SELECT xl.xml_file_path, xl.xml_entries_count, fl.status FROM xml_logs xl JOIN file_logs fl ON xl.file_log_id = fl.id
       WHERE fl.bank_id = $1 AND fl.file_name = 'test_cards.csv' ORDER BY xl.id DESC LIMIT 1`, [bankId]
    );
    expect(xml.rows.length).toBe(1);
    expect(xml.rows[0].status).toBe('success');
    expect(xml.rows[0].xml_entries_count).toBe(2);
    const content = fsNode.readFileSync(xml.rows[0].xml_file_path, 'latin1');
    expect(content).toContain('cardNumber="4000056655665556"');
    expect(content).toContain('phoneNumber="+21612345678"');
  });

  it('a bank user cannot read or download another bank\'s files', async () => {
    const endpoints = [
      `/api/processing/download/${otherBankFileLogId}`,
      `/api/processing/errors/${otherBankFileLogId}`,
      `/api/history/${otherBankFileLogId}`
    ];
    for (const url of endpoints) {
      const res = await request.get(url).set('Authorization', `Bearer ${bankToken}`);
      expect(res.status).toBe(403);
    }
    const reprocess = await request.post(`/api/processing/reprocess/${otherBankFileLogId}`).set('Authorization', `Bearer ${bankToken}`);
    expect(reprocess.status).toBe(403);
  });

  it('a bank user only lists its own processing logs and banks', async () => {
    const logs = await request.get('/api/processing/logs?bankId=1').set('Authorization', `Bearer ${bankToken}`);
    expect(logs.status).toBe(200);
    expect(logs.body.data.every(l => l.bank_id === bankId)).toBe(true);

    const other = await db.query("SELECT id FROM banks WHERE code = 'BT'");
    const bank = await request.get(`/api/banks/${other.rows[0].id}`).set('Authorization', `Bearer ${bankToken}`);
    expect(bank.status).toBe(403);
  });

  it('never returns SFTP credentials stored in URLs', async () => {
    const res = await request.get(`/api/history/${otherBankFileLogId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('topsecret');
    expect(res.body.data.original_path).toContain(':***@');
  });

  it('refuses a user-supplied URL pointing to the internal network (SSRF)', async () => {
    const res = await request.post('/api/processing/process-url').set('Authorization', `Bearer ${adminToken}`)
      .send({ bankId, baseUrl: 'http://169.254.169.254/latest' });
    expect(res.status).toBe(400);
    const api = await request.post('/api/processing/call-api').set('Authorization', `Bearer ${bankToken}`)
      .send({ bankId, url: 'http://127.0.0.1:6379/' });
    expect(api.status).toBe(400);
  });

  it('refuses invalid manual entries before they reach the queue', async () => {
    const res = await request.post('/api/processing/process-manual').set('Authorization', `Bearer ${bankToken}`)
      .send({ entries: [{ pan: '123', phone: 'x', expiry: '99/99' }] });
    expect(res.status).toBe(400);
    expect(res.body.data.invalidEntries.length).toBe(1);
  });

  it('public API: a key only works for its own bank and never logs the clear PAN', async () => {
    const created = await request.post('/api/api-keys').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E bound key', bankId });
    expect(created.status).toBe(200);
    const apiKey = created.body.data.api_key;
    expect(created.body.data.key_hash).toBeUndefined();

    const stored = await db.query('SELECT api_key, key_hash FROM api_keys WHERE id = $1', [created.body.data.id]);
    expect(stored.rows[0].api_key).toBeNull();
    expect(stored.rows[0].key_hash).toBe(cryptoNode.createHash('sha256').update(apiKey).digest('hex'));

    const card = { pan: '5555555555554444', phone: '+21611223344', expiry: '12/29' };
    const forbidden = await request.post('/api/v1/cards/validate').set('X-API-Key', apiKey).send({ bankCode: 'BT', cards: [card] });
    expect(forbidden.status).toBe(403);

    const ok = await request.post('/api/v1/cards/validate').set('X-API-Key', apiKey).send({ bankCode: `${TEST_PREFIX}BANK`, cards: [card] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.validCount).toBe(1);

    const logs = await db.query('SELECT request_body, response_body FROM api_logs WHERE api_key_id = $1', [created.body.data.id]);
    expect(logs.rows.length).toBe(2);
    for (const row of logs.rows) {
      expect(row.request_body).not.toContain('5555555555554444');
      expect(row.response_body).not.toContain('5555555555554444');
    }

    await db.query('DELETE FROM api_logs WHERE api_key_id = $1', [created.body.data.id]);
    await db.query('DELETE FROM api_keys WHERE id = $1', [created.body.data.id]);
  });

  it('scanner: processes a new file, archives it THEN moves it, and writes the XML', async () => {
    const fileName = `E2E_scan_${Date.now()}.csv`;
    fsNode.writeFileSync(`/tmp/e2e/source/${fileName}`,
      'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;Scan;Test;4111111111111111;12/28;21698765432;otp;create\n');
    await db.query("DELETE FROM settings WHERE key = 'scan_last_run'");

    const res = await request.post('/api/scanner/trigger').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    expect(fsNode.existsSync(`/tmp/e2e/source/${fileName}`)).toBe(false);
    expect(fsNode.existsSync(`/tmp/e2e/destination/${fileName}`)).toBe(true);
    const archived = fsNode.readdirSync('/tmp/e2e/archive').filter(f => f.startsWith('OLD_') && f.endsWith(fileName));
    expect(archived.length).toBe(1);

    const log = await db.query(
      "SELECT fl.status, fl.archive_status, fl.source_type, xl.xml_file_path FROM file_logs fl LEFT JOIN xml_logs xl ON xl.file_log_id = fl.id WHERE fl.bank_id = $1 AND fl.file_name = $2",
      [bankId, fileName]
    );
    expect(log.rows[0].status).toBe('success');
    expect(log.rows[0].archive_status).toBe('success');
    expect(log.rows[0].source_type).toBe('cron');
    expect(fsNode.existsSync(log.rows[0].xml_file_path)).toBe(true);
  });

  it('scanner: a rejected file is not reprocessed at every scan while unchanged', async () => {
    const fileName = `E2E_bad_${Date.now()}.csv`;
    fsNode.writeFileSync(`/tmp/e2e/source/${fileName}`,
      'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;Bad;Card;1234;12/28;21698765432;otp;create\n');

    for (let i = 0; i < 2; i++) {
      await db.query("DELETE FROM settings WHERE key = 'scan_last_run'");
      const res = await request.post('/api/scanner/trigger').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    }

    const logs = await db.query('SELECT status FROM file_logs WHERE bank_id = $1 AND file_name = $2', [bankId, fileName]);
    expect(logs.rows.length).toBe(1);
    expect(logs.rows[0].status).toBe('validation_error');
    // Le fichier reste dans le dossier source en attente de correction
    expect(fsNode.existsSync(`/tmp/e2e/source/${fileName}`)).toBe(true);
    fsNode.unlinkSync(`/tmp/e2e/source/${fileName}`);
  });
});

describe('E2E: Error handling', () => {
  it('returns 401 without token', async () => {
    const res = await request.get('/api/banks');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request.get('/api/banks').set('Authorization', 'Bearer invalid_token_here');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown route', async () => {
    const res = await request.get('/api/nonexistent').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown bank', async () => {
    const res = await request.get('/api/banks/999999').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
