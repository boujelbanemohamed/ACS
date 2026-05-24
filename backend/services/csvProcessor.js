const csv = require('csv-parser');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const axios = require('axios');
const db = require('../config/database');
const recordHistoryService = require('./recordHistoryService');
const CSVValidator = require('../utils/csvValidator');
const { validateRowForHistory } = require('../utils/validationHelper');
const remoteFileService = require('../utils/remoteFileService');
const { encrypt, decrypt, hashPan } = require('./encryptionService');

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
   * Process CSV file from URL
   */
  async processFileFromURL(bankId, fileUrl, fileName) {
    const fileLogId = await this.createFileLog(bankId, fileName, fileUrl);
    
    try {
      // Download file
      const tempFilePath = path.join('/tmp', fileName);
      await this.downloadFile(fileUrl, tempFilePath);

      // Parse and validate CSV
      const { rows, errors, stats, allRows } = await this.parseAndValidateCSV(
        tempFilePath,
        bankId
      );

      // Update file log
      await this.updateFileLog(fileLogId, {
        total_rows: stats.totalRows,
        valid_rows: stats.validRows,
        invalid_rows: stats.invalidRows,
        duplicate_rows: stats.duplicateRows,
        updated_rows: stats.updatedRows,
        status: errors.length > 0 ? 'validation_error' : 'success'
      });

      // Save validation errors
      if (errors.length > 0) {
        await this.saveValidationErrors(fileLogId, errors);
      }

      // Clean up temp file
      await fsp.unlink(tempFilePath);

      return {
        success: errors.length === 0,
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

  /**
   * Process uploaded CSV file
   */
  async processUploadedFile(bankId, filePath, fileName) {
    const fileLogId = await this.createFileLog(bankId, fileName, filePath);
    
    try {
      // Parse and validate CSV
      const { rows, errors, stats, allRows } = await this.parseAndValidateCSV(
        filePath,
        bankId
      );

      // Update file log
      await this.updateFileLog(fileLogId, {
        total_rows: stats.totalRows,
        valid_rows: stats.validRows,
        invalid_rows: stats.invalidRows,
        duplicate_rows: stats.duplicateRows,
        updated_rows: stats.updatedRows,
        status: errors.length > 0 ? 'validation_error' : 'success'
      });

      // Save validation errors
      if (errors.length > 0) {
        await this.saveValidationErrors(fileLogId, errors);
      }

      return {
        success: errors.length === 0,
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

  /**
   * Download file from URL or copy from local path
   */
  async downloadFile(url, destPath) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000
      });

      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    }

    if (remoteFileService.isRemote(url)) {
      await remoteFileService.copyToLocal(url, destPath);
      return;
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
   */
  async parseAndValidateCSV(filePath, bankId) {
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

          const normalizedRow = this.normalizeRowData(row, rowNumber);
          allRows.push(normalizedRow);

          if (Object.values(row).every(val => !val || val.trim() === '')) {
            return;
          }

          const validation = this.validator.validateRow(row, rowNumber);
          
          if (!validation.isValid) {
            stats.invalidRows++;
            validation.errors.forEach(err => {
              errors.push({
                ...err,
                rowNumber: rowNumber,
                rowData: { ...normalizedRow }
              });
            });
          } else {
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
          await Promise.all(pendingChecks);
          resolve({ rows, errors, stats, allRows });
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
    for (const row of allRows) {
      const rowErrors = errors.filter(e => e.rowNumber === row.rowNumber);
      const isValid = rowErrors.length === 0 && validRows.some(v => v.pan === row.pan);
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
   */
  async saveValidatedRecords(bankId, rows, fileName) {
    if (rows.length === 0) return [];

    const BATCH_SIZE = parseInt(process.env.DB_BATCH_SIZE) || 100;
    const saved = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const row of batch) {
        const encryptedPan = encrypt(row.pan);
        const panHash = hashPan(row.pan);
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
        RETURNING id, pan
      `;

      const result = await db.query(query, params);
      for (const row of result.rows) {
        saved.push({ ...row, pan: decrypt(row.pan) });
      }
    }

    return saved;
  }

  /**
   * Create file log entry
   */
  async createFileLog(bankId, fileName, originalPath) {
    const query = `
      INSERT INTO file_logs (bank_id, file_name, original_path, status)
      VALUES ($1, $2, $3, 'processing')
      RETURNING id
    `;
    
    const result = await db.query(query, [bankId, fileName, originalPath]);
    return result.rows[0].id;
  }

  /**
   * Update file log
   */
  async updateFileLog(fileLogId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    values.push(fileLogId);

    const query = `
      UPDATE file_logs 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
    `;

    await db.query(query, values);
  }

  /**
   * Save validation errors
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
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
        params.push(
          fileLogId,
          error.rowNumber || null,
          error.field,
          error.value || '',
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
   * Move file to destination (local filesystem)
   */
  async moveFileToDestination(sourceUrl, destinationUrl, fileName) {
    const isSftpSource = remoteFileService.isRemote(sourceUrl);
    const isSftpDest = remoteFileService.isRemote(destinationUrl);

    console.log(`Moving file from ${sourceUrl}/${fileName} to ${destinationUrl}/${fileName}`);

    try {
      if (isSftpSource || isSftpDest) {
        const fullSourceUrl = `${sourceUrl}/${fileName}`;
        const fullDestUrl = `${destinationUrl}/${fileName}`;

        if (isSftpSource && isSftpDest) {
          await remoteFileService.moveFile(fullSourceUrl, fullDestUrl);
        } else if (isSftpSource) {
          await remoteFileService.copyToLocal(fullSourceUrl, path.join(destinationUrl.replace('file://', ''), fileName));
          await remoteFileService.deleteFile(fullSourceUrl);
        } else {
          await remoteFileService.copyFromLocal(path.join(sourceUrl.replace('file://', ''), fileName), fullDestUrl);
          await fsp.unlink(path.join(sourceUrl.replace('file://', ''), fileName));
        }
      } else {
        const sourcePath = sourceUrl.startsWith('file://') ? sourceUrl.slice(7) : sourceUrl.replace(/\/[^/]+$/, '');
        const destPath = destinationUrl.startsWith('file://') ? destinationUrl.slice(7) : destinationUrl;

        try {
          await fsp.access(sourcePath);
          await fsp.mkdir(destPath, { recursive: true });
          await fsp.cp(path.join(sourcePath, fileName), path.join(destPath, fileName));
          await fsp.unlink(path.join(sourcePath, fileName));
        } catch (e) {
          if (e.code === 'ENOENT') {
            console.warn(`Source file not found: ${path.join(sourcePath, fileName)}`);
          } else {
            throw e;
          }
        }
      }
      return {
        success: true,
        destinationPath: `${destinationUrl}/${fileName}`
      };
    } catch (error) {
      console.error(`Failed to move file: ${error.message}`);
      return { success: false, destinationPath: `${destinationUrl}/${fileName}` };
    }
  }

  async archiveOldFile(sourceUrl, archiveUrl, fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const oldFileName = `OLD_${timestamp}_${fileName}`;
    const isSftpSource = remoteFileService.isRemote(sourceUrl);
    const isSftpArchive = remoteFileService.isRemote(archiveUrl);

    console.log(`Archiving file from ${sourceUrl}/${fileName} to ${archiveUrl}/${oldFileName}`);

    try {
      if (isSftpSource || isSftpArchive) {
        const fullSourceUrl = `${sourceUrl}/${fileName}`;
        const fullArchiveUrl = `${archiveUrl}/${oldFileName}`;

        if (isSftpSource && isSftpArchive) {
          if (remoteFileService.isRemote(fullSourceUrl)) {
            let sftp;
            try {
              sftp = await remoteFileService.connect(fullSourceUrl);
              const srcConfig = remoteFileService.parseUrl(fullSourceUrl);
              const dstConfig = remoteFileService.parseUrl(fullArchiveUrl);
              const destDir = dstConfig.remotePath.substring(0, dstConfig.remotePath.lastIndexOf('/') + 1);
              try { await sftp.mkdir(destDir, true); } catch {}
              const exists = await sftp.exists(srcConfig.remotePath).catch(() => false);
              if (exists) {
                const temp = '/tmp/' + oldFileName;
                await sftp.fastGet(srcConfig.remotePath, temp);
                await sftp.fastPut(temp, dstConfig.remotePath);
                await fsp.unlink(temp);
              }
            } finally {
              if (sftp) await sftp.end();
            }
          }
        } else if (isSftpSource) {
          await remoteFileService.copyToLocal(fullSourceUrl, '/tmp/' + oldFileName);
        } else {
          const localPath = path.join(sourceUrl.replace('file://', ''), fileName);
          if (fs.existsSync(localPath)) {
            await remoteFileService.copyFromLocal(localPath, fullArchiveUrl);
          }
        }
      } else {
        const sourcePath = sourceUrl.startsWith('file://') ? sourceUrl.slice(7) : sourceUrl.replace(/\/[^/]+$/, '');
        const archivePath = archiveUrl.startsWith('file://') ? archiveUrl.slice(7) : archiveUrl;

        try {
          await fsp.access(sourcePath);
          await fsp.mkdir(archivePath, { recursive: true });
          await fsp.cp(path.join(sourcePath, fileName), path.join(archivePath, oldFileName));
        } catch (e) {
          if (e.code === 'ENOENT') {
            console.warn(`Source file not found: ${path.join(sourcePath, fileName)}`);
          } else {
            throw e;
          }
        }
      }
      return {
        success: true,
        archivePath: `${archiveUrl}/${oldFileName}`
      };
    } catch (error) {
      console.error(`Failed to move file: ${error.message}`);
      return { success: false, archivePath: `${archiveUrl}/${oldFileName}` };
    }
  }

  /**
   * Generate corrected CSV file
   */
  async generateCorrectedCSV(rows, outputPath) {
    const headers = [
      'language',
      'firstName',
      'lastName',
      'pan',
      'expiry',
      'phone',
      'behaviour',
      'action'
    ];

    let csvContent = headers.join(';') + '\n';
    
    rows.forEach(row => {
      const values = headers.map(header => row[header] || '');
      csvContent += values.join(';') + '\n';
    });

    await fsp.writeFile(outputPath, csvContent);
    return outputPath;
  }
}

module.exports = CSVProcessor;
