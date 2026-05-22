const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { filterByBank, checkRole } = require('../middleware/roleMiddleware');
const auditService = require('../services/auditService');
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
