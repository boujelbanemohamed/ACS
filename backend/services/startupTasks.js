// Tâches exécutées au démarrage de l'API et du worker, une seule fois pour tout le cluster
// (verrou PostgreSQL) : migrations SQL en attente puis recalcul des empreintes de PAN.

const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { decrypt, hashPan } = require('./encryptionService');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const STARTUP_LOCK_ID = 7340010;
const PAN_HASH_VERSION = '2';

async function runMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows } = await client.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map(r => r.version));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`▶  Migration ${file}...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, file]);
      await client.query('COMMIT');
      console.log(`✓  Migration ${file} appliquée`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration ${file} en échec: ${error.message}`);
    }
  }
}

// Remplace les anciennes empreintes SHA-256 (sans clé) par des empreintes HMAC
async function migratePanHashes(client) {
  if (!process.env.PAN_ENCRYPTION_KEY && !process.env.PAN_HASH_KEY) return;

  const current = await client.query("SELECT value FROM settings WHERE key = 'pan_hash_version'");
  if (current.rows[0] && current.rows[0].value === PAN_HASH_VERSION) return;

  console.log('▶  Recalcul des empreintes de PAN (HMAC)...');
  await client.query('BEGIN');
  try {
    let updated = 0;
    for (const table of ['processed_records', 'record_history']) {
      let lastId = 0;
      for (;;) {
        const batch = await client.query(
          `SELECT id, pan FROM ${table} WHERE id > $1 ORDER BY id LIMIT 500`,
          [lastId]
        );
        if (batch.rows.length === 0) break;
        for (const row of batch.rows) {
          lastId = row.id;
          const pan = decrypt(row.pan);
          if (!pan || !/^\d{12,19}$/.test(pan)) continue;
          await client.query(`UPDATE ${table} SET pan_hash = $1 WHERE id = $2`, [hashPan(pan), row.id]);
          updated++;
        }
      }
    }
    await client.query(
      `INSERT INTO settings (key, value, description, updated_at)
       VALUES ('pan_hash_version', $1, 'Version de l''empreinte des PAN', CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [PAN_HASH_VERSION]
    );
    await client.query('COMMIT');
    console.log(`✓  ${updated} empreinte(s) de PAN recalculée(s)`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error(`Recalcul des empreintes de PAN en échec: ${error.message}`);
  }
}

async function runStartupTasks() {
  if (!db.pool || typeof db.pool.connect !== 'function') return;

  const client = await db.pool.connect();
  try {
    // Bloquant : les autres instances attendent la fin des migrations
    await client.query('SELECT pg_advisory_lock($1)', [STARTUP_LOCK_ID]);
    await runMigrations(client);
    await migratePanHashes(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [STARTUP_LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { runStartupTasks, runMigrations, migratePanHashes };
