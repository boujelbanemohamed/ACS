#!/usr/bin/env node
// Migration runner — exécute les migrations SQL non encore appliquées
// Usage: node scripts/migrate.js

const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function run() {
  // Ensure migration table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows: applied } = await db.query('SELECT version FROM schema_migrations ORDER BY version');
  const appliedSet = new Set(applied.map(r => r.version));

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (appliedSet.has(version)) {
      console.log(`⏭  ${file} déjà appliquée`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`▶  Application de ${file}...`);

    try {
      await db.query(sql);
      await db.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [version, file]
      );
      console.log(`✓  ${file} appliquée`);
      count++;
    } catch (err) {
      console.error(`✗  ERREUR ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  if (count === 0) {
    console.log('Aucune nouvelle migration à appliquer.');
  } else {
    console.log(`${count} migration(s) appliquée(s).`);
  }

  process.exit(0);
}

run();
