const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      limit = 50, offset = 0, action, userId, username, userRole,
      bankId, tableName, dateFrom, dateTo, sort = 'desc'
    } = req.query;

    const safeLimit = Math.min(parseInt(limit) || 50, 500);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    let whereClause = [];
    let params = [];
    let paramIndex = 1;

    if (req.user.role !== 'super_admin') {
      whereClause.push(`al.bank_id = $${paramIndex}`);
      params.push(req.user.bank_id);
      paramIndex++;
    }

    if (action) {
      whereClause.push(`al.action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }
    if (userId) {
      whereClause.push(`al.user_id = $${paramIndex}`);
      params.push(parseInt(userId));
      paramIndex++;
    }
    if (username) {
      whereClause.push(`al.username ILIKE $${paramIndex}`);
      params.push(`%${username}%`);
      paramIndex++;
    }
    if (userRole) {
      whereClause.push(`al.user_role = $${paramIndex}`);
      params.push(userRole);
      paramIndex++;
    }
    if (bankId) {
      whereClause.push(`al.bank_id = $${paramIndex}`);
      params.push(parseInt(bankId));
      paramIndex++;
    }
    if (tableName) {
      whereClause.push(`al.table_name = $${paramIndex}`);
      params.push(tableName);
      paramIndex++;
    }
    if (dateFrom) {
      whereClause.push(`al.created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }
    if (dateTo) {
      whereClause.push(`al.created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    const whereSQL = whereClause.length > 0 ? 'WHERE ' + whereClause.join(' AND ') : '';
    const orderDir = sort === 'asc' ? 'ASC' : 'DESC';

    const countResult = await db.query(`SELECT COUNT(*) FROM audit_logs al ${whereSQL}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await db.query(
      `SELECT al.*, b.name as bank_name
       FROM audit_logs al
       LEFT JOIN banks b ON al.bank_id = b.id
       ${whereSQL}
       ORDER BY al.created_at ${orderDir}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, safeLimit, safeOffset]
    );

    res.json({
      success: true,
      data: result.rows,
      total,
      limit: safeLimit,
      offset: safeOffset
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des logs',
      error: error.message
    });
  }
});

router.get('/actions', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT action FROM audit_logs ORDER BY action`
    );
    res.json({ success: true, data: result.rows.map(r => r.action) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
