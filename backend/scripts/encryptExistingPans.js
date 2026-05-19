// Script de migration : chiffre les PANs existants en base
// Usage: PAN_ENCRYPTION_KEY=your_key node scripts/encryptExistingPans.js
require('dotenv').config();
const db = require('../config/database');
const { encrypt, hashPan } = require('../services/encryptionService');

async function migrateTable(table, idColumn, batchSize = 100) {
  console.log(`Migration de ${table}...`);
  let offset = 0;
  let total = 0;

  while (true) {
    const { rows } = await db.query(
      `SELECT ${idColumn}, pan FROM ${table} 
       WHERE pan IS NOT NULL AND pan != '' AND pan NOT LIKE '%:%' 
       ORDER BY ${idColumn} LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      try {
        const encryptedPan = encrypt(row.pan);
        const hashedPan = hashPan(row.pan);
        await db.query(
          `UPDATE ${table} SET pan = $1, pan_hash = $2 WHERE ${idColumn} = $3`,
          [encryptedPan, hashedPan, row[idColumn]]
        );
        total++;
      } catch (err) {
        console.error(`Erreur row ${row[idColumn]}: ${err.message}`);
      }
    }

    offset += batchSize;
    console.log(`  ${total} PANs chiffrés...`);
  }

  console.log(`Terminé: ${total} PANs chiffrés dans ${table}`);
  return total;
}

async function main() {
  try {
    console.log('=== Migration PAN Encryption ===\n');

    const tables = [
      { table: 'processed_records', idColumn: 'id' },
      { table: 'record_history', idColumn: 'id' },
    ];

    let grandTotal = 0;
    for (const t of tables) {
      grandTotal += await migrateTable(t.table, t.idColumn);
    }

    console.log(`\n✅ Migration terminée: ${grandTotal} PANs chiffrés au total`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  }
}

main();
