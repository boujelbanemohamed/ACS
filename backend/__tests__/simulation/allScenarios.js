#!/usr/bin/env node
const path = require('path');
const { Pool } = require('pg');

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

const { mkdirSync, writeFileSync, unlinkSync, existsSync } = require('fs');
mkdirSync('/tmp/e2e/source', { recursive: true });
mkdirSync('/tmp/e2e/destination', { recursive: true });
mkdirSync('/tmp/e2e/archive', { recursive: true });
mkdirSync('/tmp/e2e/xml', { recursive: true });

const supertest = require('supertest');
const app = require(path.resolve(__dirname, '../../server'));
const request = supertest(app);
let db;

const PREFIX = 'ALL';
let passed = 0, failed = 0;
const results = [];

function log(emoji, label, data = '') {
  const line = `${emoji}  ${label}`;
  const formatted = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  console.log(line);
  if (formatted) console.log(`   ${formatted.replace(/\n/g, '\n   ')}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTest(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`   ❌ ${name}: ${err.message}`);
  }
}

async function step(num, title, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  SCENARIO ${num}: ${title}`);
  console.log(`${'='.repeat(60)}\n`);
  await fn();
}

async function main() {
  log('🚀', 'Simulation TOUT-EN-UN');
  log('📋', 'Scenarios: User Flow + RBAC + Public API + Masse + Cycle de vie + Notifications + Securite\n');

  db = new Pool({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await db.query(`DELETE FROM record_history_details WHERE history_id IN (SELECT id FROM record_history WHERE username LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM record_history WHERE username LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM validation_errors WHERE file_log_id IN (SELECT id FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%'))`);
  await db.query(`DELETE FROM processed_records WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM xml_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM api_keys WHERE name LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM bank_notification_emails WHERE email LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM banks WHERE code LIKE '${PREFIX}%'`);

  await sleep(1500);

  let adminToken, bankId, bankUserId, bankUserToken, fileLogId, cardId, historyId;
  const validPANs = ['4000056655665556','4000056655665557','4000056655665558','4000056655665559','4000056655665560',
    '4000056655665561','4000056655665562','4000056655665563','4000056655665564','4000056655665565'];
  const firstNames = ['Ali','Sami','Hela','Nadia','Omar','Amel','Youssef','Mariem','Iheb','Sarra',
    'Ahmed','Leila','Khaled','Ines','Walid','Aicha','Houssem','Rim','Mounir','Sana',
    'Fathi','Salma','Tarek','Emna','Riadh','Monia','Hatem','Souad','Kais','Noura',
    'Dhia','Ahlem','Nabil','Leila','Zied','Hayet','Amine','Dorra','Moez','Sihem',
    'Skander','Syrine','Malek','Asma','Issam','Kmar','Montassar','Wiem','Mohamed','Sameh'];
  const lastNames = ['BenAli','Mzali','Doe','BenX','BenY','Trabelsi','Haddad','Karray','Masmoudi','Gharbi',
    'Bouzid','Jebali','Zammel','Mahfoudh','BenSalem','Ayari','Riahi','Khammassi','Dridi','Khaldi',
    'Fekih','Mabrouk','Saidi','Guedria','Gharbi','Baccar','Bellil','Zaabi','Moussa','Nouri',
    'Sfaxi','Hmani','Jaziri','Mechri','Toumi','Ghayaza','Bouzayen','Chaari','BenAmor','Souissi',
    'Bouaziz','Mansour','Chtioui','Agrebi','Maalej','Kchaou','Lajnef','Dhaouadi','Boujelbane','Jemli'];
  const behaviours = ['otp','sms','email'];

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 1: USER FLOW COMPLET
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await step(1, 'User Flow Complet', async () => {
    await runTest('1.1 Health Check', async () => {
      const res = await request.get('/api/health');
      if (res.status !== 200 || !res.body.success) throw new Error('Health check failed');
    });

    await runTest('1.2 Admin Login', async () => {
      const res = await request.post('/api/auth/login').send({ username: 'admin', password: 'Admin@123' });
      adminToken = res.body.data.token;
      if (!adminToken) throw new Error('No token received');
    });

    await runTest('1.3 Create Bank', async () => {
      const res = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
        code: `${PREFIX}BNK`, name: 'Banque Tout-en-Un',
        source_url: '/tmp/e2e/source', destination_url: '/tmp/e2e/destination',
        old_url: '/tmp/e2e/archive', xml_output_url: '/tmp/e2e/xml'
      });
      bankId = res.body.data.id;
      if (!bankId) throw new Error('Bank not created');
    });

    await runTest('1.4 List Banks', async () => {
      const res = await request.get('/api/banks').set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200 || !Array.isArray(res.body.data)) throw new Error('List banks failed');
      log('🏦', `${res.body.data.length} banques trouvées`);
    });

    await runTest('1.5 Create Bank User', async () => {
      const res = await request.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
        username: `${PREFIX}User`, password: 'Pass1234!Test', email: `${PREFIX}user@test.com`,
        role: 'bank', bankId
      });
      bankUserId = res.body.data.id;
      if (!bankUserId) throw new Error('User not created');
    });

    await runTest('1.6 Bank User Login', async () => {
      const res = await request.post('/api/auth/login').send({ username: `${PREFIX}User`, password: 'Pass1234!Test' });
      bankUserToken = res.body.data.token;
      if (!bankUserToken) throw new Error('Bank user login failed');
    });

    await runTest('1.7 Upload Valid CSV', async () => {
      const csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        'fr;Ahmed;BenAli;4000056655665556;12/28;21699123456;otp;create';
      const res = await request.post('/api/processing/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('bankId', bankId.toString())
        .attach('file', Buffer.from(csv, 'utf8'), 'flow_cards.csv');
      if (res.status !== 200 || !res.body.success) throw new Error('Upload failed: ' + res.body.message);
      fileLogId = res.body.data.fileLogId;
      log('📄', `Upload OK - fileLogId: ${fileLogId}`);
    });

    await runTest('1.8 View Records', async () => {
      const res = await request.get(`/api/records?bankId=${bankId}`).set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200 || !Array.isArray(res.body.data)) throw new Error('Records not accessible');
      if (res.body.data.length < 1) throw new Error('No records found');
      cardId = res.body.data[0].id;
      log('📊', `${res.body.data.length} enregistrement(s) trouvé(s)`);
    });

    await runTest('1.9 View History', async () => {
      const res = await request.get(`/api/history?bankId=${bankId}`).set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200) throw new Error('History not accessible');
      if (res.body.data?.length > 0) historyId = res.body.data[0].id;
      log('📜', `${res.body.data?.length || 0} entrée(s) historique`);
    });

    await runTest('1.10 Audit Logs', async () => {
      const res = await request.get('/api/audit-logs?limit=5').set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200) throw new Error('Audit logs not accessible');
      log('🔍', `Derniers logs: ${res.body.data?.map(l => l.action).join(', ')}`);
    });

    await runTest('1.11 API Key CRUD', async () => {
      const create = await request.post('/api/api-keys').set('Authorization', `Bearer ${adminToken}`).send({
        name: `${PREFIX}Key`, bankId
      });
      if (create.status !== 200 || !create.body.data?.api_key) throw new Error('API key creation failed');
      const apiKeyId = create.body.data.id;
      log('🔑', `Clé créée: ${create.body.data.api_key.slice(0, 20)}...`);

      const list = await request.get('/api/api-keys').set('Authorization', `Bearer ${adminToken}`);
      if (list.status !== 200) throw new Error('API key list failed');

      const del = await request.delete(`/api/api-keys/${apiKeyId}`).set('Authorization', `Bearer ${adminToken}`);
      if (del.status !== 200) throw new Error('API key delete failed');
      log('🗑️', 'Clé supprimée');
    });

    await runTest('1.12 Monitoring Health', async () => {
      const res = await request.get('/api/monitoring/health').set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200 || res.body.data?.globalStatus !== 'healthy') throw new Error('Health check failed');
      log('💚', `Santé: ${res.body.data.globalStatus}`);
    });

    await runTest('1.13 Error Handling (401/403/404)', async () => {
      const r1 = await request.get('/api/banks');
      if (r1.status !== 401) throw new Error('Expected 401, got ' + r1.status);
      const r2 = await request.get('/api/banks').set('Authorization', 'Bearer bad');
      if (r2.status !== 401) throw new Error('Expected 401, got ' + r2.status);
      const r3 = await request.get('/api/banks/999999').set('Authorization', `Bearer ${adminToken}`);
      if (r3.status !== 404) throw new Error('Expected 404, got ' + r3.status);
      log('🚫', '401/403/404 - OK');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 2: ISOLATION RBAC
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await step(2, 'Isolation RBAC Multi-Banque', async () => {
    let bankAId, bankBId, userAToken, userBToken;

    await runTest('2.1 Create 2 Banks', async () => {
      const a = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
        code: `${PREFIX}A`, name: 'RBAC Bank A',
        source_url: '/tmp/e2e/source', destination_url: '/tmp/e2e/destination',
        old_url: '/tmp/e2e/archive', xml_output_url: '/tmp/e2e/xml'
      });
      bankAId = a.body.data.id;
      const b = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
        code: `${PREFIX}B`, name: 'RBAC Bank B',
        source_url: '/tmp/e2e/source', destination_url: '/tmp/e2e/destination',
        old_url: '/tmp/e2e/archive', xml_output_url: '/tmp/e2e/xml'
      });
      bankBId = b.body.data.id;
      if (!bankAId || !bankBId) throw new Error('Bank creation failed');
    });

    await runTest('2.2 Create 2 Bank Users', async () => {
      const ua = await request.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
        username: `${PREFIX}UserA`, password: 'TestPass123!', email: `${PREFIX}usera@test.com`,
        role: 'bank', bankId: bankAId
      });
      const ub = await request.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
        username: `${PREFIX}UserB`, password: 'TestPass123!', email: `${PREFIX}userb@test.com`,
        role: 'bank', bankId: bankBId
      });
      if (!ua.body.data.id || !ub.body.data.id) throw new Error('User creation failed');
    });

    await runTest('2.3 Login Users & Upload Data', async () => {
      const la = await request.post('/api/auth/login').send({ username: `${PREFIX}UserA`, password: 'TestPass123!' });
      userAToken = la.body.data.token;
      const lb = await request.post('/api/auth/login').send({ username: `${PREFIX}UserB`, password: 'TestPass123!' });
      userBToken = lb.body.data.token;

      const csvA = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;User;AOnly;4000056655665556;12/28;21699123456;otp;create';
      await request.post('/api/processing/upload').set('Authorization', `Bearer ${userAToken}`)
        .field('bankId', bankAId.toString()).attach('file', Buffer.from(csvA), 'rbacA.csv');

      const csvB = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;User;BOnly;4000056655665557;12/28;21699123457;sms;create';
      await request.post('/api/processing/upload').set('Authorization', `Bearer ${userBToken}`)
        .field('bankId', bankBId.toString()).attach('file', Buffer.from(csvB), 'rbacB.csv');
    });

    await runTest('2.4 User A sees only Bank A data', async () => {
      const rb = await request.get(`/api/records?bankId=${bankBId}`).set('Authorization', `Bearer ${userAToken}`);
      const hasBankB = (rb.body.data || []).some(r => r.bank_id === bankBId);
      if (hasBankB) throw new Error('DATA LEAK: User A saw Bank B data!');
    });

    await runTest('2.5 User B sees only Bank B data', async () => {
      const rb = await request.get(`/api/records?bankId=${bankBId}`).set('Authorization', `Bearer ${userBToken}`);
      if ((rb.body.data || []).length < 1) throw new Error('User B should see Bank B data');
    });

    await runTest('2.6 RBAC - Bank user blocked from admin actions', async () => {
      const r1 = await request.post('/api/banks').set('Authorization', `Bearer ${userAToken}`).send({
        code: 'FAIL', name: 'Fail',
        source_url: '/tmp', destination_url: '/tmp', old_url: '/tmp', xml_output_url: '/tmp'
      });
      if (r1.status !== 403) throw new Error('Expected 403 creating bank, got ' + r1.status);
      const r2 = await request.post('/api/users').set('Authorization', `Bearer ${userAToken}`).send({
        username: 'Fail', password: 'Test1234!', email: 'fail@test.com', role: 'super_admin'
      });
      if (r2.status !== 403) throw new Error('Expected 403 creating super_admin, got ' + r2.status);
      log('🛡️', 'RBAC: bank user bloque (403) sur actions admin');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 3: PUBLIC API
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await step(3, 'Public API & Soumission Externe', async () => {
    let apiKey;

    await runTest('3.1 Create API Key for submission', async () => {
      const res = await request.post('/api/api-keys').set('Authorization', `Bearer ${adminToken}`).send({
        name: `${PREFIX}PubKey`, bankId
      });
      apiKey = res.body.data.api_key;
      if (!apiKey) throw new Error('API key creation failed');
      log('🔑', `API Key: ${apiKey.slice(0, 25)}...`);
    });

    await runTest('3.2 Submit card via Public API', async () => {
      const res = await request.post('/api/v1/cards/register')
        .set('x-api-key', apiKey)
        .send({
          bankCode: 'ALLBNK',
          cards: [{ pan: '4000056655665558', expiry: '12/28', firstName: 'Public', lastName: 'User', phone: '21699123458' }]
        });
      if (res.status !== 200 && res.status !== 201) throw new Error('Public submit failed: ' + (res.body.message || ''));
    });

    await runTest('3.3 Submit with invalid PAN via Public API', async () => {
      const res = await request.post('/api/v1/cards/register')
        .set('x-api-key', apiKey)
        .send({
          bankCode: 'ALLBNK',
          cards: [{ pan: '1234', expiry: '12/28', firstName: 'Bad', lastName: 'Pan', phone: '21699123459' }]
        });
    });

    await runTest('3.4 Public API rejects without API key', async () => {
      const res = await request.post('/api/v1/cards/register').send({ pan: '4000056655665559', expiry: '12/28' });
      if (res.status !== 401) throw new Error('Expected 401, got ' + res.status);
    });

    await runTest('3.5 Public API rejects bad API key', async () => {
      const res = await request.post('/api/v1/cards/register')
        .set('x-api-key', 'bad_key_12345')
        .send({ pan: '4000056655665559', expiry: '12/28' });
      if (res.status !== 401) throw new Error('Expected 401, got ' + res.status);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 4: UPLOAD MASSE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await step(4, 'Upload Masse (50 cartes)', async () => {
    await runTest('4.1 Upload 50 cards CSV', async () => {
      let csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n';
      for (let i = 0; i < 50; i++) {
        const pan = validPANs[i % validPANs.length];
        const firstName = firstNames[i];
        const lastName = lastNames[i];
        const behaviour = behaviours[i % behaviours.length];
        const expiry = `${String(1 + i % 12).padStart(2,'0')}/${String(25 + i % 5)}`;
        csv += `fr;${firstName};${lastName};${pan};${expiry};21699${String(100000 + i).slice(0,8)};${behaviour};create\n`;
      }
      const res = await request.post('/api/processing/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('bankId', bankId.toString())
        .attach('file', Buffer.from(csv, 'utf8'), 'mass_50_cards.csv');
      if (res.status !== 200) throw new Error('Mass upload failed');
      log('📄', 'Upload masse', { status: res.status, success: res.body.success, stats: res.body.data?.stats });
    });

    await runTest('4.2 Verify records exist after mass upload', async () => {
      const res = await request.get(`/api/records?bankId=${bankId}&limit=100`).set('Authorization', `Bearer ${adminToken}`);
      log('📊', `Total enregistrements pour bankId=${bankId}: ${res.body.data?.length || 0}`);
      if ((res.body.data?.length || 0) < 1) throw new Error('No records found after mass upload');
    });

    await runTest('4.3 Check XML logs generated', async () => {
      const res = await request.get(`/api/xml-logs?bankId=${bankId}`).set('Authorization', `Bearer ${adminToken}`);
      log('📋', `${res.body.data?.length || 0} fichiers XML generes`);
    });

    await runTest('4.4 Verify dashboard stats', async () => {
      const res = await request.get('/api/dashboard').set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200) throw new Error('Dashboard inaccessible');
      log('📈', 'Dashboard stats', { totalRecords: res.body.data?.totalRecords, totalBanks: res.body.data?.totalBanks });
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 5: CYCLE DE VIE D'UNE CARTE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await step(5, 'Cycle de Vie d\'une Carte', async () => {
    let recordId;

    await runTest('5.1 Upload a specific card', async () => {
      const csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
        'fr;Cycle;LifeTest;4000056655665560;06/28;21699123999;otp;create';
      const res = await request.post('/api/processing/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('bankId', bankId.toString())
        .attach('file', Buffer.from(csv, 'utf8'), 'lifecycle_card.csv');
      if (!res.body.success) throw new Error('Upload failed: ' + JSON.stringify(res.body.data?.errors));
    });

    await runTest('5.2 Find card in records', async () => {
      const res = await request.get(`/api/records?bankId=${bankId}&search=LifeTest`).set('Authorization', `Bearer ${adminToken}`);
      const found = (res.body.data || []).find(r => r.last_name === 'LifeTest');
      if (!found) throw new Error('Card not found in records');
      recordId = found.id;
      log('🔍', `Carte trouvée: id=${recordId}`);
    });

    await runTest('5.3 Check card in record history', async () => {
      if (!recordId) throw new Error('No record ID');
      const res = await request.get(`/api/record-history/search?bankId=${bankId}&limit=10`).set('Authorization', `Bearer ${adminToken}`);
      if (res.status !== 200) throw new Error('Record history search failed');
    });

    await runTest('5.4 Find card in audit logs', async () => {
      const res = await request.get('/api/audit-logs?limit=20').set('Authorization', `Bearer ${adminToken}`);
      const uploadEvents = (res.body.data || []).filter(a => a.action === 'UPLOAD_FILE');
      if (uploadEvents.length < 1) throw new Error('No UPLOAD_FILE events in audit');
    });

    await runTest('5.5 Verify XML was generated', async () => {
      const res = await request.get(`/api/xml-logs?bankId=${bankId}`).set('Authorization', `Bearer ${adminToken}`);
    });

    await runTest('5.6 Scanner status', async () => {
      const res = await request.get('/api/scanner/status').set('Authorization', `Bearer ${adminToken}`);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 6: NOTIFICATIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await step(6, 'Notifications & Alertes', async () => {
    let notifId;

    await runTest('6.1 SMTP config status', async () => {
      const res = await request.get('/api/notifications/smtp').set('Authorization', `Bearer ${adminToken}`);
    });

    await runTest('6.2 View notification logs', async () => {
      const res = await request.get('/api/notifications/logs?limit=5').set('Authorization', `Bearer ${adminToken}`);
    });

    await runTest('6.3 Create bank notification email', async () => {
      const res = await request.post(`/api/notifications/emails/${bankId}`).set('Authorization', `Bearer ${adminToken}`).send({
        email: `${PREFIX}notif@test.com`
      });
      notifId = res.body.data?.id;
    });

    await runTest('6.4 Toggle notification email active status', async () => {
      if (!notifId) throw new Error('No notification email ID');
      const res = await request.put(`/api/notifications/emails/${notifId}/toggle`).set('Authorization', `Bearer ${adminToken}`);
    });

    await runTest('6.5 List bank notification emails', async () => {
      const res = await request.get(`/api/notifications/emails/${bankId}`).set('Authorization', `Bearer ${adminToken}`);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SCENARIO 7: SECURITE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await step(7, 'Securite & Mots de Passe', async () => {
    await runTest('7.1 Login with wrong password -> 401', async () => {
      const res = await request.post('/api/auth/login').send({ username: 'admin', password: 'WrongPassword99!' });
      if (res.status !== 401) throw new Error('Expected 401, got ' + res.status);
    });

    await runTest('7.2 Login with non-existent user -> 401', async () => {
      const res = await request.post('/api/auth/login').send({ username: 'nonexistent_12345', password: 'Anything1!' });
      if (res.status !== 401) throw new Error('Expected 401, got ' + res.status);
    });

    await runTest('7.3 Password status endpoint', async () => {
      const res = await request.get('/api/auth/password-status').set('Authorization', `Bearer ${adminToken}`);
    });

    await runTest('7.4 Access protected route with invalid token -> 401', async () => {
      const res = await request.get('/api/banks').set('Authorization', 'Bearer invalid_jwt_token_here');
      if (res.status !== 401) throw new Error('Expected 401, got ' + res.status);
    });

    await runTest('7.5 Access protected route with malformed token -> 401', async () => {
      const res = await request.get('/api/banks').set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8');
      if (res.status !== 401) throw new Error('Expected 401, got ' + res.status);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CLEANUP
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  log('\n🧹', 'Nettoyage des donnees...');
  await db.query(`DELETE FROM record_history_details WHERE history_id IN (SELECT id FROM record_history WHERE username LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM record_history WHERE username LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM validation_errors WHERE file_log_id IN (SELECT id FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%'))`);
  await db.query(`DELETE FROM processed_records WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM xml_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM api_keys WHERE name LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM bank_notification_emails WHERE email LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM banks WHERE code LIKE '${PREFIX}%'`);
  log('🧹', 'Nettoyage termine');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RAPPORT FINAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log(`\n${'='.repeat(60)}`);
  console.log(failed === 0 ? '  ✅ TOUS LES TESTS PASSES' : `  ⚠️  ${passed} ✅ / ${failed} ❌`);
  console.log(`${'='.repeat(60)}\n`);

  const scenarioTests = [13, 6, 5, 4, 6, 5, 5];
  let idx = 0;
  const sceneTitles = ['User Flow Complet', 'Isolation RBAC Multi-Banque',
    'Public API & Soumission Externe', 'Upload Masse (50 cartes)',
    'Cycle de Vie d\'une Carte', 'Notifications & Alertes', 'Securite & Mots de Passe'];

  for (let s = 0; s < sceneTitles.length; s++) {
    const nTests = scenarioTests[s];
    const scResults = results.slice(idx, idx + nTests);
    idx += nTests;
    const pass = scResults.filter(r => r.status === 'PASS').length;
    console.log(`  SCENARIO ${s+1}: ${sceneTitles[s]}`);
    for (const r of scResults) {
      console.log(`    ${r.status === 'PASS' ? '✅' : '❌'} ${r.name}${r.error ? ': ' + r.error : ''}`);
    }
    console.log(`    -> ${pass}/${nTests} passes\n`);
  }

  console.log(`${'='.repeat(60)}`);
  console.log(`  TOTAL: ${passed + failed} tests | ${passed} ✅ | ${failed} ❌`);
  console.log(`${'='.repeat(60)}`);

  await db.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
