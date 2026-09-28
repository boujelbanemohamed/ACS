const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const CSVProcessor = require('../services/csvProcessor');
const { authMiddleware } = require('../middleware/auth');
const { forceBankId } = require('../middleware/roleMiddleware');
const { processingSchemas, validate } = require('../utils/validators');
const { hashPan, encrypt, decrypt, maskPan } = require('../services/encryptionService');
const auditService = require('../services/auditService');
const { enqueueJob, getJob, getQueueStats, getActiveJobs } = require('../services/queueService');
const { canAccessBank, denyBankAccess, effectiveBankId } = require('../utils/bankScope');
const { assertSafeUrl } = require('../utils/urlSafety');
const { validateCards } = require('../utils/cardValidation');
const { getUploadDir } = require('../utils/paths');

const router = express.Router();
const csvProcessor = new CSVProcessor();

const fsPromises = fs.promises;

const MAX_MANUAL_ENTRIES = parseInt(process.env.MAX_MANUAL_ENTRIES, 10) || 1000;

// Champs de job jamais renvoyés au client (secrets / données de cartes)
const SENSITIVE_JOB_FIELDS = ['authToken', 'headers', 'body', 'entries', 'corrections', 'filePath', 'fileUrl'];

// URL saisie par un utilisateur : jamais d'adresse interne, quel que soit le rôle
// (sauf domaines explicitement listés dans ALLOWED_API_DOMAINS)
const urlCheckOptions = (protocols) => ({ protocols, allowPrivate: false });

