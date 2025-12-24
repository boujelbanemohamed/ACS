const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all XML logs with pagination
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { 
      bankId, 
      status,
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = `
      SELECT 
        xl.*,
        b.name as bank_name,
        b.code as bank_code,
        fl.file_name as source_file_name
      FROM xml_logs xl
      JOIN banks b ON xl.bank_id = b.id
      LEFT JOIN file_logs fl ON xl.file_log_id = fl.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (bankId) {
      query += ` AND xl.bank_id = $${paramCount}`;
      params.push(bankId);
      paramCount++;
    }

    if (status) {
      query += ` AND xl.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += ` ORDER BY xl.created_at DESC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM xml_logs xl WHERE 1=1`;
    const countParams = [];
    let countParamCount = 1;

    if (bankId) {
      countQuery += ` AND xl.bank_id = $${countParamCount}`;
      countParams.push(bankId);
      countParamCount++;
    }

    if (status) {
      countQuery += ` AND xl.status = $${countParamCount}`;
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
    console.error('Get XML logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des logs XML',
      error: error.message
    });
  }
});

// Get XML statistics
router.get('/stats/summary', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_xml,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COALESCE(SUM(records_count), 0) as total_records,
        COALESCE(SUM(xml_entries_count), 0) as total_entries
      FROM xml_logs
    `;
    
    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get XML stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des statistiques',
      error: error.message
    });
  }
});

// Get XML log by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        xl.*,
        b.name as bank_name,
        b.code as bank_code,
        fl.file_name as source_file_name
      FROM xml_logs xl
      JOIN banks b ON xl.bank_id = b.id
      LEFT JOIN file_logs fl ON xl.file_log_id = fl.id
      WHERE xl.id = $1
    `;
    
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Log XML non trouve'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get XML log error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation du log XML',
      error: error.message
    });
  }
});

module.exports = router;
