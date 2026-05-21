const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { bankId, dateFrom, dateTo } = req.query;
    let bankFilterId = bankId ? parseInt(bankId) : null;
    const hasDateFilter = dateFrom || dateTo;

    if ((req.user.role === 'bank' || req.user.role === 'bank_admin') && req.user.bank_id) {
      bankFilterId = req.user.bank_id;
    }

    const bankClause = bankFilterId ? ' AND bank_id = $1' : '';
    const bankParams = bankFilterId ? [bankFilterId] : [];

    const dateClause = (column, offset = 0) => {
      let clause = '';
      const params = [];
      if (dateFrom) {
        clause += ` AND ${column} >= $${params.length + 1 + offset}`;
        params.push(dateFrom);
      }
      if (dateTo) {
        clause += ` AND ${column} <= $${params.length + 1 + offset}`;
        params.push(dateTo + ' 23:59:59');
      }
      return { clause, params };
    };

    const totalBanksQ = await db.query(
      bankFilterId
        ? 'SELECT COUNT(*) FROM banks WHERE is_active = true AND id = $1'
        : 'SELECT COUNT(*) FROM banks WHERE is_active = true',
      bankParams
    );

    const { clause: recClause, params: recParams } = dateClause('processed_at', bankParams.length);
    const totalRecordsQ = await db.query(
      `SELECT COUNT(*) FROM processed_records WHERE 1=1${bankClause}${recClause}`,
      [...bankParams, ...recParams]
    );

    let todayFilesQ;
    if (hasDateFilter) {
      const { clause: fileClause, params: fileParams } = dateClause('processed_at', bankParams.length);
      todayFilesQ = await db.query(
        `SELECT COUNT(*) FROM file_logs WHERE 1=1${bankClause}${fileClause}`,
        [...bankParams, ...fileParams]
      );
    } else {
      todayFilesQ = await db.query(
        `SELECT COUNT(*) FROM file_logs WHERE DATE(processed_at) = CURRENT_DATE${bankClause}`,
        bankParams
      );
    }

    const { clause: errClause, params: errParams } = dateClause('ve.created_at', bankParams.length);
    const pendingErrorsQ = await db.query(
      `SELECT COUNT(*) FROM validation_errors ve
       JOIN file_logs fl ON ve.file_log_id = fl.id
       WHERE ve.is_resolved = false${bankFilterId ? ' AND fl.bank_id = $1' : ''}${errClause}`,
      [...bankParams, ...errParams]
    );

    const { clause: actClause, params: actParams } = dateClause('fl.processed_at', bankParams.length);
    const recentActivityQ = await db.query(
      `SELECT fl.*, b.name as bank_name, b.code as bank_code
       FROM file_logs fl
       JOIN banks b ON fl.bank_id = b.id
       WHERE 1=1${bankFilterId ? ' AND fl.bank_id = $1' : ''}${actClause}
       ORDER BY fl.processed_at DESC LIMIT 10`,
      [...bankParams, ...actParams]
    );

    const bankStatsQ = await db.query(
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
      bankParams
    );

    res.json({
      success: true,
      data: {
        totalBanks: parseInt(totalBanksQ.rows[0].count),
        totalRecords: parseInt(totalRecordsQ.rows[0].count),
        todayFiles: parseInt(todayFilesQ.rows[0].count),
        pendingErrors: parseInt(pendingErrorsQ.rows[0].count),
        recentActivity: recentActivityQ.rows,
        bankStats: bankStatsQ.rows,
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