// Configure multer for file uploads (dossier partagé entre l'API et le worker)
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = getUploadDir();
    try {
      await fsPromises.mkdir(uploadDir, { recursive: true });
    } catch (e) {
      if (e.code !== 'EEXIST') return cb(e);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}`);
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

// Charge un file_log et vérifie que l'utilisateur a accès à sa banque
async function loadFileLog(req, res, fileLogId) {
  const id = parseInt(fileLogId, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ success: false, message: 'Identifiant invalide' });
    return null;
  }
  const result = await db.query('SELECT * FROM file_logs WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    res.status(404).json({ success: false, message: 'Log de fichier non trouvé' });
    return null;
  }
  const fileLog = result.rows[0];
  if (!canAccessBank(req.user, fileLog.bank_id)) {
    denyBankAccess(res);
    return null;
  }
  return fileLog;
}

// Masque la valeur d'une erreur de validation portant sur le PAN
function presentValidationError(row) {
  if (!row || row.field_name !== 'pan' || !row.field_value) return row;
  return { ...row, field_value: maskPan(decrypt(row.field_value)) };
}

// Download CSV template
router.get('/template', authMiddleware, (req, res) => {
  const headers = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];
  // Lignes d'exemple conformes aux règles de validation (PAN Luhn de test, téléphone 216XXXXXXXX)
  const sampleRow = ['fr', 'Mohamed', 'Ben Ali', '4111111111111111', '12/28', '21612345678', 'otp', 'update'];
  let csv = headers.join(';') + '\n';
  csv += sampleRow.join(';') + '\n';
  csv += ['ar', 'Ahmed', 'Trabelsi', '5555555555554444', '06/29', '21698765432', 'otp', 'create'].join(';') + '\n';

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

    try {
      await assertSafeUrl(baseUrl, urlCheckOptions(['http', 'https', 'sftp', 'ftp']));
    } catch (e) {
      return res.status(400).json({ success: false, message: `URL non autorisée: ${e.message}` });
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
    const fileUrl = `${baseUrl.replace(/\/+$/, '')}/${bank.code}`;
    const fileName = 'latest.csv';
    const fullUrl = `${fileUrl}/${fileName}`;

    const { jobId } = await enqueueJob('process-url', {
      bankId,
      fileUrl: fullUrl,
      fileName,
      trustedUrl: false,
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
    const fileLog = await loadFileLog(req, res, req.params.fileLogId);
    if (!fileLog) return;

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

    const result = await db.query(query, [fileLog.id]);

    res.json({
      success: true,
      data: result.rows.map(presentValidationError)
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
    const errorId = parseInt(req.params.errorId, 10);

    if (Number.isNaN(errorId)) {
      return res.status(400).json({ success: false, message: 'Identifiant invalide' });
    }
    const hasCorrection = correctedValue !== undefined && correctedValue !== null;
    if (hasCorrection && String(correctedValue).length > 255) {
      return res.status(400).json({ success: false, message: 'Valeur corrigée invalide' });
    }

    const existing = await db.query(
      `SELECT ve.id, ve.field_name, fl.bank_id
       FROM validation_errors ve
       JOIN file_logs fl ON ve.file_log_id = fl.id
       WHERE ve.id = $1`,
      [errorId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Erreur non trouvée'
      });
    }

    if (!canAccessBank(req.user, existing.rows[0].bank_id)) {
      return denyBankAccess(res);
    }

    // Un PAN corrigé n'est jamais stocké en clair ; sans valeur, l'erreur est simplement acquittée
    const fieldName = existing.rows[0].field_name;
    const value = hasCorrection ? String(correctedValue).trim() : null;
    const storedValue = value !== null && fieldName === 'pan' ? encrypt(value) : value;

    const query = `
      UPDATE validation_errors
      SET is_resolved = true, field_value = CASE WHEN $3::boolean THEN $1 ELSE field_value END
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [storedValue, errorId, hasCorrection]);

    await auditService.logAction('RESOLVE_ERROR', {
      tableName: 'validation_errors',
      recordId: errorId,
      newData: { field: fieldName, correctedValue: fieldName === 'pan' && value ? maskPan(value) : value }
    }, req);

    res.json({
      success: true,
      message: 'Erreur résolue avec succès',
      data: presentValidationError(result.rows[0])
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
    const { status, limit = 50, offset = 0 } = req.query;
    const bankId = effectiveBankId(req.user, req.query.bankId);
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

    if (bankId !== null) {
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

    if (bankId !== null) {
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
      // original_path peut contenir des identifiants SFTP/FTP
      data: result.rows.map(({ original_path, ...row }) => row),
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
    const fileLog = await loadFileLog(req, res, req.params.fileLogId);
    if (!fileLog) return;

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

    await auditService.logAction('DOWNLOAD_FILE', { tableName: 'file_logs', recordId: fileLog.id, newData: { bankId: fileLog.bank_id, fileName: fileLog.file_name } }, req);

    const csvContent = csvProcessor.buildCorrectedCSV(recordsResult.rows);
    const downloadName = `corrected_${path.basename(String(fileLog.file_name)).replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csvContent);
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
    const fileLog = await loadFileLog(req, res, req.params.fileLogId);
    if (!fileLog) return;

    const reprocessableSources = ['url', 'cron'];
    if (!reprocessableSources.includes(fileLog.source_type) || !fileLog.original_path) {
      return res.status(400).json({
        success: false,
        message: 'Ce type de source ne peut pas être retraité automatiquement. Importez à nouveau le fichier corrigé.'
      });
    }

    if (fileLog.status === 'success') {
      return res.status(400).json({
        success: false,
        message: 'Ce fichier a déjà été traité avec succès'
      });
    }

    // Les corrections saisies par l'utilisateur sont appliquées lors du retraitement
    const resolved = await db.query(
      `SELECT row_number, field_name, field_value FROM validation_errors
       WHERE file_log_id = $1 AND is_resolved = true AND row_number > 0`,
      [fileLog.id]
    );
    const corrections = resolved.rows.map(r => ({
      rowNumber: r.row_number,
      field: r.field_name,
      value: r.field_value,
      encrypted: r.field_name === 'pan'
    }));

    const { jobId } = await enqueueJob('process-url', {
      bankId: fileLog.bank_id,
      fileUrl: fileLog.original_path,
      fileName: fileLog.file_name,
      sourceType: fileLog.source_type,
      trustedUrl: true,
      corrections,
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
        correctionsApplied: corrections.length
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

    if (!bankId || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Banque et enregistrements requis'
      });
    }

    if (entries.length > MAX_MANUAL_ENTRIES) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_MANUAL_ENTRIES} enregistrements par requête`
      });
    }

    const { valid, invalid } = validateCards(entries);
    const validatedEntries = new Array(entries.length);

    for (const item of invalid) {
      validatedEntries[item.index] = {
        ...entries[item.index],
        status: 'error',
        errorMessage: item.errors.map(e => e.message).join(', '),
        errors: item.errors
      };
    }

    for (const item of valid) {
      const duplicateCheck = await db.query(
        'SELECT id FROM processed_records WHERE bank_id = $1 AND pan_hash = $2 LIMIT 1',
        [bankId, hashPan(item.card.pan)]
      );
      const isDuplicate = duplicateCheck.rows.length > 0;
      validatedEntries[item.index] = {
        ...entries[item.index],
        status: isDuplicate ? 'duplicate' : 'valid',
        errorMessage: isDuplicate ? 'PAN deja existant en base de donnees' : '',
        warnings: item.warnings
      };
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

    if (!bankId || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Banque et enregistrements requis'
      });
    }

    if (entries.length > MAX_MANUAL_ENTRIES) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_MANUAL_ENTRIES} enregistrements par requête`
      });
    }

    const { valid, invalid } = validateCards(entries);
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${invalid.length} enregistrement(s) invalide(s)`,
        data: { invalidEntries: invalid }
      });
    }

    const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
    if (bankResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvée'
      });
    }

    // Le PAN est chiffré avant d'être déposé dans la file d'attente (Redis)
    const protectedEntries = valid.map(v => ({ ...v.card, pan: encrypt(v.card.pan) }));

    const { jobId } = await enqueueJob('process-manual', {
      bankId,
      entries: protectedEntries,
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

    try {
      await assertSafeUrl(url, urlCheckOptions(['http', 'https']));
    } catch (e) {
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
      // Le secret d'authentification est chiffré avant d'être déposé dans Redis
      authToken: authToken ? encrypt(authToken) : authToken,
      dataPath,
      trustedUrl: false,
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
    if (!job || !canAccessBank(req.user, job.data?.bankId)) {
      // Même réponse qu'un job inexistant : ne révèle pas l'existence d'un job d'une autre banque
      return res.status(404).json({
        success: false,
        message: 'Job non trouvé'
      });
    }

    const safeData = { ...(job.data || {}) };
    for (const field of SENSITIVE_JOB_FIELDS) delete safeData[field];

    res.json({
      success: true,
      data: { ...job, data: safeData }
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
    const activeJobs = (await getActiveJobs())
      .filter(job => canAccessBank(req.user, job.bankId));

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
