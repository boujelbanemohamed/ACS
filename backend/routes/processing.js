const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const CSVProcessor = require('../services/csvProcessor');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const csvProcessor = new CSVProcessor();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/tmp/uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.csv') {
      return cb(new Error('Seuls les fichiers CSV sont autorisés'));
    }
    cb(null, true);
  }
});

// Process file from URL
router.post('/process-url', authMiddleware, async (req, res) => {
  try {
    const { bankId, baseUrl } = req.body;

    if (!bankId || !baseUrl) {
      return res.status(400).json({
        success: false,
        message: 'Bank ID et URL de base requis'
      });
    }

    // Get bank details
    const bankQuery = 'SELECT * FROM banks WHERE id = $1 AND is_active = true';
    const bankResult = await db.query(bankQuery, [bankId]);

    if (bankResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvée ou inactive'
      });
    }

    const bank = bankResult.rows[0];
    const fileUrl = `${baseUrl}/${bank.code}`;

    // Check for new files (this would need to be implemented based on your file system)
    // For now, we'll simulate checking for a file
    const fileName = 'latest.csv';
    const fullUrl = `${fileUrl}/${fileName}`;

    // Process the file
    const result = await csvProcessor.processFileFromURL(bankId, fullUrl, fileName);

    if (result.success) {
      // Save validated records
      await csvProcessor.saveValidatedRecords(bankId, result.validRows, fileName);

      // Move file to destination
      await csvProcessor.moveFileToDestination(
        fileUrl,
        bank.destination_url,
        fileName
      );

      // Archive old file
      await csvProcessor.archiveOldFile(
        fileUrl,
        bank.old_url,
        fileName
      );
    }

    res.json({
      success: result.success,
      message: result.success 
        ? 'Fichier traité avec succès'
        : 'Fichier traité avec des erreurs',
      data: {
        fileLogId: result.fileLogId,
        stats: result.stats,
        errors: result.errors,
        totalValidRows: result.validRows.length
      }
    });
  } catch (error) {
    console.error('Process URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement du fichier',
      error: error.message
    });
  }
});

// Upload and process CSV file manually
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { bankId } = req.body;

    if (!bankId) {
      return res.status(400).json({
        success: false,
        message: 'Bank ID requis'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier téléchargé'
      });
    }

    // Process the uploaded file
    const { rows, errors, stats } = await csvProcessor.parseAndValidateCSV(
      req.file.path,
      bankId
    );

    // Create file log
    const fileLogId = await csvProcessor.createFileLog(
      bankId,
      req.file.originalname,
      req.file.path
    );

    // Update file log
    await csvProcessor.updateFileLog(fileLogId, {
      total_rows: stats.totalRows,
      valid_rows: stats.validRows,
      invalid_rows: stats.invalidRows,
      duplicate_rows: stats.duplicateRows,
      status: errors.length > 0 ? 'validation_error' : 'success'
    });

    // Save validation errors
    if (errors.length > 0) {
      await csvProcessor.saveValidationErrors(fileLogId, errors);
    } else {
      // Save valid records
      await csvProcessor.saveValidatedRecords(bankId, rows, req.file.originalname);
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: errors.filter(e => e.severity === 'error').length === 0,
      message: errors.length > 0 
        ? 'Fichier traité avec des erreurs de validation'
        : 'Fichier traité avec succès',
      data: {
        fileLogId,
        stats,
        errors,
        totalValidRows: rows.length
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement du fichier',
      error: error.message
    });
  }
});

// Get validation errors for a file
router.get('/errors/:fileLogId', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        ve.*,
        fl.file_name,
        b.name as bank_name
      FROM validation_errors ve
      JOIN file_logs fl ON ve.file_log_id = fl.id
      JOIN banks b ON fl.bank_id = b.id
      WHERE ve.file_log_id = $1
      ORDER BY ve.row_number, ve.id
    `;

    const result = await db.query(query, [req.params.fileLogId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get errors error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des erreurs',
      error: error.message
    });
  }
});

// Resolve validation error
router.patch('/errors/:errorId/resolve', authMiddleware, async (req, res) => {
  try {
    const { correctedValue } = req.body;

    const query = `
      UPDATE validation_errors 
      SET is_resolved = true, field_value = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [correctedValue, req.params.errorId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Erreur non trouvée'
      });
    }

    res.json({
      success: true,
      message: 'Erreur résolue avec succès',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Resolve error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la résolution',
      error: error.message
    });
  }
});

