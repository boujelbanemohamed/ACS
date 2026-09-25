const { processingQueue } = require('./queueService');
const CSVProcessor = require('./csvProcessor');
const recordHistoryService = require('./recordHistoryService');
const { commitValidRecords } = require('./pipelineService');
const db = require('../config/database');
const { validateRowForHistory } = require('../utils/validationHelper');
const { validateCards } = require('../utils/cardValidation');
const { safeAxiosOptions, assertSafeUrl, isAllowlistedUrl } = require('../utils/urlSafety');
const { decrypt, maskPan } = require('./encryptionService');
const auditService = require('./auditService');
const remoteFileService = require('../utils/remoteFileService');
const fs = require('fs');

const csvProcessor = new CSVProcessor();

// En-têtes qu'un utilisateur ne peut pas imposer lors d'un appel d'API externe
const FORBIDDEN_HEADERS = ['host', 'content-length', 'connection', 'transfer-encoding', 'cookie', 'proxy-authorization'];

// Migrations et recalcul des empreintes de PAN terminés avant le premier traitement
const startupReady = process.env.NODE_ENV === 'test'
  ? Promise.resolve()
  : require('./startupTasks').runStartupTasks().catch((error) => {
    console.error('[Worker] Startup tasks failed:', error);
    process.exit(1);
  });

processingQueue.process(async (job) => {
  await startupReady;
  const { jobType } = job.data;

  job.progress(0);

  switch (jobType) {
    case 'process-url':
      return handleProcessUrl(job);
    case 'upload':
      return handleUpload(job);
    case 'process-manual':
      return handleProcessManual(job);
    case 'call-api':
      return handleCallApi(job);
    default:
      throw new Error(`Unknown job type: ${jobType}`);
  }
});

async function getBank(bankId) {
  const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
  if (bankResult.rows.length === 0) {
    throw new Error('Banque non trouvée');
  }
  return bankResult.rows[0];
}

async function logHistory(rows, { bankId, sourceType, fileName, fileLogId, username, userId, ipAddress }) {
  for (const row of rows) {
    if (!row.id) continue;
    try {
      const validation = validateRowForHistory(row);
      await recordHistoryService.logAttempt({
        processedRecordId: row.id,
        pan: row.pan,
        bankId,
        fileLogId,
        validationResults: validation.results,
        status: validation.isValid ? 'SUCCESS' : (validation.errorCount > 0 ? 'REJECTED' : 'PARTIAL'),
        sourceType,
        fileName,
        userId,
        username: username || 'SYSTEM',
        ipAddress,
        dataReceived: row
      });
    } catch (e) {
      console.error('History log error:', e.message);
    }
  }
}

// Dossier parent d'une URL de fichier (local, SFTP ou FTP)
const parentOf = (fileUrl) => fileUrl.replace(/\/[^/]+$/, '');

async function handleProcessUrl(job) {
  const {
    bankId, fileUrl, fileName, username, userId, ipAddress,
    corrections = [], sourceType = 'url', trustedUrl = false
  } = job.data;
  job.progress(5);

  const bank = await getBank(bankId);

  const result = await csvProcessor.processFileFromURL(bankId, fileUrl, fileName, { corrections, sourceType, trustedUrl });
  job.progress(30);

  let xmlResult = null;
  if (result.success) {
    ({ xmlResult } = await commitValidRecords({
      bank,
      fileLogId: result.fileLogId,
      fileName,
      rows: result.validRecords
    }));
    job.progress(60);

    await logHistory(result.validRecords, { bankId, sourceType, fileName, fileLogId: result.fileLogId, username, userId, ipAddress });
    job.progress(75);

    // Archivage puis déplacement (le déplacement supprime la source) — uniquement pour une source fichier
    if (!/^https?:\/\//.test(fileUrl)) {
      const sourceDir = parentOf(fileUrl);
      const archive = await csvProcessor.archiveOldFile(sourceDir, bank.old_url, fileName);
      const move = await csvProcessor.moveFileToDestination(sourceDir, bank.destination_url, fileName);
      await csvProcessor.updateFileLog(result.fileLogId, {
        archive_status: archive.success ? 'success' : 'error',
        destination_path: move.success ? move.destinationPath : null
      });
    }
    job.progress(90);
  }

  const urlStatus = result.success ? 'SUCCESS' : 'PARTIAL';
  await auditService.logAction('PROCESS_URL', { tableName: 'file_logs', recordId: result.fileLogId, newData: { bankId, status: urlStatus, totalRows: result.validRecords.length } }, { user: { id: userId, username: username || 'SYSTEM' }, ip: ipAddress });

  job.progress(100);
  return {
    success: result.success,
    fileLogId: result.fileLogId,
    stats: result.stats,
    errors: csvProcessor.sanitizeErrors(result.errors),
    totalValidRows: result.validRecords.length,
    xmlFileName: xmlResult ? xmlResult.fileName : null,
    message: result.success ? 'Fichier traité avec succès' : 'Fichier traité avec des erreurs'
  };
}

