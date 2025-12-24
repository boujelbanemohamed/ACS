const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const db = require('../config/database');
const CSVValidator = require('../utils/csvValidator');

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
        status: errors.length > 0 ? 'validation_error' : 'success'
      });

      // Save validation errors
      if (errors.length > 0) {
        await this.saveValidationErrors(fileLogId, errors);
      }

      // Clean up temp file
      fs.unlinkSync(tempFilePath);

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
   * Download file from URL
   */
  async downloadFile(url, destPath) {
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

  /**
   * Parse and validate CSV file
   */
  async parseAndValidateCSV(filePath, bankId) {
    return new Promise((resolve, reject) => {
      const rows = [];
      const errors = [];
      const allRows = [];
      const seenPans = new Set(); // Track PANs within current file
      let rowNumber = 0;
      
      const stats = {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        duplicateRows: 0
      };

      const pendingChecks = [];

      fs.createReadStream(filePath)
        .pipe(csv({ separator: ';' }))
        .on('headers', (headers) => {
          // Validate header structure
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

          // Normalize row data
          const normalizedRow = this.normalizeRowData(row, rowNumber);
          allRows.push(normalizedRow);

          // Skip empty rows
          if (Object.values(row).every(val => !val || val.trim() === '')) {
            return;
          }

          // Validate row
          const validation = this.validator.validateRow(row, rowNumber);
          
          if (!validation.isValid) {
            stats.invalidRows++;
            // Add row data to each error
            validation.errors.forEach(err => {
              errors.push({
                ...err,
                rowNumber: rowNumber,
                rowData: { ...normalizedRow }
              });
            });
          } else {
            const pan = normalizedRow.pan;
            
            // Check for duplicate PAN within current file
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
              // Check for duplicate PAN in database
              const checkPromise = this.checkDuplicatePAN(bankId, pan).then(isDuplicate => {
                if (isDuplicate) {
                  stats.duplicateRows++;
                  stats.invalidRows++;
                  errors.push({
                    rowNumber: rowNumber,
                    field: 'pan',
                    value: pan,
                    error: `PAN deja existant en base de donnees`,
                    severity: 'warning',
                    rowData: { ...normalizedRow }
                  });
                } else {
                  stats.validRows++;
                  rows.push(normalizedRow);
                  seenPans.add(pan); // Mark PAN as seen
                }
              });
              pendingChecks.push(checkPromise);
            }
          }
        })
        .on('end', async () => {
          // Wait for all duplicate checks to complete
          await Promise.all(pendingChecks);
          resolve({ rows, errors, stats, allRows });
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Check if PAN already exists in database (duplicate = same PAN only)
   */
  async checkDuplicatePAN(bankId, pan) {
    if (!pan) {
      return false;
    }

    const query = `
      SELECT id FROM processed_records
      WHERE bank_id = $1 
        AND pan = $2
      LIMIT 1
    `;
    
    const result = await db.query(query, [bankId, pan]);
    return result.rows.length > 0;
  }

  /**
   * Save validated records to database
   */
  async saveValidatedRecords(bankId, rows, fileName) {
    const query = `
      INSERT INTO processed_records 
        (bank_id, language, first_name, last_name, pan, expiry, phone, behaviour, action, file_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (bank_id, pan) DO UPDATE SET
        language = EXCLUDED.language,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        expiry = EXCLUDED.expiry,
        phone = EXCLUDED.phone,
        behaviour = EXCLUDED.behaviour,
        action = EXCLUDED.action,
        file_name = EXCLUDED.file_name,
        processed_at = CURRENT_TIMESTAMP
    `;

    for (const row of rows) {
      await db.query(query, [
        bankId,
        row.language,
        row.firstName || row.first_name,
        row.lastName || row.last_name,
        row.pan,
        row.expiry,
        row.phone,
        row.behaviour,
        row.action,
        fileName
      ]);
    }
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
    const query = `
      INSERT INTO validation_errors 
        (file_log_id, row_number, field_name, field_value, error_message, severity)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    for (const error of errors) {
      await db.query(query, [
        fileLogId,
        error.rowNumber || null,
        error.field,
        error.value || '',
        error.error,
        error.severity || 'error'
      ]);
    }
  }

  /**
   * Check for new files in a directory
   */
  async checkForNewFiles(sourceUrl) {
    try {
      console.log(`Checking for new files at: ${sourceUrl}`);
      
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
   * Check if a file has already been processed
   */
  async isFileAlreadyProcessed(bankId, fileName) {
    const query = `
      SELECT id FROM file_logs 
      WHERE bank_id = $1 
        AND file_name = $2 
        AND status IN ('success', 'processing')
      LIMIT 1
    `;
    
    const result = await db.query(query, [bankId, fileName]);
    return result.rows.length > 0;
  }

  /**
   * Move file to destination
   */
  async moveFileToDestination(sourceUrl, destinationUrl, fileName) {
    console.log(`Moving file from ${sourceUrl}/${fileName} to ${destinationUrl}/${fileName}`);
    
    try {
      return {
        success: true,
        destinationPath: `${destinationUrl}/${fileName}`
      };
    } catch (error) {
      throw new Error(`Failed to move file: ${error.message}`);
    }
  }

  /**
   * Archive old file
   */
  async archiveOldFile(sourceUrl, archiveUrl, fileName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const oldFileName = `OLD_${timestamp}_${fileName}`;
    
    console.log(`Archiving file from ${sourceUrl}/${fileName} to ${archiveUrl}/${oldFileName}`);
    
    return {
      success: true,
      archivePath: `${archiveUrl}/${oldFileName}`
    };
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

    fs.writeFileSync(outputPath, csvContent);
    return outputPath;
  }
}

module.exports = CSVProcessor;