// Get file logs
router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const { bankId, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        fl.*,
        b.name as bank_name,
        b.code as bank_code
      FROM file_logs fl
      JOIN banks b ON fl.bank_id = b.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (bankId) {
      query += ` AND fl.bank_id = $${paramCount}`;
      params.push(bankId);
      paramCount++;
    }

    if (status) {
      query += ` AND fl.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY fl.processed_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM file_logs fl WHERE 1=1';
    const countParams = [];
    let countParamCount = 1;

    if (bankId) {
      countQuery += ` AND fl.bank_id = $${countParamCount}`;
      countParams.push(bankId);
      countParamCount++;
    }

    if (status) {
      countQuery += ` AND fl.status = $${countParamCount}`;
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des logs',
      error: error.message
    });
  }
});

// Download corrected CSV
router.get('/download/:fileLogId', authMiddleware, async (req, res) => {
  try {
    // Get file log details
    const logQuery = 'SELECT * FROM file_logs WHERE id = $1';
    const logResult = await db.query(logQuery, [req.params.fileLogId]);

    if (logResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Log de fichier non trouvé'
      });
    }

    const fileLog = logResult.rows[0];

    // Get all valid records from this file
    const recordsQuery = `
      SELECT * FROM processed_records 
      WHERE bank_id = $1 AND file_name = $2
      ORDER BY id
    `;
    
    const recordsResult = await db.query(recordsQuery, [
      fileLog.bank_id,
      fileLog.file_name
    ]);

    // Generate corrected CSV
    const outputPath = path.join('/tmp', `corrected_${fileLog.file_name}`);
    await csvProcessor.generateCorrectedCSV(recordsResult.rows, outputPath);

    // Send file
    res.download(outputPath, `corrected_${fileLog.file_name}`, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du téléchargement',
      error: error.message
    });
  }
});

// Reprocess file after corrections
router.post('/reprocess/:fileLogId', authMiddleware, async (req, res) => {
  try {
    // Get file log
    const logQuery = `
      SELECT fl.*, b.* 
      FROM file_logs fl
      JOIN banks b ON fl.bank_id = b.id
      WHERE fl.id = $1
    `;
    
    const logResult = await db.query(logQuery, [req.params.fileLogId]);

    if (logResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Log de fichier non trouvé'
      });
    }

    const fileLog = logResult.rows[0];

    // Reprocess file
    const result = await csvProcessor.processFileFromURL(
      fileLog.bank_id,
      fileLog.original_path,
      fileLog.file_name
    );

    res.json({
      success: result.success,
      message: 'Fichier retraité',
      data: {
        fileLogId: result.fileLogId,
        stats: result.stats,
        errors: result.errors
      }
    });
  } catch (error) {
    console.error('Reprocess error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du retraitement',
      error: error.message
    });
  }
});

module.exports = router;

// Validate manual entries
router.post('/validate-manual', authMiddleware, async (req, res) => {
  try {
    const { bankId, entries } = req.body;
    
    if (!bankId || !entries || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Banque et enregistrements requis'
      });
    }

    const validatedEntries = [];
    
    for (const entry of entries) {
      let status = 'valid';
      let errorMessage = '';
      
      // Check for duplicate PAN in database
      const duplicateCheck = await db.query(
        'SELECT id FROM processed_records WHERE bank_id = $1 AND pan = $2 LIMIT 1',
        [bankId, entry.pan]
      );
      
      if (duplicateCheck.rows.length > 0) {
        status = 'duplicate';
        errorMessage = 'PAN deja existant en base de donnees';
      }
      
      // Validate PAN format
      if (!/^\d{16}$/.test(entry.pan)) {
        status = 'error';
        errorMessage = 'PAN invalide (16 chiffres requis)';
      }
      
      validatedEntries.push({
        ...entry,
        status,
        errorMessage
      });
    }

    res.json({
      success: true,
      message: 'Validation terminee',
      data: {
        entries: validatedEntries,
        stats: {
          total: validatedEntries.length,
          valid: validatedEntries.filter(e => e.status === 'valid').length,
          duplicate: validatedEntries.filter(e => e.status === 'duplicate').length,
          error: validatedEntries.filter(e => e.status === 'error').length
        }
      }
    });
  } catch (error) {
    console.error('Validate manual error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la validation',
      error: error.message
    });
  }
});

// Process manual entries (create CSV and XML)
router.post('/process-manual', authMiddleware, async (req, res) => {
  try {
    const { bankId, entries } = req.body;
    
    if (!bankId || !entries || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Banque et enregistrements requis'
      });
    }

    // Get bank info
    const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
    if (bankResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvee'
      });
    }
    
    const bank = bankResult.rows[0];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `MANUAL_${bank.code}_${timestamp}`;

    // Create file log
    const fileLogResult = await db.query(
      `INSERT INTO file_logs (bank_id, file_name, original_path, status, total_rows, valid_rows) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [bankId, `${fileName}.csv`, 'manual_entry', 'success', entries.length, entries.length]
    );
    const fileLogId = fileLogResult.rows[0].id;

    // Insert records into database
    for (const entry of entries) {
      await db.query(
        `INSERT INTO processed_records (bank_id, language, first_name, last_name, pan, expiry, phone, behaviour, action, file_name)
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
           processed_at = CURRENT_TIMESTAMP`,
        [bankId, entry.language, entry.firstName, entry.lastName, entry.pan, entry.expiry, entry.phone, entry.behaviour, entry.action, `${fileName}.csv`]
      );
    }

    // Generate CSV content
    const csvHeaders = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];
    let csvContent = csvHeaders.join(';') + '\n';
    entries.forEach(entry => {
      csvContent += [
        entry.language, entry.firstName, entry.lastName, entry.pan,
        entry.expiry, entry.phone, entry.behaviour, entry.action
      ].join(';') + '\n';
    });

    // Generate XML content
    let xmlContent = '<?xml version="1.0" encoding="ISO-8859-15"?>\n';
    xmlContent += '<cardRegistryRecords xmlns="http://cardRegistry.acs.bpcbt.com/v2/types">\n';
    
    let idCounter = 1;
    entries.forEach(entry => {
      const phone = entry.phone.startsWith('+') ? entry.phone : `+${entry.phone}`;
      
      xmlContent += `  <add id="${idCounter}" cardNumber="${entry.pan}" profileId="${bank.code}" cardStatus="ACTIVE">\n`;
      xmlContent += `    <oneTimePasswordSMS phoneNumber="${phone}"></oneTimePasswordSMS>\n`;
      xmlContent += `  </add>\n`;
      idCounter++;
      
      xmlContent += `  <setAuthMethod id="${idCounter}" cardNumber="${entry.pan}" profileId="${bank.code}">\n`;
      xmlContent += `    <oneTimePasswordSMS phoneNumber="${phone}"></oneTimePasswordSMS>\n`;
      xmlContent += `  </setAuthMethod>\n`;
      idCounter++;
    });
    
    xmlContent += '</cardRegistryRecords>';

    // Log XML generation
    await db.query(
      `INSERT INTO xml_logs (bank_id, file_log_id, xml_file_name, xml_file_path, records_count, xml_entries_count, status, processed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [bankId, fileLogId, `${fileName}.xml`, bank.xml_output_url || '/data/xml', entries.length, entries.length * 2, 'success']
    );

    res.json({
      success: true,
      message: `${entries.length} enregistrement(s) traite(s) avec succes. Fichiers CSV et XML generes.`,
      data: {
        fileLogId,
        csvFileName: `${fileName}.csv`,
        xmlFileName: `${fileName}.xml`,
        recordsProcessed: entries.length,
        xmlEntriesGenerated: entries.length * 2
      }
    });
  } catch (error) {
    console.error('Process manual error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement',
      error: error.message
    });
  }
});