async function handleUpload(job) {
  const { bankId, filePath, originalName, username, userId, ipAddress } = job.data;
  job.progress(5);

  try {
    const bank = await getBank(bankId);

    const result = await csvProcessor.processUploadedFile(bankId, filePath, originalName);
    job.progress(30);

    let xmlResult = null;
    if (result.success) {
      ({ xmlResult } = await commitValidRecords({
        bank,
        fileLogId: result.fileLogId,
        fileName: originalName,
        rows: result.validRecords
      }));
      job.progress(70);

      await logHistory(result.validRecords, { bankId, sourceType: 'upload', fileName: originalName, fileLogId: result.fileLogId, username, userId, ipAddress });
      job.progress(90);
    }

    const uploadStatus = result.success ? 'SUCCESS' : 'PARTIAL';
    await auditService.logAction('UPLOAD_FILE', { tableName: 'file_logs', recordId: result.fileLogId, newData: { bankId, status: uploadStatus, fileName: originalName, totalRows: result.stats.totalRows } }, { user: { id: userId, username: username || 'SYSTEM' }, ip: ipAddress });

    job.progress(100);
    return {
      success: result.success,
      fileLogId: result.fileLogId,
      stats: result.stats,
      errors: csvProcessor.sanitizeErrors(result.errors),
      totalValidRows: result.success ? result.validRecords.length : 0,
      xmlFileName: xmlResult ? xmlResult.fileName : null,
      message: result.success
        ? 'Fichier traité avec succès'
        : 'Fichier traité avec des erreurs de validation'
    };
  } finally {
    await fs.promises.unlink(filePath).catch(() => {});
  }
}

