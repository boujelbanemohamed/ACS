const { processingQueue } = require('./queueService');
const CSVProcessor = require('./csvProcessor');
const xmlGenerator = require('./xmlGenerator');
const recordHistoryService = require('./recordHistoryService');
const db = require('../config/database');
const { validateRowForHistory } = require('../utils/validationHelper');
const { encrypt, hashPan } = require('./encryptionService');
const auditService = require('./auditService');
const fs = require('fs');
const path = require('path');

const csvProcessor = new CSVProcessor();

processingQueue.process(async (job) => {
  const { jobType, bankId, userId, username, ipAddress } = job.data;

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

async function handleProcessUrl(job) {
  const { bankId, fileUrl, fileName, username, userId, ipAddress } = job.data;
  job.progress(5);

  const result = await csvProcessor.processFileFromURL(bankId, fileUrl, fileName);
  job.progress(30);

  if (result.success) {
    const savedRecords = await csvProcessor.saveValidatedRecords(bankId, result.validRecords, fileName);
    job.progress(50);
    for (let i = 0; i < result.validRecords.length; i++) {
      if (savedRecords[i]) result.validRecords[i].id = savedRecords[i].id;
    }

    for (let i = 0; i < result.validRecords.length; i++) {
      if (savedRecords[i]?.id) {
        try {
          const validation = validateRowForHistory(result.validRecords[i]);
          await recordHistoryService.logAttempt({
            processedRecordId: savedRecords[i].id,
            pan: result.validRecords[i].pan,
            bankId,
            validationResults: validation.results,
            status: validation.isValid ? 'SUCCESS' : (validation.errorCount > 0 ? 'REJECTED' : 'PARTIAL'),
            sourceType: 'url',
            fileName,
            username: username || 'SYSTEM',
            dataReceived: result.validRecords[i]
          });
        } catch (e) {
          console.error('History log error:', e.message);
        }
      }
    }
    job.progress(70);

    const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
    const bank = bankResult.rows[0];
    if (bank) {
      const xmlResult = await xmlGenerator.processAndGenerateXML(result.validRecords, bank);
      if (xmlResult && xmlResult.success) {
        await db.query(
          'INSERT INTO xml_logs (bank_id, file_log_id, xml_file_name, xml_file_path, records_count, xml_entries_count, status, processed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
          [bankId, result.fileLogId, xmlResult.fileName, xmlResult.filePath, result.validRecords.length, xmlResult.xmlEntriesCount, 'success']
        );
      }

      await csvProcessor.moveFileToDestination(
        `${fileUrl.replace(/\/[^/]+$/, '')}`,
        bank.destination_url,
        fileName
      );

      await csvProcessor.archiveOldFile(
        `${fileUrl.replace(/\/[^/]+$/, '')}`,
        bank.old_url,
        fileName
      );
    }
    job.progress(90);
  }

  const urlStatus = result.success ? 'SUCCESS' : 'PARTIAL';
  await auditService.logAction('PROCESS_URL', { tableName: 'file_logs', recordId: result.fileLogId, newData: { bankId, status: urlStatus, totalRows: result.validRecords.length } }, { user: { username: username || 'SYSTEM' } });

  job.progress(100);
  return {
    success: result.success,
    fileLogId: result.fileLogId,
    stats: result.stats,
    errors: result.errors,
    totalValidRows: result.validRecords.length,
    message: result.success ? 'Fichier traité avec succès' : 'Fichier traité avec des erreurs'
  };
}

async function handleUpload(job) {
  const { bankId, filePath, originalName, username } = job.data;
  job.progress(5);

  const { rows, errors, stats } = await csvProcessor.parseAndValidateCSV(filePath, bankId);
  job.progress(30);

  const fileLogId = await csvProcessor.createFileLog(bankId, originalName, filePath);

  await csvProcessor.updateFileLog(fileLogId, {
    total_rows: stats.totalRows,
    valid_rows: stats.validRows,
    invalid_rows: stats.invalidRows,
    duplicate_rows: stats.duplicateRows,
    status: errors.length > 0 ? 'validation_error' : 'success'
  });

  if (errors.length > 0) {
    await csvProcessor.saveValidationErrors(fileLogId, errors);
  } else {
    const savedRecords = await csvProcessor.saveValidatedRecords(bankId, rows, originalName);
    job.progress(50);
    for (let i = 0; i < rows.length; i++) {
      if (savedRecords[i]) rows[i].id = savedRecords[i].id;
    }

    const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
    const bank = bankResult.rows[0];
    if (bank) {
      await xmlGenerator.processAndGenerateXML(rows, bank);
    }
    job.progress(70);

    for (const row of rows) {
      if (row.id) {
        try {
          const validation = validateRowForHistory(row);
          await recordHistoryService.logAttempt({
            processedRecordId: row.id,
            pan: row.pan,
            bankId,
            validationResults: validation.results,
            status: validation.isValid ? 'SUCCESS' : (validation.errorCount > 0 ? 'REJECTED' : 'PARTIAL'),
            sourceType: 'upload',
            fileName: originalName,
            username: username || 'SYSTEM',
            dataReceived: row
          });
        } catch (e) {
          console.error('History log error:', e.message);
        }
      }
    }
    job.progress(90);
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (e) {}

  const uploadStatus = errors.filter(e => e.severity === 'error').length === 0 ? 'SUCCESS' : 'PARTIAL';
  await auditService.logAction('UPLOAD_FILE', { tableName: 'file_logs', recordId: fileLogId, newData: { bankId, status: uploadStatus, fileName: originalName, totalRows: stats.totalRows } }, { user: { username: username || 'SYSTEM' } });

  job.progress(100);
  return {
    success: errors.filter(e => e.severity === 'error').length === 0,
    fileLogId,
    stats,
    errors,
    totalValidRows: rows.length,
    message: errors.length > 0 ? 'Fichier traité avec des erreurs de validation' : 'Fichier traité avec succès'
  };
}

async function handleProcessManual(job) {
  const { bankId, entries, username } = job.data;
  job.progress(10);

  const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
  if (bankResult.rows.length === 0) {
    throw new Error('Banque non trouvée');
  }

  const bank = bankResult.rows[0];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `MANUAL_${bank.code}_${timestamp}`;

  const fileLogResult = await db.query(
    `INSERT INTO file_logs (bank_id, file_name, original_path, status, total_rows, valid_rows)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [bankId, `${fileName}.csv`, 'manual_entry', 'success', entries.length, entries.length]
  );
  const fileLogId = fileLogResult.rows[0].id;
  job.progress(20);

  const savedRecords = [];
  for (const entry of entries) {
    const encryptedPan = encrypt(entry.pan);
    const panHashVal = hashPan(entry.pan);
    const result = await db.query(
      `INSERT INTO processed_records (bank_id, language, first_name, last_name, pan, pan_hash, expiry, phone, behaviour, action, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (bank_id, pan_hash) DO UPDATE SET
         language = EXCLUDED.language,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         pan = EXCLUDED.pan,
         pan_hash = EXCLUDED.pan_hash,
         expiry = EXCLUDED.expiry,
         phone = EXCLUDED.phone,
         behaviour = EXCLUDED.behaviour,
         action = EXCLUDED.action,
         file_name = EXCLUDED.file_name,
         processed_at = CURRENT_TIMESTAMP
       RETURNING id, pan`,
      [bankId, entry.language, entry.firstName, entry.lastName, encryptedPan, panHashVal, entry.expiry, entry.phone, entry.behaviour, entry.action, `${fileName}.csv`]
    );
    savedRecords.push(result.rows[0]);
  }
  job.progress(50);

  const recordsForXml = entries.map((e, i) => ({
    id: savedRecords[i]?.id,
    pan: e.pan,
    phone: e.phone,
    firstName: e.firstName,
    lastName: e.lastName,
    expiry: e.expiry,
    language: e.language,
    behaviour: e.behaviour,
    action: e.action
  }));
  await xmlGenerator.processAndGenerateXML(recordsForXml, bank);
  job.progress(70);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (savedRecords[i]?.id) {
      try {
        const validation = validateRowForHistory(entry);
        await recordHistoryService.logAttempt({
          processedRecordId: savedRecords[i].id,
          pan: entry.pan,
          bankId,
          validationResults: validation.results,
          status: validation.isValid ? 'SUCCESS' : (validation.errorCount > 0 ? 'REJECTED' : 'PARTIAL'),
          sourceType: 'manual',
          fileName: `${fileName}.csv`,
          username: username || 'SYSTEM',
          dataReceived: entry
        });
      } catch (e) {
        console.error('History log error:', e.message);
      }
    }
  }
  job.progress(90);

  await auditService.logAction('PROCESS_MANUAL', { tableName: 'file_logs', recordId: fileLogId, newData: { bankId, entriesCount: entries.length, fileName: `${fileName}.csv` } }, { user: { username: username || 'SYSTEM' } });

  job.progress(100);
  return {
    success: true,
    fileLogId,
    csvFileName: `${fileName}.csv`,
    xmlFileName: `${fileName}.xml`,
    recordsProcessed: entries.length,
    xmlEntriesGenerated: entries.length * 2,
    message: `${entries.length} enregistrement(s) traite(s) avec succès.`
  };
}

async function handleCallApi(job) {
  const axios = require('axios');
  const { bankId, url, method, headers, body, authType, authToken, dataPath, username } = job.data;
  job.progress(5);

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

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
    timeout: 30000
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
      if (responseData && responseData[part] !== undefined) {
        responseData = responseData[part];
      } else {
        responseData = [];
        break;
      }
    }
  }

  if (!Array.isArray(responseData)) {
    responseData = [responseData];
  }

  const mappedRows = [];
  const validationErrors = [];

  responseData.forEach((item, index) => {
    const row = {
      language: item.language || item.lang || 'fr',
      firstName: item.firstName || item.first_name || item.prenom || '',
      lastName: item.lastName || item.last_name || item.nom || '',
      pan: item.pan || item.cardNumber || item.card_number || '',
      expiry: item.expiry || item.expiryDate || item.expiry_date || '',
      phone: item.phone || item.phoneNumber || item.phone_number || item.telephone || '',
      behaviour: item.behaviour || item.behavior || 'otp',
      action: item.action || 'update'
    };

    const rowErrors = [];
    if (!row.pan || row.pan.length < 13 || row.pan.length > 19) {
      rowErrors.push({ field: 'pan', message: 'PAN invalide' });
    }
    if (!row.phone) {
      rowErrors.push({ field: 'phone', message: 'Telephone requis' });
    }

    if (rowErrors.length > 0) {
      validationErrors.push({ rowNumber: index + 1, errors: rowErrors, data: row });
    } else {
      mappedRows.push(row);
    }
  });
  job.progress(40);

  const fileLogResult = await db.query(
    'INSERT INTO file_logs (bank_id, file_name, original_path, status, source_type, total_rows, valid_rows, invalid_rows) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [bankId, 'API_' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json', url, mappedRows.length > 0 ? 'success' : 'validation_error', 'api', responseData.length, mappedRows.length, validationErrors.length]
  );
  const fileLogId = fileLogResult.rows[0].id;
  job.progress(50);

  if (mappedRows.length > 0) {
    const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
    const bank = bankResult.rows[0];
    const fileName = 'API_' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json';

    const savedRecords = await csvProcessor.saveValidatedRecords(bankId, mappedRows, fileName);
    job.progress(65);
    for (let i = 0; i < mappedRows.length; i++) {
      if (savedRecords[i]) mappedRows[i].id = savedRecords[i].id;
    }

    for (let i = 0; i < mappedRows.length; i++) {
      if (savedRecords[i]?.id) {
        try {
          const validation = validateRowForHistory(mappedRows[i]);
          await recordHistoryService.logAttempt({
            processedRecordId: savedRecords[i].id,
            pan: mappedRows[i].pan,
            bankId,
            validationResults: validation.results,
            status: validation.isValid ? 'SUCCESS' : (validation.errorCount > 0 ? 'REJECTED' : 'PARTIAL'),
            sourceType: 'api',
            fileName,
            username: username || 'SYSTEM',
            dataReceived: mappedRows[i]
          });
        } catch (e) {
          console.error('History log error:', e.message);
        }
      }
    }
    job.progress(80);

    if (bank) {
      const recordsForXml = mappedRows.map(r => ({
        id: r.id, pan: r.pan, phone: r.phone, firstName: r.firstName,
        lastName: r.lastName, expiry: r.expiry, language: r.language,
        behaviour: r.behaviour, action: r.action
      }));
      const xmlResult = await xmlGenerator.processAndGenerateXML(recordsForXml, bank);
      if (xmlResult && xmlResult.success) {
        await db.query(
          'INSERT INTO xml_logs (bank_id, file_log_id, xml_file_name, xml_file_path, records_count, xml_entries_count, status, processed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
          [bankId, fileLogId, xmlResult.fileName, xmlResult.filePath, mappedRows.length, xmlResult.xmlEntriesCount, 'success']
        );
      }
    }
    job.progress(95);
  }

  await auditService.logAction('CALL_API', { tableName: 'file_logs', recordId: fileLogId, newData: { bankId, url, totalRows: responseData.length, validRows: mappedRows.length } }, { user: { username: username || 'SYSTEM' } });

  job.progress(100);
  return {
    success: true,
    fileLogId,
    validRows: mappedRows,
    errors: validationErrors,
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
