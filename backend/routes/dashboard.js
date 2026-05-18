const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    let bankFilterId = bankId ? parseInt(bankId) : null;

    if (req.user.role === 'bank' && req.user.bank_id) {
      bankFilterId = req.user.bank_id;
    }

    const totalBanks = await db.query(
      bankFilterId
        ? 'SELECT COUNT(*) FROM banks WHERE is_active = true AND id = $1'
        : 'SELECT COUNT(*) FROM banks WHERE is_active = true',
      bankFilterId ? [bankFilterId] : []
    );

    const totalRecords = await db.query(
      bankFilterId
        ? 'SELECT COUNT(*) FROM processed_records WHERE bank_id = $1'
        : 'SELECT COUNT(*) FROM processed_records',
      bankFilterId ? [bankFilterId] : []
    );

    const todayFiles = await db.query(
      bankFilterId
        ? 'SELECT COUNT(*) FROM file_logs WHERE DATE(processed_at) = CURRENT_DATE AND bank_id = $1'
        : 'SELECT COUNT(*) FROM file_logs WHERE DATE(processed_at) = CURRENT_DATE',
      bankFilterId ? [bankFilterId] : []
    );

    const pendingErrors = await db.query(
      bankFilterId
        ? `SELECT COUNT(*) FROM validation_errors ve 
           JOIN file_logs fl ON ve.file_log_id = fl.id 
           WHERE ve.is_resolved = false AND fl.bank_id = $1`
        : `SELECT COUNT(*) FROM validation_errors ve 
           JOIN file_logs fl ON ve.file_log_id = fl.id 
           WHERE ve.is_resolved = false`,
      bankFilterId ? [bankFilterId] : []
    );

    const recentActivity = await db.query(
      bankFilterId
        ? `SELECT fl.*, b.name as bank_name, b.code as bank_code
           FROM file_logs fl
           JOIN banks b ON fl.bank_id = b.id
           WHERE fl.bank_id = $1
           ORDER BY fl.processed_at DESC LIMIT 10`
        : `SELECT fl.*, b.name as bank_name, b.code as bank_code
           FROM file_logs fl
           JOIN banks b ON fl.bank_id = b.id
           ORDER BY fl.processed_at DESC LIMIT 10`,
      bankFilterId ? [bankFilterId] : []
    );

    const bankStats = await db.query(
      bankFilterId
        ? `SELECT b.id, b.name, b.code,
           COUNT(DISTINCT pr.id) as total_records,
           COUNT(DISTINCT fl.id) as total_files,
           COUNT(DISTINCT CASE WHEN fl.status = 'success' THEN fl.id END) as successful_files,
           COUNT(DISTINCT CASE WHEN fl.status = 'error' THEN fl.id END) as failed_files
           FROM banks b
           LEFT JOIN processed_records pr ON pr.bank_id = b.id
           LEFT JOIN file_logs fl ON fl.bank_id = b.id
           WHERE b.is_active = true AND b.id = $1
           GROUP BY b.id, b.name, b.code ORDER BY b.name`
        : `SELECT b.id, b.name, b.code,
           COUNT(DISTINCT pr.id) as total_records,
           COUNT(DISTINCT fl.id) as total_files,
           COUNT(DISTINCT CASE WHEN fl.status = 'success' THEN fl.id END) as successful_files,
           COUNT(DISTINCT CASE WHEN fl.status = 'error' THEN fl.id END) as failed_files
           FROM banks b
           LEFT JOIN processed_records pr ON pr.bank_id = b.id
           LEFT JOIN file_logs fl ON fl.bank_id = b.id
           WHERE b.is_active = true
           GROUP BY b.id, b.name, b.code ORDER BY b.name`,
      bankFilterId ? [bankFilterId] : []
    );

    res.json({
      success: true,
      data: {
        totalBanks: parseInt(totalBanks.rows[0].count),
        totalRecords: parseInt(totalRecords.rows[0].count),
        todayFiles: parseInt(todayFiles.rows[0].count),
        pendingErrors: parseInt(pendingErrors.rows[0].count),
        recentActivity: recentActivity.rows,
        bankStats: bankStats.rows
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des donnees du dashboard',
      error: error.message
    });
  }
});

module.exports = router;