async function handleProcessManual(job) {
  const { bankId, entries, username, userId, ipAddress } = job.data;
  job.progress(10);

  const bank = await getBank(bankId);

  // Les PAN sont chiffrés dans la file d'attente ; revalidation défensive avant enregistrement
  const { valid, invalid } = validateCards(entries.map(e => ({ ...e, pan: decrypt(e.pan) })));
  if (invalid.length > 0) {
    throw new Error(`${invalid.length} enregistrement(s) invalide(s)`);
  }
  const rows = valid.map(v => v.card);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `MANUAL_${bank.code}_${timestamp}.csv`;

  const fileLogResult = await db.query(
    `INSERT INTO file_logs (bank_id, file_name, original_path, status, source_type, total_rows, valid_rows)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [bankId, fileName, 'manual_entry', 'processing', 'manual', rows.length, rows.length]
  );
  const fileLogId = fileLogResult.rows[0].id;
  job.progress(20);

  const { xmlResult } = await commitValidRecords({ bank, fileLogId, fileName, rows });
  job.progress(70);

  await logHistory(rows, { bankId, sourceType: 'manual', fileName, fileLogId, username, userId, ipAddress });
  job.progress(90);

  await auditService.logAction('PROCESS_MANUAL', { tableName: 'file_logs', recordId: fileLogId, newData: { bankId, entriesCount: rows.length, fileName } }, { user: { id: userId, username: username || 'SYSTEM' }, ip: ipAddress });

  job.progress(100);
  return {
    success: true,
    fileLogId,
    csvFileName: fileName,
    xmlFileName: xmlResult ? xmlResult.fileName : null,
    recordsProcessed: rows.length,
    xmlEntriesGenerated: xmlResult ? xmlResult.xmlEntriesCount : 0,
    message: `${rows.length} enregistrement(s) traite(s) avec succès.`
  };
}

async function handleCallApi(job) {
  const axios = require('axios');
  const { bankId, url, method, headers, body, authType, dataPath, username, userId, ipAddress, trustedUrl = false } = job.data;
  const authToken = job.data.authToken ? decrypt(job.data.authToken) : job.data.authToken;
  job.progress(5);

  const bank = await getBank(bankId);

  if (!trustedUrl) {
    await assertSafeUrl(url, { protocols: ['http', 'https'] });
  }

  const requestHeaders = { 'Content-Type': 'application/json' };
  for (const [name, value] of Object.entries(headers || {})) {
    if (FORBIDDEN_HEADERS.includes(String(name).toLowerCase())) continue;
    requestHeaders[name] = value;
  }

  if (authType === 'bearer' && authToken) {
    requestHeaders['Authorization'] = 'Bearer ' + authToken;
  } else if (authType === 'basic' && authToken) {
    requestHeaders['Authorization'] = 'Basic ' + Buffer.from(authToken).toString('base64');
  } else if (authType === 'apikey' && authToken) {
    requestHeaders['X-API-Key'] = authToken;
  }

  const axiosConfig = {
    method: method || 'GET',
    url: url,
    headers: requestHeaders,
    timeout: 30000,
    ...(trustedUrl ? { maxRedirects: 5, maxContentLength: 10 * 1024 * 1024 } : safeAxiosOptions({ allowPrivate: isAllowlistedUrl(url) }))
  };

  if ((method === 'POST' || method === 'PUT') && body) {
    axiosConfig.data = body;
  }

  const apiResponse = await axios(axiosConfig);
  job.progress(20);

  let responseData = apiResponse.data;
  if (dataPath) {
    const pathParts = dataPath.split('.');
    for (const part of pathParts) {
      if (responseData && Object.prototype.hasOwnProperty.call(responseData, part)) {
        responseData = responseData[part];
      } else {
        responseData = [];
        break;
      }
    }
  }

  if (!Array.isArray(responseData)) {
    responseData = responseData ? [responseData] : [];
  }

  // Même validation que la saisie manuelle et l'API publique
  const { valid, invalid } = validateCards(responseData);
  const mappedRows = valid.map(v => v.card);
  const validationErrors = invalid.map(item => ({ rowNumber: item.index + 1, errors: item.errors }));
  job.progress(40);

  const fileName = 'API_' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json';
  const fileLogResult = await db.query(
    'INSERT INTO file_logs (bank_id, file_name, original_path, status, source_type, total_rows, valid_rows, invalid_rows) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [bankId, fileName, remoteFileService.isRemote(url) ? null : url.split('?')[0], mappedRows.length > 0 ? 'processing' : 'validation_error', 'api', responseData.length, mappedRows.length, validationErrors.length]
  );
  const fileLogId = fileLogResult.rows[0].id;
  job.progress(50);

  let xmlResult = null;
  if (mappedRows.length > 0) {
    ({ xmlResult } = await commitValidRecords({ bank, fileLogId, fileName, rows: mappedRows }));
    job.progress(80);

    await logHistory(mappedRows, { bankId, sourceType: 'api', fileName, fileLogId, username, userId, ipAddress });
    job.progress(95);
  }

  await auditService.logAction('CALL_API', { tableName: 'file_logs', recordId: fileLogId, newData: { bankId, url: url.split('?')[0], totalRows: responseData.length, validRows: mappedRows.length } }, { user: { id: userId, username: username || 'SYSTEM' }, ip: ipAddress });

  job.progress(100);
  return {
    success: true,
    fileLogId,
    // Le résultat est conservé dans Redis : jamais de PAN en clair
    validRows: mappedRows.map(r => ({ ...r, pan: maskPan(r.pan) })),
    errors: validationErrors,
    xmlFileName: xmlResult ? xmlResult.fileName : null,
    stats: {
      totalRows: responseData.length,
      validRows: mappedRows.length,
      invalidRows: validationErrors.length,
      duplicateRows: 0
    },
    message: 'API appelée avec succès'
  };
}

console.log('[Worker] CSV processing worker started');

module.exports = { handleProcessUrl, handleUpload, handleProcessManual, handleCallApi };
