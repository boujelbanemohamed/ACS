const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { filterByBank, checkRole } = require('../middleware/roleMiddleware');
const xmlGenerator = require('../services/xmlGenerator');
const recordHistoryService = require('../services/recordHistoryService');
const { decrypt, hashPan, maskPan } = require('../services/encryptionService');

const router = express.Router();

// Get all processed records with pagination and filters
router.get('/', authMiddleware, filterByBank, async (req, res) => {
  try {
    const { 
      bankId, 
      search, 
      limit = 50, 
      offset = 0,
      sortBy = 'processed_at',
      sortOrder = 'DESC'
    } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 50, 500);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    const allowedSortColumns = ['id', 'bank_id', 'pan', 'first_name', 'last_name', 'phone', 'expiry', 'processed_at', 'enrollment_status'];
    const allowedSortOrders = ['ASC', 'DESC'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'processed_at';
    const safeSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    let query = `
      SELECT 
        pr.*,
        b.name as bank_name,
        b.code as bank_code
      FROM processed_records pr
      JOIN banks b ON pr.bank_id = b.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (bankId) {
      query += ` AND pr.bank_id = $${paramCount}`;
      params.push(bankId);
      paramCount++;
    }

    if (search) {
      query += ` AND (
        pr.first_name ILIKE $${paramCount} OR 
        pr.last_name ILIKE $${paramCount} OR 
        pr.phone ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY pr.${safeSortBy} ${safeSortOrder} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(safeLimit, safeOffset);

    const result = await db.query(query, params);

    // Déchiffrer le PAN dans chaque résultat
    for (const row of result.rows) {
      row.pan = decrypt(row.pan);
    }

    let countQuery = `SELECT COUNT(*) FROM processed_records pr JOIN banks b ON pr.bank_id = b.id WHERE 1=1`;
    const countParams = [];
    let countParamCount = 1;

    if (bankId) {
      countQuery += ` AND pr.bank_id = $${countParamCount}`;
      countParams.push(bankId);
      countParamCount++;
    }

    if (search) {
      countQuery += ` AND (pr.first_name ILIKE $${countParamCount} OR pr.last_name ILIKE $${countParamCount} OR pr.phone ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
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
    console.error('Get records error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des enregistrements',
      error: error.message
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const query = 'DELETE FROM processed_records WHERE id = $1 RETURNING *';
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enregistrement non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Enregistrement supprimé avec succès'
    });
  } catch (error) {
    console.error('Delete record error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression',
      error: error.message
    });
  }
});

router.get('/export/csv', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    
    let query = `SELECT b.code as bank_code, pr.* FROM processed_records pr JOIN banks b ON pr.bank_id = b.id WHERE 1=1`;
    const params = [];
    
    if (bankId) {
      query += ` AND pr.bank_id = $1`;
      params.push(bankId);
    }
    
    query += ` ORDER BY pr.processed_at DESC`;
    const result = await db.query(query, params);

    // Déchiffrer le PAN pour le CSV
    for (const row of result.rows) {
      row.pan = decrypt(row.pan);
    }

    const escapeCsvField = (field) => {
      if (field == null) return '';
      const str = String(field);
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const headers = ['Bank', 'Language', 'First Name', 'Last Name', 'PAN', 'Expiry', 'Phone', 'Behaviour', 'Action', 'File', 'Processed At'];
    let csv = headers.join(';') + '\n';
    
    result.rows.forEach(row => {
      csv += [
        escapeCsvField(row.bank_code),
        escapeCsvField(row.language),
        escapeCsvField(row.first_name),
        escapeCsvField(row.last_name),
        escapeCsvField(row.pan),
        escapeCsvField(row.expiry),
        escapeCsvField(row.phone),
        escapeCsvField(row.behaviour),
        escapeCsvField(row.action),
        escapeCsvField(row.file_name),
        escapeCsvField(new Date(row.processed_at).toISOString())
      ].join(';') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=records_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export',
      error: error.message
    });
  }
});

// Get file content by file name
router.get('/file-content/byname', authMiddleware, filterByBank, async (req, res) => {
  try {
    const { type, fileName } = req.query;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'Nom de fichier requis'
      });
    }

    // Pour les fichiers XML, chercher le CSV correspondant
    let searchFileName = fileName;
    if (fileName.endsWith('.xml')) {
      searchFileName = fileName.replace('.xml', '.csv');
    }

    let recordsQuery = `
      SELECT 
        pr.language, pr.first_name as "firstName", pr.last_name as "lastName",
        pr.pan, pr.expiry, pr.phone, pr.behaviour, pr.action,
        b.code as bank_code
      FROM processed_records pr
      JOIN banks b ON pr.bank_id = b.id
      WHERE pr.file_name = $1
    `;
    
    const queryParams = [searchFileName];
    
    // Bank-level access control
    if (req.user.role === 'bank' && req.user.bank_id) {
      recordsQuery += ` AND pr.bank_id = $2`;
      queryParams.push(req.user.bank_id);
    }
    
    recordsQuery += ` ORDER BY pr.id`;
    
    const result = await db.query(recordsQuery, queryParams);

    // Déchiffrer le PAN dans chaque résultat
    for (const row of result.rows) {
      row.pan = decrypt(row.pan);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucun enregistrement trouve pour ce fichier'
      });
    }

    const bankCode = result.rows[0].bank_code || 'UNKNOWN';

    if (type === 'xml') {
      const preppedRows = result.rows.map(r => ({ ...r, pan: r.pan, phone: r.phone }));
      const xmlContent = await xmlGenerator.generateXML(preppedRows, bankCode);
      res.json({ success: true, data: xmlContent });
    } else {
      const csvData = result.rows.map(row => ({
        language: row.language,
        firstName: row.firstName,
        lastName: row.lastName,
        pan: row.pan,
        expiry: row.expiry,
        phone: row.phone,
        behaviour: row.behaviour,
        action: row.action
      }));

      res.json({ success: true, data: csvData });
    }
  } catch (error) {
    console.error('Get file content error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation du contenu',
      error: error.message
    });
  }
});

// Get file content by file_log_id
router.get('/file-content/:fileLogId', authMiddleware, async (req, res) => {
  try {
    const { fileLogId } = req.params;
    const { type } = req.query;

    // Get records for this file
    const recordsQuery = `
      SELECT 
        pr.language, pr.first_name as "firstName", pr.last_name as "lastName",
        pr.pan, pr.expiry, pr.phone, pr.behaviour, pr.action
      FROM processed_records pr
      WHERE pr.file_log_id = $1 OR pr.file_name = (
        SELECT file_name FROM file_logs WHERE id = $1
      )
      ORDER BY pr.id
    `;
    
    const result = await db.query(recordsQuery, [fileLogId]);

    // Déchiffrer le PAN dans chaque résultat
    for (const row of result.rows) {
      row.pan = decrypt(row.pan);
    }

    if (type === 'xml') {
      const bankQuery = `
        SELECT b.code FROM file_logs fl
        JOIN banks b ON fl.bank_id = b.id
        WHERE fl.id = $1
      `;
      const bankResult = await db.query(bankQuery, [fileLogId]);
      const bankCode = bankResult.rows[0]?.code || 'UNKNOWN';
      const preppedRows = result.rows.map(r => ({ ...r, pan: r.pan, phone: r.phone }));
      const xmlContent = await xmlGenerator.generateXML(preppedRows, bankCode);
      res.json({
        success: true,
        data: xmlContent
      });
    } else {
      res.json({
        success: true,
        data: result.rows
      });
    }
  } catch (error) {
    console.error('Get file content error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation du contenu',
      error: error.message
    });
  }
});

// Get full history for a record's PAN
router.get('/history/:recordId', authMiddleware, async (req, res) => {
  try {
    const { recordId } = req.params;

    const recordResult = await db.query(
      'SELECT id, bank_id, pan FROM processed_records WHERE id = $1',
      [recordId]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Enregistrement non trouvé' });
    }

    const record = recordResult.rows[0];
    record.pan = decrypt(record.pan);

    if (req.user.role === 'bank' && req.user.bank_id !== record.bank_id) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const history = await recordHistoryService.getHistoryByPan(record.bank_id, record.pan);

    res.json({ success: true, data: history, record });
  } catch (error) {
    console.error('Get record history error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique',
      error: error.message
    });
  }
});

// POST /api/records/decrypt-pan - Déchiffre un PAN (admin uniquement)
router.post('/decrypt-pan', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { encryptedPan } = req.body;
    if (!encryptedPan) {
      return res.status(400).json({ success: false, message: 'encryptedPan requis' });
    }
    const decrypted = decrypt(encryptedPan);
    res.locals.skipMask = true;
    res.json({ success: true, data: { pan: decrypted, masked: maskPan(decrypted) } });
  } catch (error) {
    console.error('Decrypt PAN error:', error);
    res.status(500).json({ success: false, message: 'Erreur de déchiffrement' });
  }
});

module.exports = router;
