const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { filterByBank, checkRole } = require('../middleware/roleMiddleware');
const auditService = require('../services/auditService');
const xmlGenerator = require('../services/xmlGenerator');
const recordHistoryService = require('../services/recordHistoryService');
const { decrypt, hashPan, maskPan } = require('../services/encryptionService');

const { effectiveBankId } = require('../utils/bankScope');
const remoteFileService = require('../utils/remoteFileService');
const fs = require('fs');

const router = express.Router();

const csvCell = (value) => {
  const str = value === undefined || value === null ? '' : String(value);
  return /[;"\r\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
};

// Contenu d'un fichier traité (CSV : enregistrements en base ; XML : fichier généré), PAN masqués
router.get('/file-content/byname', authMiddleware, async (req, res) => {
  try {
    const { type, fileName } = req.query;
    if (!fileName || typeof fileName !== 'string' || !['csv', 'xml'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Paramètres type (csv|xml) et fileName requis' });
    }

    const bankId = effectiveBankId(req.user, null);

    if (type === 'csv') {
      const params = [fileName];
      let query = 'SELECT * FROM processed_records WHERE file_name = $1';
      if (bankId !== null) {
        query += ' AND bank_id = $2';
        params.push(bankId);
      }
      query += ' ORDER BY id LIMIT 10000';
      const result = await db.query(query, params);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Fichier non trouvé' });
      }
      const data = result.rows.map(row => ({
        language: row.language,
        firstName: row.first_name,
        lastName: row.last_name,
        pan: maskPan(decrypt(row.pan)),
        expiry: row.expiry,
        phone: row.phone,
        behaviour: row.behaviour,
        action: row.action,
        status: row.enrollment_status
      }));
      return res.json({ success: true, data });
    }

    const params = [fileName];
    let query = 'SELECT xml_file_path, bank_id FROM xml_logs WHERE xml_file_name = $1';
    if (bankId !== null) {
      query += ' AND bank_id = $2';
      params.push(bankId);
    }
    query += ' ORDER BY id DESC LIMIT 1';
    const result = await db.query(query, params);
    if (result.rows.length === 0 || !result.rows[0].xml_file_path) {
      return res.status(404).json({ success: false, message: 'Fichier non trouvé' });
    }

    const filePath = result.rows[0].xml_file_path;
    const content = remoteFileService.isRemote(filePath)
      ? await remoteFileService.readFile(filePath)
      : await fs.promises.readFile(filePath.replace('file://', ''), 'latin1');

    // Le XML de l'ACS contient les PAN en clair : ils sont masqués pour l'affichage
    const masked = content.replace(/cardNumber="(\d+)"/g, (match, pan) => `cardNumber="${maskPan(pan)}"`);
    res.json({ success: true, data: masked });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ success: false, message: 'Fichier XML introuvable sur le disque' });
    }
    console.error('File content error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la lecture du fichier' });
  }
});

// Export CSV des enregistrements (PAN masqué)
router.get('/export/csv', authMiddleware, filterByBank, async (req, res) => {
  try {
    const bankId = effectiveBankId(req.user, req.query.bankId);
    const maxRows = parseInt(process.env.RECORDS_EXPORT_MAX, 10) || 50000;
    const params = [];
    let query = `
      SELECT pr.*, b.code as bank_code
      FROM processed_records pr
      JOIN banks b ON pr.bank_id = b.id
    `;
    if (bankId !== null) {
      query += ' WHERE pr.bank_id = $1';
      params.push(bankId);
    }
    query += ` ORDER BY pr.processed_at DESC LIMIT ${maxRows}`;

    const result = await db.query(query, params);
    const headers = ['bank_code', 'language', 'first_name', 'last_name', 'pan', 'expiry', 'phone', 'behaviour', 'action', 'enrollment_status', 'processed_at'];
    let csv = headers.join(';') + '\n';
    for (const row of result.rows) {
      const record = { ...row, pan: maskPan(decrypt(row.pan)), processed_at: row.processed_at ? new Date(row.processed_at).toISOString() : '' };
      csv += headers.map(h => csvCell(record[h])).join(';') + '\n';
    }

    await auditService.logAction('EXPORT_RECORDS', { tableName: 'processed_records', newData: { bankId, count: result.rows.length } }, req);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="enregistrements.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  } catch (error) {
    console.error('Export records error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'export' });
  }
});

// Get all processed records with pagination and filters
router.get('/', authMiddleware, filterByBank, async (req, res) => {
  try {
    const bankId = effectiveBankId(req.user, req.query.bankId);
    const {
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

    if (bankId !== null) {
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

    if (bankId !== null) {
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

router.delete('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const getQuery = 'SELECT pan, bank_id FROM processed_records WHERE id = $1';
    const getResult = await db.query(getQuery, [req.params.id]);

    if (getResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enregistrement non trouvé'
      });
    }

    const decrypted = decrypt(getResult.rows[0].pan);

    const delQuery = 'DELETE FROM processed_records WHERE id = $1 RETURNING *';
    await db.query(delQuery, [req.params.id]);

    await auditService.logAction('DELETE_RECORD', { tableName: 'processed_records', recordId: req.params.id, oldData: { bank_id: getResult.rows[0].bank_id } }, req);

    res.json({
      success: true,
      data: { decrypted_pan: decrypted, masked_pan: maskPan(decrypted) }
    });
  } catch (error) {
    console.error('Delete record error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression' });
  }
});

module.exports = router;
