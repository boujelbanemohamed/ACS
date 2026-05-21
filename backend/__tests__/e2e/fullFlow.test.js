const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const supertest = require('supertest');

const TEST_PREFIX = 'E2E';
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
  process.env.DB_PORT = '15432';
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
  });

  request = supertest(app);

  await new Promise(r => setTimeout(r, 1500));
});

afterAll(async () => {
  try {
    await db.query(`DELETE FROM audit_logs WHERE username LIKE '${TEST_PREFIX}%'`);
    await db.query(`DELETE FROM record_history_details WHERE history_id IN (SELECT id FROM record_history WHERE username LIKE '${TEST_PREFIX}%')`);
    await db.query(`DELETE FROM record_history WHERE username LIKE '${TEST_PREFIX}%'`);
    await db.query(`DELETE FROM validation_errors WHERE file_log_id IN (SELECT id FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%'))`);
    await db.query(`DELETE FROM processed_records WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%')`);
    await db.query(`DELETE FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${TEST_PREFIX}%')`);
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
    expect(res.body.success).toBe(true);
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

describe('E2E: Processing & Records', () => {
  let fileLogId;
  const csvContent = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;Jean;Dupont;4000056655665556;12/28;21612345678;otp;create';

  it('POST /api/processing/upload processes a CSV file', async () => {
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('bankId', bankId.toString())
      .attach('file', Buffer.from(csvContent, 'utf8'), 'test_cards.csv');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    fileLogId = res.body.data.fileLogId;
  });

  it('POST /api/processing/upload returns validation errors for bad PAN', async () => {
    const badCsv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;Pierre;Martin;1234;12/28;21687654321;sms;create';
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('bankId', bankId.toString())
      .attach('file', Buffer.from(badCsv, 'utf8'), 'bad_cards.csv');
    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBeGreaterThan(0);
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
    bankUserToken = res.body.data.token;
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
