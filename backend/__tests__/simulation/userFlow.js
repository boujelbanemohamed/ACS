#!/usr/bin/env node
const supertest = require('supertest');
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

let request;
let db;

const PREFIX = 'SIM';

function log(emoji, label, data = '') {
  const line = `${emoji}  ${label}`;
  const formatted = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  console.log(line);
  if (formatted) {
    console.log(`   ${formatted.replace(/\n/g, '\n   ')}`);
  }
  console.log('');
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function step(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ÉTAPE: ${name}`);
  console.log(`${'='.repeat(60)}\n`);
  await fn();
}

async function main() {
  log('🚀', 'Démarrage de la simulation complète...');

  // Cleanup previous SIM data
  db = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await db.query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
  await db.query(`DELETE FROM banks WHERE code LIKE '${PREFIX}%'`);

  // Start server
  const app = require(path.resolve(__dirname, '../../server'));
  request = supertest(app);
  let adminToken, bankId, bankUserId, bankUserToken, fileLogId;

  // ── 1. HEALTH CHECK ──
  await step('1. Health Check', async () => {
    const res = await request.get('/api/health');
    log('💓', 'GET /api/health', { status: res.status, body: res.body });
  });

  // ── 2. ADMIN LOGIN ──
  await step('2. Connexion admin', async () => {
    const res = await request.post('/api/auth/login').send({
      username: 'admin', password: 'Admin@123'
    });
    log('🔑', 'POST /api/auth/login (admin)', { status: res.status, token: res.body.data?.token?.slice(0, 30) + '...' });
    adminToken = res.body.data.token;
  });

  // ── 3. LIST BANKS ──
  await step('3. Lister les banques existantes', async () => {
    const res = await request.get('/api/banks').set('Authorization', `Bearer ${adminToken}`);
    log('🏦', `GET /api/banks — ${res.body.data?.length || 0} banques`, res.body.data?.map(b => ({ id: b.id, code: b.code, name: b.name })));
  });

  // ── 4. CREATE BANK ──
  await step('4. Créer une banque de test', async () => {
    const res = await request.post('/api/banks').set('Authorization', `Bearer ${adminToken}`).send({
      code: `${PREFIX}BANK`,
      name: 'Banque Simulation',
      source_url: '/tmp/e2e/source',
      destination_url: '/tmp/e2e/destination',
      old_url: '/tmp/e2e/archive',
      xml_output_url: '/tmp/e2e/xml'
    });
    log('🏦', 'POST /api/banks', { status: res.status, id: res.body.data?.id, code: res.body.data?.code });
    bankId = res.body.data.id;
  });

  // ── 5. CREATE BANK USER ──
  await step('5. Créer un utilisateur bank', async () => {
    const res = await request.post('/api/users').set('Authorization', `Bearer ${adminToken}`).send({
      username: `${PREFIX}user`,
      password: 'SimPass123!',
      email: `${PREFIX}user@sim.com`,
      role: 'bank',
      bankId
    });
    log('👤', 'POST /api/users', { status: res.status, id: res.body.data?.id, username: res.body.data?.username, role: res.body.data?.role });
    bankUserId = res.body.data.id;
  });

  // ── 6. BANK USER LOGIN ──
  await step('6. Connexion utilisateur bank', async () => {
    const res = await request.post('/api/auth/login').send({
      username: `${PREFIX}user`,
      password: 'SimPass123!'
    });
    log('🔑', 'POST /api/auth/login (bank user)', { status: res.status, token: res.body.data?.token?.slice(0, 30) + '...' });
    bankUserToken = res.body.data.token;
  });

  // ── 7. UPLOAD CSV VALIDE ──
  await step('7. Upload CSV valide', async () => {
    const csv = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
      'fr;Ahmed;BenAli;4000056655665556;12/28;21699123456;otp;create\n' +
      'fr;Sarra;Mzali;4000056655665557;12/29;21699123457;sms;update\n' +
      'en;John;Doe;4000056655665558;01/30;21699123458;email;create';
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('bankId', bankId.toString())
      .attach('file', Buffer.from(csv, 'utf8'), 'sim_cards.csv');
    log('📄', 'POST /api/processing/upload', {
      status: res.status,
      success: res.body.success,
      message: res.body.message,
      stats: res.body.data?.stats,
      errors: res.body.data?.errors
    });
    fileLogId = res.body.data?.fileLogId;
  });

  // ── 8. UPLOAD CSV DOUBLONS ──
  await step('8. Upload CSV avec doublons', async () => {
    const csvDup = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
      'fr;Ahmed;BenAli;4000056655665556;12/28;21699123456;otp;create\n' +
      'fr;Nouveau;User;4000056655665559;02/28;21699123459;sms;create';
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('bankId', bankId.toString())
      .attach('file', Buffer.from(csvDup, 'utf8'), 'sim_dup.csv');
    log('📄', 'POST /api/processing/upload (avec doublon)', {
      status: res.status,
      success: res.body.success,
      stats: res.body.data?.stats,
      errorsCount: res.body.data?.errors?.length
    });
    if (res.body.data?.errors?.length > 0) {
      log('⚠️', '  Erreurs détectées', res.body.data.errors.map(e => `  L${e.rowNumber}: ${e.error}`));
    }
  });

  // ── 9. UPLOAD CSV INVALIDE ──
  await step('9. Upload CSV avec PAN invalide', async () => {
    const csvBad = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n' +
      'fr;Bad;Pan;1234;13/99;21699123000;sms;create';
    const res = await request.post('/api/processing/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('bankId', bankId.toString())
      .attach('file', Buffer.from(csvBad, 'utf8'), 'sim_bad.csv');
    log('📄', 'POST /api/processing/upload (PAN invalide)', {
      status: res.status,
      success: res.body.success,
      stats: res.body.data?.stats,
      errorsCount: res.body.data?.errors?.length
    });
    if (res.body.data?.errors?.length > 0) {
      log('❌', '  Erreurs de validation', res.body.data.errors.map(e => `  L${e.rowNumber}: ${e.field} → ${e.error}`));
    }
  });

  // ── 10. CONSULTER ENREGISTREMENTS ──
  await step('10. Consulter les enregistrements', async () => {
    const res = await request.get(`/api/records?bankId=${bankId}&limit=10`).set('Authorization', `Bearer ${adminToken}`);
    log('📊', `GET /api/records — ${res.body.data?.length || 0} enregistrements`, res.body.data?.map(r => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, pan: r.pan?.slice(0, 6) + '******', status: r.status })));
  });

  // ── 11. HISTORIQUE ──
  await step('11. Consulter l\'historique', async () => {
    const res = await request.get(`/api/history?bankId=${bankId}&limit=10`).set('Authorization', `Bearer ${adminToken}`);
    log('📜', `GET /api/history — ${res.body.data?.length || 0} entrées`, res.body.data?.slice(0, 5).map(h => ({ id: h.id, action: h.action, table: h.table_name, timestamp: h.created_at?.slice(0, 19) })));
  });

  // ── 12. AUDIT LOGS ──
  await step('12. Consulter les logs d\'audit', async () => {
    const res = await request.get('/api/audit-logs?limit=10').set('Authorization', `Bearer ${adminToken}`);
    log('🔍', `GET /api/audit-logs — ${res.body.data?.length || 0} entrées`, res.body.data?.slice(0, 5).map(a => ({ id: a.id, action: a.action, username: a.username, timestamp: a.created_at?.slice(0, 19) })));
  });

  // ── 13. API KEYS ──
  await step('13. Créer et gérer une clé API', async () => {
    const create = await request.post('/api/api-keys').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Simulation API Key',
      bankId
    });
    log('🔑', 'POST /api/api-keys', { status: create.status, key: create.body.data?.api_key, id: create.body.data?.id });
    const apiKeyId = create.body.data?.id;

    const list = await request.get('/api/api-keys').set('Authorization', `Bearer ${adminToken}`);
    log('🔑', `GET /api/api-keys — ${list.body.data?.length || 0} clés`);

    if (apiKeyId) {
      const del = await request.delete(`/api/api-keys/${apiKeyId}`).set('Authorization', `Bearer ${adminToken}`);
      log('🗑️', `DELETE /api/api-keys/${apiKeyId}`, { status: del.status });
    }
  });

  // ── 14. XML LOGS ──
  await step('14. Consulter les logs XML', async () => {
    const res = await request.get(`/api/xml-logs?bankId=${bankId}`).set('Authorization', `Bearer ${adminToken}`);
    log('📋', `GET /api/xml-logs — ${res.body.data?.length || 0} entrées`);
  });

  // ── 15. MONITORING ──
  await step('15. Monitoring santé système', async () => {
    const health = await request.get('/api/monitoring/health').set('Authorization', `Bearer ${adminToken}`);
    log('💚', 'GET /api/monitoring/health', { status: health.status, globalStatus: health.body.data?.globalStatus });
  });

  // ── 16. RBAC — BANK USER BLOCKED ──
  await step('16. Vérification RBAC — bank user ne peut pas créer de banque', async () => {
    const res = await request.post('/api/banks').set('Authorization', `Bearer ${bankUserToken}`).send({
      code: 'RBAC_TEST', name: 'Should Fail',
      source_url: '/tmp/e2e/source', destination_url: '/tmp/e2e/dest',
      old_url: '/tmp/e2e/archive', xml_output_url: '/tmp/e2e/xml'
    });
    log('🛡️', 'POST /api/banks (bank user — devrait être bloqué)', { status: res.status, message: res.body.message });
  });

  // ── 17. ERRORS ──
  await step('17. Gestion d\'erreurs', async () => {
    const noAuth = await request.get('/api/banks');
    log('🚫', 'GET /api/banks (sans token)', { status: noAuth.status, message: noAuth.body.message });

    const badToken = await request.get('/api/banks').set('Authorization', 'Bearer invalid_token');
    log('🚫', 'GET /api/banks (token invalide)', { status: badToken.status, message: badToken.body.message });

    const notFound = await request.get('/api/banks/999999').set('Authorization', `Bearer ${adminToken}`);
    log('🚫', 'GET /api/banks/999999 (inexistant)', { status: notFound.status, message: notFound.body.message });
  });

  // ── 18. CLEANUP ──
  await step('18. Nettoyage des données de simulation', async () => {
    await db.query(`DELETE FROM users WHERE username LIKE '${PREFIX}%'`);
    await db.query(`DELETE FROM banks WHERE code LIKE '${PREFIX}%'`);
    log('🧹', 'Données de simulation supprimées');
  });

  // ── SUMMARY ──
  console.log(`\n${'='.repeat(60)}`);
  console.log('  ✅ SIMULATION TERMINÉE AVEC SUCCÈS');
  console.log(`${'='.repeat(60)}`);
  console.log('\n  Étapes exécutées :');
  console.log('    1.  Health Check');
  console.log('    2.  Connexion admin');
  console.log('    3.  Liste des banques existantes');
  console.log('    4.  Création d\'une banque');
  console.log('    5.  Création d\'un utilisateur bank');
  console.log('    6.  Connexion bank user');
  console.log('    7.  Upload CSV valide (3 cartes)');
  console.log('    8.  Upload CSV avec doublon');
  console.log('    9.  Upload CSV PAN invalide');
  console.log('   10.  Consultation des enregistrements');
  console.log('   11.  Consultation historique');
  console.log('   12.  Logs d\'audit');
  console.log('   13.  Création/suppression clé API');
  console.log('   14.  Logs XML');
  console.log('   15.  Monitoring santé');
  console.log('   16.  Vérification RBAC');
  console.log('   17.  Gestion d\'erreurs');
  console.log('   18.  Nettoyage');
  console.log('');

  await db.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
