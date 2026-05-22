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

const { mkdirSync } = require('fs');
mkdirSync('/tmp/e2e/source', { recursive: true });
mkdirSync('/tmp/e2e/destination', { recursive: true });
mkdirSync('/tmp/e2e/archive', { recursive: true });
mkdirSync('/tmp/e2e/xml', { recursive: true });

const supertest = require('supertest');
const app = require(path.resolve(__dirname, '../../server'));
const request = supertest(app);
let db;

const PREFIX = 'RBAC';

function log(emoji, label, data = '') {
  const line = `${emoji}  ${label}`;
  const formatted = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  console.log(line);
  if (formatted) console.log(`   ${formatted.replace(/\n/g, '\n   ')}`);
  console.log('');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function step(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'='.repeat(60)}\n`);
  await fn();
}

async function main() {
  log('🔒', 'Simulation isolation RBAC multi-banque');

  db = new Pool({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  // Cleanup previous runs
  await db.query(`DELETE FROM record_history_details WHERE history_id IN (SELECT id FROM record_history WHERE username LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM record_history WHERE username LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM validation_errors WHERE file_log_id IN (SELECT id FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%'))`);
  await db.query(`DELETE FROM processed_records WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM xml_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
  await db.query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM banks WHERE code LIKE '${PREFIX}%'`);

  await sleep(1500);

  let adminToken, bankAId, bankBId, userAToken, userBToken;

  // ── 1. ADMIN LOGIN ──
  await step('1. Connexion admin', async () => {
    const res = await request.post('/api/auth/login').send({ username: 'admin', password: 'Admin@123' });
    adminToken = res.body.data.token;
    log('🔑', 'Admin connecté', { token: adminToken?.slice(0, 20) + '...' });
  });

  // ── 2. CREATE BANK A ──
  await step('2. Création Banque A', async () => {
    const res = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
      code: `${PREFIX}A`, name: 'Banque A - Test Isolation',
      source_url: '/tmp/e2e/source', destination_url: '/tmp/e2e/destination',
      old_url: '/tmp/e2e/archive', xml_output_url: '/tmp/e2e/xml'
    });
    bankAId = res.body.data.id;
    log('🏦', `Banque A créée`, { id: bankAId, code: res.body.data.code });
  });

  // ── 3. CREATE BANK B ──
  await step('3. Création Banque B', async () => {
    const res = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
      code: `${PREFIX}B`, name: 'Banque B - Test Isolation',
      source_url: '/tmp/e2e/source', destination_url: '/tmp/e2e/destination',
      old_url: '/tmp/e2e/archive', xml_output_url: '/tmp/e2e/xml'
    });
    bankBId = res.body.data.id;
    log('🏦', `Banque B créée`, { id: bankBId, code: res.body.data.code });
  });

  // ── 4. CREATE USER A (bank, Bank A) ──
  await step('4. Création User A (rattaché à Banque A)', async () => {
    const res = await request.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
      username: `${PREFIX}UserA`, password: 'TestPass123!', email: `${PREFIX}usera@test.com`,
      role: 'bank', bankId: bankAId
    });
    log('👤', 'User A créé', { id: res.body.data.id, username: res.body.data.username, bank_id: bankAId });
  });

  // ── 5. CREATE USER B (bank, Bank B) ──
  await step('5. Création User B (rattaché à Banque B)', async () => {
    const res = await request.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
      username: `${PREFIX}UserB`, password: 'TestPass123!', email: `${PREFIX}userb@test.com`,
      role: 'bank', bankId: bankBId
    });
    log('👤', 'User B créé', { id: res.body.data.id, username: res.body.data.username, bank_id: bankBId });
  });

  // ── 6. LOGIN USER A ──
  await step('6. Connexion User A', async () => {
    const res = await request.post('/api/auth/login').send({ username: `${PREFIX}UserA`, password: 'TestPass123!' });
    userAToken = res.body.data.token;
    log('🔑', 'User A connecté', { token: userAToken?.slice(0, 20) + '...' });
  });

  // ── 7. LOGIN USER B ──
  await step('7. Connexion User B', async () => {
    const res = await request.post('/api/auth/login').send({ username: `${PREFIX}UserB`, password: 'TestPass123!' });
    userBToken = res.body.data.token;
    log('🔑', 'User B connecté', { token: userBToken?.slice(0, 20) + '...' });
  });

  // ── 8. USER A UPLOAD CARDS TO BANK A ──
  await step('8. User A upload 3 cartes vers Banque A', async () => {
    const csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
      'fr;Ali;BenA;4000056655665556;12/28;21699123456;otp;create\n' +
      'fr;Sami;BenB;4000056655665557;01/29;21699123457;sms;update\n' +
      'fr;Hela;BenC;4000056655665558;02/30;21699123458;email;create';
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${userAToken}`)
      .field('bankId', bankAId.toString())
      .attach('file', Buffer.from(csv, 'utf8'), 'rbac_A_cards.csv');
    log('📄', `Upload User A → Banque A`, { status: res.status, success: res.body.success, stats: res.body.data?.stats });
  });

  // ── 9. USER B UPLOAD CARDS TO BANK B ──
  await step('9. User B upload 2 cartes vers Banque B', async () => {
    const csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
      'fr;Nadia;BenX;4000056655665559;03/28;21699123459;otp;create\n' +
      'fr;Omar;BenY;4000056655665560;04/29;21699123460;sms;create';
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${userBToken}`)
      .field('bankId', bankBId.toString())
      .attach('file', Buffer.from(csv, 'utf8'), 'rbac_B_cards.csv');
    log('📄', `Upload User B → Banque B`, { status: res.status, success: res.body.success, stats: res.body.data?.stats });
  });

  // ── 10. RBAC TEST: User A voit SES cartes ──
  await step('10. ✅ User A consulte les cartes de sa banque', async () => {
    const res = await request.get(`/api/records?bankId=${bankAId}`).set('Authorization', `Bearer ${userAToken}`);
    const count = res.body.data?.length || 0;
    log('📊', `User A → /api/records?bankId=${bankAId}`, { status: res.status, count, names: res.body.data?.map(r => `${r.first_name} ${r.last_name}`) });
    if (count !== 3) throw new Error(`User A devrait voir 3 cartes, il en voit ${count}`);
    console.log('   ✅ PASS');
  });

  // ── 11. RBAC TEST: User B voit SES cartes ──
  await step('11. ✅ User B consulte les cartes de sa banque', async () => {
    const res = await request.get(`/api/records?bankId=${bankBId}`).set('Authorization', `Bearer ${userBToken}`);
    const count = res.body.data?.length || 0;
    log('📊', `User B → /api/records?bankId=${bankBId}`, { status: res.status, count, names: res.body.data?.map(r => `${r.first_name} ${r.last_name}`) });
    if (count !== 2) throw new Error(`User B devrait voir 2 cartes, il en voit ${count}`);
    console.log('   ✅ PASS');
  });

  // ── 12. RBAC TEST: User A NE PEUT PAS voir les cartes de Bank B ──
  await step('12. ❌ User A tente de voir les cartes de Banque B (refusé)', async () => {
    const res = await request.get(`/api/records?bankId=${bankBId}`).set('Authorization', `Bearer ${userAToken}`);
    log('🛡️', `User A → /api/records?bankId=${bankBId}`, { status: res.status, data: res.body.data, message: res.body.message });
    // Le middleware filterByBank devrait forcer bankId = bankAId
    // Donc soit 403, soit les données de Bank A (pas Bank B)
    const visible = res.body.data || [];
    const hasBankBData = visible.some(r => r.bank_id === bankBId);
    if (hasBankBData) throw new Error('FAIL: User A a vu les données de Banque B!');
    console.log('   ✅ PASS — User A ne peut pas voir les données de Banque B');
  });

  // ── 13. RBAC TEST: User A ne peut pas créer de banque ──
  await step('13. ❌ User A ne peut pas créer de banque (403)', async () => {
    const res = await request.post('/api/banks').set('Authorization', `Bearer ${userAToken}`).send({
      code: 'SHOULD_FAIL', name: 'Should Not Work',
      source_url: '/tmp/e2e/source', destination_url: '/tmp/e2e/dest',
      old_url: '/tmp/e2e/archive', xml_output_url: '/tmp/e2e/xml'
    });
    log('🛡️', 'POST /api/banks (User A)', { status: res.status, expected: 403 });
    if (res.status !== 403) throw new Error(`FAIL: Statut ${res.status} au lieu de 403`);
    console.log('   ✅ PASS');
  });

  // ── 14. RBAC TEST: User A ne peut pas créer d'utilisateur super_admin ──
  await step('14. ❌ User A ne peut pas créer un super_admin (403)', async () => {
    const res = await request.post('/api/users').set('Authorization', `Bearer ${userAToken}`).send({
      username: 'ShouldFail', password: 'Test1234!', email: 'fail@test.com', role: 'super_admin'
    });
    log('🛡️', 'POST /api/users role=super_admin (User A)', { status: res.status, expected: 403 });
    if (res.status !== 403) throw new Error(`FAIL: Statut ${res.status} au lieu de 403`);
    console.log('   ✅ PASS');
  });

  // ── 15. ADMIN voit TOUTES les cartes ──
  await step('15. ✅ Admin voit toutes les cartes (5)', async () => {
    const res = await request.get('/api/records').set('Authorization', `Bearer ${adminToken}`);
    const count = res.body.data?.length || 0;
    log('📊', `Admin → /api/records (toutes les banques)`, { status: res.status, totalCount: count });
    if (count < 5) throw new Error(`Admin devrait voir au moins 5 cartes, il en voit ${count}`);
    console.log('   ✅ PASS');
  });

  // ── 16. ADMIN VOIT LES USERS DES DEUX BANQUES ──
  await step('16. ✅ Admin liste les utilisateurs des deux banques', async () => {
    const res = await request.get(`/api/users`).set('Authorization', `Bearer ${adminToken}`);
    const rbacUsers = (res.body.data || []).filter(u => u.username?.startsWith(PREFIX));
    log('👥', 'Utilisateurs RBAC', rbacUsers.map(u => ({ id: u.id, username: u.username, role: u.role, bank_id: u.bank_id })));
    if (rbacUsers.length < 2) throw new Error(`Admin devrait voir au moins 2 users RBAC, il en voit ${rbacUsers.length}`);
    console.log('   ✅ PASS');
  });

  // ── 17. CLEANUP ──
  await step('17. Nettoyage', async () => {
    await db.query(`DELETE FROM record_history_details WHERE history_id IN (SELECT id FROM record_history WHERE username LIKE '${PREFIX}%')`);
    await db.query(`DELETE FROM record_history WHERE username LIKE '${PREFIX}%'`);
    await db.query(`DELETE FROM validation_errors WHERE file_log_id IN (SELECT id FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%'))`);
    await db.query(`DELETE FROM processed_records WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
    await db.query(`DELETE FROM file_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
    await db.query(`DELETE FROM xml_logs WHERE bank_id IN (SELECT id FROM banks WHERE code LIKE '${PREFIX}%')`);
    await db.query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
    await db.query(`DELETE FROM banks WHERE code LIKE '${PREFIX}%'`);
    log('🧹', 'Données RBAC supprimées');
  });

  // ── SUMMARY ──
  console.log(`\n${'='.repeat(60)}`);
  console.log('  ✅ SIMULATION RBAC TERMINÉE');
  console.log(`${'='.repeat(60)}`);
  console.log('\n  Tests d\'isolation :');
  console.log('    ✅ User A → voit ses 3 cartes (Banque A)');
  console.log('    ✅ User B → voit ses 2 cartes (Banque B)');
  console.log('    ✅ User A → ne peut PAS voir les cartes de Banque B');
  console.log('    ✅ User A → ne peut PAS créer de banque (403)');
  console.log('    ✅ User A → ne peut PAS créer super_admin (403)');
  console.log('    ✅ Admin → voit toutes les cartes (5)');
  console.log('    ✅ Admin → voit tous les utilisateurs');

  await db.end();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Simulation échouée:', err.message);
  process.exit(1);
});
