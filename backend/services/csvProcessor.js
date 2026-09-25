const csv = require('csv-parser');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../config/database');
const recordHistoryService = require('./recordHistoryService');
const CSVValidator = require('../utils/csvValidator');
const { validateRowForHistory } = require('../utils/validationHelper');
const remoteFileService = require('../utils/remoteFileService');
const { encrypt, decrypt, hashPan, maskPan } = require('./encryptionService');
const { assertSafeUrl, safeAxiosOptions, isAllowlistedUrl } = require('../utils/urlSafety');
const { makeTempDir, removeDir } = require('../utils/paths');

const MAX_DOWNLOAD_SIZE = parseInt(process.env.MAX_DOWNLOAD_SIZE, 10) || 20 * 1024 * 1024;
const CSV_FIELDS = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];

// Une erreur "bloquante" empêche l'enregistrement du fichier ; un avertissement non
const isBlocking = (error) => (error.severity || 'error') === 'error';

// Retire les caractères de contrôle et échappe une valeur CSV (séparateur ;)
const csvCell = (value) => {
  const str = value === undefined || value === null ? '' : String(value);
  return /[;"\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
};

// Chemin local d'une URL file:// ou d'un chemin absolu (dossier conservé tel quel)
const toLocalPath = (url) => (url.startsWith('file://') ? url.slice(7) : url).replace(/\/+$/, '') || '/';

class CSVProcessor {
  constructor() {
    this.validator = new CSVValidator();
  }

  /**
   * Normalize row data - ensure consistent field names
   */
  normalizeRowData(row, rowNumber) {
    return {
      rowNumber: rowNumber,
      language: row.language || row.Language || row.LANGUAGE || '',
      firstName: row.firstName || row.firstname || row.FirstName || row.FIRSTNAME || row.first_name || row.prenom || row.Prenom || row.PRENOM || '',
      lastName: row.lastName || row.lastname || row.LastName || row.LASTNAME || row.last_name || row.nom || row.Nom || row.NOM || '',
      pan: row.pan || row.Pan || row.PAN || '',
      expiry: row.expiry || row.Expiry || row.EXPIRY || row.expiration || row.Expiration || '',
      phone: row.phone || row.Phone || row.PHONE || row.telephone || row.Telephone || row.TELEPHONE || '',
      behaviour: row.behaviour || row.Behaviour || row.BEHAVIOUR || '',
      action: row.action || row.Action || row.ACTION || ''
    };
  }

  /**
   * Regroupe les corrections par numéro de ligne : { rowNumber: { field: value } }
   */
  buildCorrectionMap(corrections = []) {
    const map = new Map();
    for (const c of corrections) {
      if (!c || !c.rowNumber || !CSV_FIELDS.includes(c.field)) continue;
      const value = c.encrypted ? decrypt(c.value) : c.value;
      if (!map.has(c.rowNumber)) map.set(c.rowNumber, {});
      map.get(c.rowNumber)[c.field] = value === undefined || value === null ? '' : String(value);
    }
    return map;
  }

  /**
   * Process CSV file from URL
   * @param {object} [options]
   * @param {object[]} [options.corrections] corrections saisies par l'utilisateur
   * @param {string} [options.sourceType] url | cron
   * @param {boolean} [options.trustedUrl] URL configurée par un administrateur (réseau interne autorisé)
   * @param {boolean} [options.skipIfUnchanged] ignore un fichier déjà rejeté et non modifié
   */
  async processFileFromURL(bankId, fileUrl, fileName, options = {}) {
    const { corrections = [], sourceType = 'url', trustedUrl = true, skipIfUnchanged = false } = options;
    const tempDir = await makeTempDir('acs-dl-');
    const tempFilePath = path.join(tempDir, 'input.csv');
    let fileLogId = null;

    try {
      try {
        await this.downloadFile(fileUrl, tempFilePath, { trustedUrl });
      } catch (downloadError) {
        // Échec de téléchargement tracé dans l'historique des fichiers
        fileLogId = await this.createFileLog(bankId, fileName, fileUrl, { sourceType });
        throw downloadError;
      }
      const fileHash = await this.hashFile(tempFilePath);

      if (skipIfUnchanged && await this.isUnchangedRejectedFile(bankId, fileName, fileHash)) {
        return { success: false, skipped: true, fileLogId: null, stats: null, errors: [], validRecords: [], allRows: [] };
      }

      fileLogId = await this.createFileLog(bankId, fileName, fileUrl, { sourceType, fileHash });

      const { rows, errors, stats, allRows } = await this.parseAndValidateCSV(tempFilePath, bankId, { corrections });
      const blockingCount = errors.filter(isBlocking).length;

      // Le statut "success" n'est posé qu'une fois les enregistrements et le XML générés
      await this.updateFileLog(fileLogId, {
        total_rows: stats.totalRows,
        valid_rows: stats.validRows,
        invalid_rows: stats.invalidRows,
        duplicate_rows: stats.duplicateRows,
        updated_rows: stats.updatedRows,
        status: blockingCount > 0 ? 'validation_error' : 'processing'
      });

      if (errors.length > 0) {
        await this.saveValidationErrors(fileLogId, errors);
      }

      return {
        success: blockingCount === 0,
        fileLogId,
        stats,
        errors,
        validRecords: rows,
        allRows: allRows
      };
    } catch (error) {
      if (fileLogId) {
        await this.updateFileLog(fileLogId, {
          status: 'error',
          error_details: error.message
        });
      }
      throw error;
    } finally {
      await removeDir(tempDir);
    }
  }

  /**
   * Process uploaded CSV file
   */
  async processUploadedFile(bankId, filePath, fileName) {
    const fileHash = await this.hashFile(filePath).catch(() => null);
    const fileLogId = await this.createFileLog(bankId, fileName, null, { sourceType: 'upload', fileHash });

    try {
      // Parse and validate CSV
      const { rows, errors, stats, allRows } = await this.parseAndValidateCSV(
        filePath,
        bankId
      );
      const blockingCount = errors.filter(isBlocking).length;

      // Update file log
      await this.updateFileLog(fileLogId, {
        total_rows: stats.totalRows,
        valid_rows: stats.validRows,
        invalid_rows: stats.invalidRows,
        duplicate_rows: stats.duplicateRows,
        updated_rows: stats.updatedRows,
        status: blockingCount > 0 ? 'validation_error' : 'processing'
      });

      // Save validation errors
      if (errors.length > 0) {
        await this.saveValidationErrors(fileLogId, errors);
      }

      return {
        success: blockingCount === 0,
        fileLogId,
        stats,
        errors,
        validRecords: rows,
        allRows: allRows
      };
    } catch (error) {
      await this.updateFileLog(fileLogId, {
        status: 'error',
        error_details: error.message
      });
      throw error;
    }
  }

  async hashFile(filePath) {
    const content = await fsp.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Vrai si le même fichier (même contenu) a déjà été rejeté pour erreurs de validation :
   * évite de le retraiter à chaque passage du scanner.
   */
  async isUnchangedRejectedFile(bankId, fileName, fileHash) {
    if (!fileHash) return false;
    const result = await db.query(
      `SELECT status, file_hash FROM file_logs
       WHERE bank_id = $1 AND file_name = $2
       ORDER BY processed_at DESC, id DESC LIMIT 1`,
      [bankId, fileName]
    );
    if (result.rows.length === 0) return false;
    const last = result.rows[0];
    return last.status === 'validation_error' && last.file_hash === fileHash;
  }

  /**
   * Download file from URL or copy from local path
   * @param {object} [options]
   * @param {boolean} [options.trustedUrl] autorise le réseau interne et les chemins locaux
   */
  async downloadFile(url, destPath, { trustedUrl = true } = {}) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!trustedUrl) {
        await assertSafeUrl(url, { protocols: ['http', 'https'] });
      }
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        ...(trustedUrl
          ? { maxRedirects: 5, maxContentLength: MAX_DOWNLOAD_SIZE }
          : safeAxiosOptions({ maxContentLength: MAX_DOWNLOAD_SIZE, allowPrivate: isAllowlistedUrl(url) }))
      });

      const writer = fs.createWriteStream(destPath);

      return new Promise((resolve, reject) => {
        let received = 0;
        response.data.on('data', (chunk) => {
          received += chunk.length;
          if (received > MAX_DOWNLOAD_SIZE) {
            response.data.destroy(new Error('Fichier trop volumineux'));
          }
        });
        response.data.on('error', reject);
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.pipe(writer);
      });
    }

    if (remoteFileService.isRemote(url)) {
      if (!trustedUrl) {
        await assertSafeUrl(url, { protocols: ['sftp', 'ftp'] });
      }
      await remoteFileService.copyToLocal(url, destPath);
      return;
    }

    if (!trustedUrl) {
      throw new Error('Chemin local non autorisé');
    }

    const cleanPath = url.replace('file://', '');
    try {
      await fsp.access(cleanPath);
    } catch {
      throw new Error(`File not found: ${cleanPath}`);
    }
    await fsp.cp(cleanPath, destPath);
  }

  /**
   * Parse and validate CSV file
   * @param {object} [options]
   * @param {object[]} [options.corrections] corrections à appliquer avant validation
   */
  async parseAndValidateCSV(filePath, bankId, { corrections = [] } = {}) {
    const correctionMap = this.buildCorrectionMap(corrections);

    return new Promise((resolve, reject) => {
      const rows = [];
      const errors = [];
      const allRows = [];
      const seenPans = new Set();
      let rowNumber = 0;

      const stats = {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0,
        updatedRows: 0
      };

      const pendingChecks = [];

      fs.createReadStream(filePath)
        .pipe(csv({ separator: ';' }))
        .on('headers', (headers) => {
          const headerValidation = this.validator.validateHeader(headers);
          if (!headerValidation.isValid) {
            headerValidation.errors.forEach(err => {
              errors.push({
                ...err,
                rowNumber: 0,
                rowData: null
              });
            });
          }
        })
        .on('data', (row) => {
          rowNumber++;
          stats.totalRows++;

          const normalizedRow = {
            ...this.normalizeRowData(row, rowNumber),
            ...(correctionMap.get(rowNumber) || {})
          };
          allRows.push(normalizedRow);

          if (Object.values(row).every(val => !val || val.trim() === '')) {
            return;
          }

          // La validation porte sur les valeurs normalisées (et corrigées)
          const { rowNumber: _ignored, ...canonical } = normalizedRow;
          const validation = this.validator.validateRow({ ...row, ...canonical }, rowNumber);
          const rowErrors = validation.errors || [];

          if (!validation.isValid) {
            stats.invalidRows++;
            rowErrors.forEach(err => {
              errors.push({
                ...err,
                rowNumber: rowNumber,
                rowData: { ...normalizedRow }
              });
            });
          } else {
            // Les avertissements sont conservés sans bloquer la ligne
            rowErrors.forEach(err => {
              errors.push({
                ...err,
                rowNumber: rowNumber,
                rowData: { ...normalizedRow }
              });
            });

            const pan = normalizedRow.pan;

            if (seenPans.has(pan)) {
              stats.duplicateRows++;
              stats.invalidRows++;
              errors.push({
                rowNumber: rowNumber,
                field: 'pan',
                value: pan,
                error: `PAN en double detecte dans le fichier (meme PAN que ligne precedente)`,
                severity: 'warning',
                rowData: { ...normalizedRow }
              });
            } else {
              seenPans.add(pan);
              const checkPromise = this.checkExistingPAN(bankId, pan).then(existing => {
                if (existing) {
                  stats.updatedRows++;
                }
                stats.validRows++;
                rows.push(normalizedRow);
              });
              pendingChecks.push(checkPromise);
            }
          }
        })
        .on('end', async () => {
          try {
            await Promise.all(pendingChecks);
            // Les vérifications asynchrones peuvent terminer dans le désordre
            rows.sort((a, b) => a.rowNumber - b.rowNumber);
            resolve({ rows, errors, stats, allRows });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  async checkExistingPAN(bankId, pan) {
    if (!pan) return false;
    const panHash = hashPan(pan);
    const result = await db.query(
      `SELECT id FROM processed_records WHERE bank_id = $1 AND pan_hash = $2 LIMIT 1`,
      [bankId, panHash]
    );
    return result.rows.length > 0;
  }

  /**
   * Log row attempt to history
   */
  async logRowHistory(bankId, row, fileLogId, fileName, sourceType, userId, username, ipAddress, status, processedRecordId = null, xmlId = null) {
    try {
      const validation = validateRowForHistory(row);

      await recordHistoryService.logAttempt({
        bankId,
        pan: row.pan || '',
        fileLogId,
        fileName,
        sourceType,
        userId,
        username,
        status,
        ipAddress,
        userAgent: null,
        dataReceived: row,
        validationResults: validation.results,
        processedRecordId,
        xmlId
      });
    } catch (error) {
      console.error('Error logging row history:', error);
      // Ne pas bloquer le traitement si l'historique échoue
    }
  }

  /**
   * Process and log all rows with history
   */
  async processRowsWithHistory(bankId, allRows, validRows, errors, fileLogId, fileName, sourceType, userId = null, username = null, ipAddress = null) {
    const validRowNumbers = new Set(validRows.map(v => v.rowNumber));
    const blockingRows = new Set(errors.filter(isBlocking).map(e => e.rowNumber));

    for (const row of allRows) {
      const isValid = validRowNumbers.has(row.rowNumber) && !blockingRows.has(row.rowNumber);
      const status = isValid ? 'SUCCESS' : 'REJECTED';

      await this.logRowHistory(
        bankId,
        row,
        fileLogId,
        fileName,
        sourceType,
        userId,
        username,
        ipAddress,
        status
      );
    }
  }

  /**
   * Save validated records to database
   * @param {object} [client] client de transaction (par défaut : pool)
   * @returns {Promise<Array<{id:number, pan:string}>>} aligné sur l'ordre de `rows`
   */
  async saveValidatedRecords(bankId, rows, fileName, client = db) {
    if (rows.length === 0) return [];

    const BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE) || 100;
    const idByHash = new Map();

    // Un même PAN ne peut apparaître qu'une fois par INSERT ... ON CONFLICT (on garde la dernière occurrence)
    const byHash = new Map();
    for (const row of rows) {
      byHash.set(hashPan(row.pan), row);
    }
    const uniqueRows = Array.from(byHash.entries());

    for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
      const batch = uniqueRows.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const [panHash, row] of batch) {
        const encryptedPan = encrypt(row.pan);
        values.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10})`
        );
        params.push(
          bankId,
          row.language,
          row.firstName || row.first_name,
          row.lastName || row.last_name,
          encryptedPan,
          panHash,
          row.expiry,
          row.phone,
          row.behaviour,
          row.action,
          fileName
        );
        paramIndex += 11;
      }

      const query = `
        INSERT INTO processed_records
          (bank_id, language, first_name, last_name, pan, pan_hash, expiry, phone, behaviour, action, file_name)
        VALUES ${values.join(', ')}
        ON CONFLICT (bank_id, pan_hash) DO UPDATE SET
          language = EXCLUDED.language,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          pan = EXCLUDED.pan,
          expiry = EXCLUDED.expiry,
          phone = EXCLUDED.phone,
          behaviour = EXCLUDED.behaviour,
          action = EXCLUDED.action,
          file_name = EXCLUDED.file_name,
          pan_hash = EXCLUDED.pan_hash,
          enrollment_status = 'pending',
          enrollment_error_code = NULL,
          enrollment_error_description = NULL,
          enrollment_date = NULL,
          processed_at = CURRENT_TIMESTAMP
        RETURNING id, pan, pan_hash
      `;

      const result = await client.query(query, params);
      result.rows.forEach((saved, index) => {
        const key = saved.pan_hash || (batch[index] && batch[index][0]);
        idByHash.set(key, saved.id);
      });
    }

    // Résultat aligné sur les lignes reçues (RETURNING ne garantit pas l'ordre)
    return rows.map(row => ({ id: idByHash.get(hashPan(row.pan)), pan: row.pan }));
  }

  /**
   * Create file log entry
   */
  async createFileLog(bankId, fileName, originalPath, { sourceType = 'upload', fileHash = null } = {}) {
    const query = `
      INSERT INTO file_logs (bank_id, file_name, original_path, status, source_type, file_hash)
      VALUES ($1, $2, $3, 'processing', $4, $5)
      RETURNING id
    `;

    const result = await db.query(query, [bankId, fileName, originalPath, sourceType, fileHash]);
    return result.rows[0].id;
  }

  /**
   * Update file log
   */
  async updateFileLog(fileLogId, updates, client = db) {
    const allowedColumns = [
      'total_rows', 'valid_rows', 'invalid_rows', 'duplicate_rows', 'updated_rows',
      'status', 'error_details', 'destination_path', 'archive_path', 'output_path',
      'archive_status', 'output_status', 'validation_status', 'file_hash'
    ];
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (!allowedColumns.includes(key)) return;
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    if (fields.length === 0) return;

    values.push(fileLogId);

    const query = `
      UPDATE file_logs
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
    `;

    await client.query(query, values);
  }

  /**
   * Save validation errors (la valeur d'un PAN est chiffrée)
   */
  async saveValidationErrors(fileLogId, errors) {
    if (errors.length === 0) return;

    const BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE) || 100;

    for (let i = 0; i < errors.length; i += BATCH_SIZE) {
      const batch = errors.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const error of batch) {
        const rawValue = error.value || '';
        const value = error.field === 'pan' && rawValue ? encrypt(String(rawValue)) : rawValue;
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
        params.push(
          fileLogId,
          error.rowNumber || null,
          error.field,
          value,
          error.error,
          error.severity || 'error'
        );
        paramIndex += 6;
      }

      const query = `
        INSERT INTO validation_errors
          (file_log_id, row_number, field_name, field_value, error_message, severity)
        VALUES ${values.join(', ')}
      `;

      await db.query(query, params);
    }
  }

  /**
   * Version des erreurs sans PAN en clair (réponses API, résultats de job)
   */
  sanitizeErrors(errors = []) {
    return errors.map(error => {
      const safe = { ...error };
      if (safe.field === 'pan' && safe.value) safe.value = maskPan(String(safe.value));
      if (safe.rowData && safe.rowData.pan) safe.rowData = { ...safe.rowData, pan: maskPan(String(safe.rowData.pan)) };
      return safe;
    });
  }

  /**
   * Check for new files in a directory
   */
  async checkForNewFiles(sourceUrl) {
    try {
      console.log(`Checking for new files at: ${sourceUrl}`);

      if (remoteFileService.isRemote(sourceUrl)) {
        const files = await remoteFileService.listFiles(sourceUrl, '.csv');
        return files;
      }

      const response = await axios.get(sourceUrl, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      const files = [];

      if (response.status === 200 && response.data) {
        if (Array.isArray(response.data.files)) {
          files.push(...response.data.files.filter(f => f.endsWith('.csv')));
        }
      }

      return files;
    } catch (error) {
      console.error(`Error checking for files at ${sourceUrl}:`, error.message);
      return [];
    }
  }

  /**
   * Déplace le fichier source vers le dossier de destination.
   * `sourceUrl` et `destinationUrl` désignent des dossiers.
   */
  async moveFileToDestination(sourceUrl, destinationUrl, fileName) {
    const isSftpSource = remoteFileService.isRemote(sourceUrl);
    const isSftpDest = remoteFileService.isRemote(destinationUrl);
    const sourceDir = sourceUrl.replace(/\/+$/, '');
    const destDir = destinationUrl.replace(/\/+$/, '');

    console.log(`Moving file ${fileName} to destination`);

    try {
      if (isSftpSource || isSftpDest) {
        const fullSourceUrl = `${sourceDir}/${fileName}`;
        const fullDestUrl = `${destDir}/${fileName}`;

        if (isSftpSource && isSftpDest) {
          await remoteFileService.moveFile(fullSourceUrl, fullDestUrl);
        } else if (isSftpSource) {
          const localDest = toLocalPath(destinationUrl);
          await fsp.mkdir(localDest, { recursive: true });
          await remoteFileService.copyToLocal(fullSourceUrl, path.join(localDest, fileName));
          await remoteFileService.deleteFile(fullSourceUrl);
        } else {
          const localSource = path.join(toLocalPath(sourceUrl), fileName);
          await remoteFileService.copyFromLocal(localSource, fullDestUrl);
          await fsp.unlink(localSource);
        }
      } else {
        const sourcePath = toLocalPath(sourceUrl);
        const destPath = toLocalPath(destinationUrl);

        await fsp.access(path.join(sourcePath, fileName));
        await fsp.mkdir(destPath, { recursive: true });
        await fsp.cp(path.join(sourcePath, fileName), path.join(destPath, fileName));
        await fsp.unlink(path.join(sourcePath, fileName));
      }
      return {
        success: true,
        destinationPath: `${destDir}/${fileName}`
      };
    } catch (error) {
      console.error(`Failed to move file: ${error.message}`);
      return { success: false, destinationPath: `${destDir}/${fileName}`, error: error.message };
    }
  }

  /**
   * Copie le fichier source dans le dossier d'archives sous le nom OLD_<date>_<fichier>.
   * Doit être appelé AVANT moveFileToDestination (qui supprime la source).
   */
  async archiveOldFile(sourceUrl, archiveUrl, fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const oldFileName = `OLD_${timestamp}_${fileName}`;
    const isSftpSource = remoteFileService.isRemote(sourceUrl);
    const isSftpArchive = remoteFileService.isRemote(archiveUrl);
    const sourceDir = sourceUrl.replace(/\/+$/, '');
    const archiveDir = archiveUrl.replace(/\/+$/, '');

    console.log(`Archiving file ${fileName} as ${oldFileName}`);

    let tempDir = null;
    try {
      if (isSftpSource || isSftpArchive) {
        const fullSourceUrl = `${sourceDir}/${fileName}`;
        const fullArchiveUrl = `${archiveDir}/${oldFileName}`;

        if (isSftpSource && isSftpArchive) {
          // Copie via un fichier temporaire : fonctionne aussi entre deux serveurs différents
          tempDir = await makeTempDir('acs-archive-');
          const temp = path.join(tempDir, oldFileName);
          await remoteFileService.copyToLocal(fullSourceUrl, temp);
          await remoteFileService.copyFromLocal(temp, fullArchiveUrl);
        } else if (isSftpSource) {
          const localArchive = toLocalPath(archiveUrl);
          await fsp.mkdir(localArchive, { recursive: true });
          await remoteFileService.copyToLocal(fullSourceUrl, path.join(localArchive, oldFileName));
        } else {
          const localPath = path.join(toLocalPath(sourceUrl), fileName);
          await fsp.access(localPath);
          await remoteFileService.copyFromLocal(localPath, fullArchiveUrl);
        }
      } else {
        const sourcePath = toLocalPath(sourceUrl);
        const archivePath = toLocalPath(archiveUrl);

        await fsp.access(path.join(sourcePath, fileName));
        await fsp.mkdir(archivePath, { recursive: true });
        await fsp.cp(path.join(sourcePath, fileName), path.join(archivePath, oldFileName));
      }
      return {
        success: true,
        archivePath: `${archiveDir}/${oldFileName}`
      };
    } catch (error) {
      console.error(`Failed to archive file: ${error.message}`);
      return { success: false, archivePath: `${archiveDir}/${oldFileName}`, error: error.message };
    } finally {
      await removeDir(tempDir);
    }
  }

  /**
   * Construit le CSV corrigé à partir des enregistrements en base (PAN déchiffré)
   */
  buildCorrectedCSV(rows) {
    let csvContent = CSV_FIELDS.join(';') + '\n';

    rows.forEach(row => {
      const record = {
        language: row.language,
        firstName: row.firstName ?? row.first_name,
        lastName: row.lastName ?? row.last_name,
        pan: row.pan ? decrypt(row.pan) : '',
        expiry: row.expiry,
        phone: row.phone,
        behaviour: row.behaviour,
        action: row.action
      };
      csvContent += CSV_FIELDS.map(field => csvCell(record[field])).join(';') + '\n';
    });

    return csvContent;
  }

  /**
   * Generate corrected CSV file
   */
  async generateCorrectedCSV(rows, outputPath) {
    await fsp.writeFile(outputPath, this.buildCorrectedCSV(rows));
    return outputPath;
  }
}

CSVProcessor.isBlocking = isBlocking;

module.exports = CSVProcessor;
