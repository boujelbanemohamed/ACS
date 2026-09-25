// Étape finale commune à toutes les sources (CSV, scanner, saisie manuelle, API) :
// enregistrement des cartes validées + génération du XML, de façon atomique.

const db = require('../config/database');
const xmlGenerator = require('./xmlGenerator');
const CSVProcessor = require('./csvProcessor');

const csvProcessor = new CSVProcessor();

async function withTransaction(fn) {
  // Sans pool (tests unitaires avec base simulée) : exécution directe
  if (!db.pool || typeof db.pool.connect !== 'function') return fn(db);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Enregistre les cartes et génère le XML. En cas d'échec, rien n'est enregistré
 * et le fichier XML éventuellement écrit est supprimé.
 * Les lignes reçues sont complétées avec leur `id` en base.
 * @returns {Promise<{savedRecords: object[], xmlResult: object|null}>}
 */
async function commitValidRecords({ bank, fileLogId = null, fileName, rows, generateXml = true }) {
  let xmlResult = null;

  try {
    const savedRecords = await withTransaction(async (client) => {
      const saved = await csvProcessor.saveValidatedRecords(bank.id, rows, fileName, client);
      rows.forEach((row, i) => {
        if (saved[i] && saved[i].id) row.id = saved[i].id;
      });

      if (generateXml && rows.length > 0) {
        xmlResult = await xmlGenerator.processAndGenerateXML(rows, bank, { client });
        if (!xmlResult.success) {
          throw new Error(xmlResult.message || 'Generation XML impossible');
        }
        await client.query(
          `INSERT INTO xml_logs (bank_id, file_log_id, xml_file_name, xml_file_path, records_count, xml_entries_count, status, processed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [bank.id, fileLogId, xmlResult.fileName, xmlResult.filePath, xmlResult.recordsCount, xmlResult.xmlEntriesCount, 'success']
        );
      }

      if (fileLogId) {
        await csvProcessor.updateFileLog(fileLogId, {
          status: 'success',
          output_path: xmlResult ? xmlResult.filePath : null,
          output_status: xmlResult ? 'success' : null
        }, client);
      }

      return saved;
    });

    return { savedRecords, xmlResult };
  } catch (error) {
    if (xmlResult && xmlResult.filePath) {
      await xmlGenerator.deleteXML(xmlResult.filePath);
    }
    if (fileLogId) {
      await csvProcessor.updateFileLog(fileLogId, { status: 'error', error_details: error.message }).catch(() => {});
    }
    throw error;
  }
}

module.exports = { commitValidRecords, withTransaction };
