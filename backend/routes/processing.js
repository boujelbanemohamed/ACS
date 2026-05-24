const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const CSVProcessor = require('../services/csvProcessor');
const { authMiddleware } = require('../middleware/auth');
const { forceBankId } = require('../middleware/roleMiddleware');
const { processingSchemas, validate } = require('../utils/validators');
const { hashPan } = require('../services/encryptionService');
const auditService = require('../services/auditService');
const { enqueueJob, getJob, getQueueStats, getActiveJobs } = require('../services/queueService');

const ALLOWED_API_DOMAINS = (process.env.ALLOWED_API_DOMAINS || '').split(',').filter(Boolean);

function isAllowedApiUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    if (ALLOWED_API_DOMAINS.length > 0) {
      return ALLOWED_API_DOMAINS.some(d => host === d || host.endsWith('.' + d));
    }

    const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254',
      '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.',
      '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.',
      '172.29.', '172.30.', '172.31.', '192.168.'];
    for (const b of blocked) {
      if (host === b || host.startsWith(b)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

const router = express.Router();
const csvProcessor = new CSVProcessor();

const fsPromises = fs.promises;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = '/tmp/uploads';
    try {
      await fsPromises.mkdir(uploadDir, { recursive: true });
    } catch (e) {
      if (e.code !== 'EEXIST') return cb(e);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${sanitized}`);
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

// Download CSV template
router.get('/template', authMiddleware, (req, res) => {
  const headers = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];
  const sampleRow = ['fr', 'John', 'Doe', '1234567890123456', '12/28', '+21612345678', 'otp', 'update'];
  let csv = headers.join(';') + '\n';
  csv += sampleRow.join(';') + '\n';
  csv += ['fr', 'Jane', 'Smith', '6543210987654321', '06/29', '+21698765432', 'otp', 'update'].join(';') + '\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=template_import.csv');
  res.send(csv);
});

// Process file from URL
router.post('/process-url', authMiddleware, forceBankId, validate(processingSchemas.processUrl), async (req, res) => {
  try {
    const { bankId, baseUrl } = req.body;

    if (!bankId || !baseUrl) {
      return res.status(400).json({
        success: false,
        message: 'Bank ID et URL de base requis'
      });
    }

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
    const fileName = 'latest.csv';
    const fullUrl = `${fileUrl}/${fileName}`;

    const { jobId } = await enqueueJob('process-url', {
      bankId,
      fileUrl: fullUrl,
      fileName,
      userId: req.user?.id,
      username: req.user?.username || 'SYSTEM',
      ipAddress: req.ip,
    });

    res.status(202).json({
      success: true,
      message: 'Traitement du fichier mis en file d\'attente',
      data: {
        jobId,
        status: 'pending',
      }
    });
  } catch (error) {
    console.error('Process URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise en file d\'attente',
      error: error.message
    });
  }
});

// Upload and process CSV file manually
router.post('/upload', authMiddleware, upload.single('file'), forceBankId, validate(processingSchemas.upload), async (req, res) => {
  try {
    const { bankId } = req.body;

    if (!bankId) {
      if (req.file) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
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

    const { jobId } = await enqueueJob('upload', {
      bankId,
      filePath: req.file.path,
      originalName: req.file.originalname,
      userId: req.user?.id,
      username: req.user?.username || 'SYSTEM',
      ipAddress: req.ip,
    });

    res.status(202).json({
      success: true,
      message: 'Fichier mis en file d\'attente pour traitement',
      data: {
        jobId,
        status: 'pending',
        fileName: req.file.originalname,
      }
    });
  } catch (error) {
    console.error('Upload error:', error);

    if (req.file) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise en file d\'attente',
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

    await auditService.logAction('RESOLVE_ERROR', { tableName: 'validation_errors', recordId: req.params.errorId, newData: { correctedValue } }, req);

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
    const safeLimit = Math.min(parseInt(limit) || 50, 500);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

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
    params.push(safeLimit, safeOffset);

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
        limit: safeLimit,
        offset: safeOffset
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

    await auditService.logAction('DOWNLOAD_FILE', { tableName: 'file_logs', recordId: req.params.fileLogId, newData: { bankId: fileLog.bank_id, fileName: fileLog.file_name } }, req);

    const outputPath = path.join('/tmp', `corrected_${fileLog.file_name}`);
    await csvProcessor.generateCorrectedCSV(recordsResult.rows, outputPath);

    res.download(outputPath, `corrected_${fileLog.file_name}`, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
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

    const { jobId } = await enqueueJob('process-url', {
      bankId: fileLog.bank_id,
      fileUrl: fileLog.original_path,
      fileName: fileLog.file_name,
      userId: req.user?.id,
      username: req.user?.username || 'SYSTEM',
      ipAddress: req.ip,
    });

    res.status(202).json({
      success: true,
      message: 'Fichier mis en file d\'attente pour retraitement',
      data: {
        jobId,
        status: 'pending',
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


// Validate manual entries
router.post('/validate-manual', authMiddleware, forceBankId, async (req, res) => {
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
      const panHash = hashPan(entry.pan);
      const duplicateCheck = await db.query(
        'SELECT id FROM processed_records WHERE bank_id = $1 AND pan_hash = $2 LIMIT 1',
        [bankId, panHash]
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
router.post('/process-manual', authMiddleware, forceBankId, async (req, res) => {
  try {
    const { bankId, entries } = req.body;
    
    if (!bankId || !entries || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Banque et enregistrements requis'
      });
    }

    const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
    if (bankResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvée'
      });
    }

    const { jobId } = await enqueueJob('process-manual', {
      bankId,
      entries,
      userId: req.user?.id,
      username: req.user?.username || 'SYSTEM',
      ipAddress: req.ip,
    });

    res.status(202).json({
      success: true,
      message: 'Traitement des enregistrements mis en file d\'attente',
      data: {
        jobId,
        status: 'pending',
        entriesCount: entries.length,
      }
    });
  } catch (error) {
    console.error('Process manual error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise en file d\'attente',
      error: error.message
    });
  }
});

// Call external API
router.post('/call-api', authMiddleware, forceBankId, validate(processingSchemas.callApi), async (req, res) => {
  try {
    const { bankId, url, method, headers, body, authType, authToken, dataPath } = req.body;

    if (!bankId || !url) {
      return res.status(400).json({
        success: false,
        message: 'Bank ID et URL requis'
      });
    }

    if (!isAllowedApiUrl(url)) {
      return res.status(400).json({
        success: false,
        message: 'URL non autorisée'
      });
    }

    const { jobId } = await enqueueJob('call-api', {
      bankId,
      url,
      method,
      headers,
      body,
      authType,
      authToken,
      dataPath,
      userId: req.user?.id,
      username: req.user?.username || 'SYSTEM',
      ipAddress: req.ip,
    });

    res.status(202).json({
      success: true,
      message: 'Appel API mis en file d\'attente',
      data: {
        jobId,
        status: 'pending',
      }
    });
  } catch (error) {
    console.error('External API call error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise en file d\'attente',
      error: error.message
    });
  }
});

// Get job status
router.get('/status/:jobId', authMiddleware, async (req, res) => {
  try {
    const job = await getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job non trouvé'
      });
    }

    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du statut',
      error: error.message
    });
  }
});

// Get queue statistics
router.get('/queue/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await getQueueStats();
    const activeJobs = await getActiveJobs();

    res.json({
      success: true,
      data: {
        stats,
        activeJobs
      }
    });
  } catch (error) {
    console.error('Get queue stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

module.exports = router;
