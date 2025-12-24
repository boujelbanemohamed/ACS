const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get dashboard statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    // Get overall statistics
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT b.id) as total_banks,
        COUNT(DISTINCT pr.id) as total_records,
        COUNT(DISTINCT fl.id) as total_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'success' THEN fl.id END) as successful_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'error' THEN fl.id END) as failed_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'validation_error' THEN fl.id END) as files_with_errors,
        COALESCE(SUM(fl.valid_rows), 0) as total_valid_rows,
        COALESCE(SUM(fl.invalid_rows), 0) as total_invalid_rows,
        COALESCE(SUM(fl.duplicate_rows), 0) as total_duplicate_rows
      FROM banks b
      LEFT JOIN processed_records pr ON b.id = pr.bank_id
      LEFT JOIN file_logs fl ON b.id = fl.bank_id
    `;

    const statsResult = await db.query(statsQuery);

    // Get recent activity
    const recentActivityQuery = `
      SELECT 
        fl.*,
        b.name as bank_name,
        b.code as bank_code
      FROM file_logs fl
      JOIN banks b ON fl.bank_id = b.id
      ORDER BY fl.processed_at DESC
      LIMIT 10
    `;

    const recentActivity = await db.query(recentActivityQuery);

    // Get processing by bank
    const bankStatsQuery = `
      SELECT 
        b.id,
        b.name,
        b.code,
        COUNT(DISTINCT pr.id) as total_records,
        COUNT(DISTINCT fl.id) as total_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'success' THEN fl.id END) as successful_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'error' THEN fl.id END) as failed_files,
        COALESCE(SUM(fl.valid_rows), 0) as valid_rows,
        COALESCE(SUM(fl.invalid_rows), 0) as invalid_rows
      FROM banks b
      LEFT JOIN processed_records pr ON b.id = pr.bank_id
      LEFT JOIN file_logs fl ON b.id = fl.bank_id
      WHERE b.is_active = true
      GROUP BY b.id, b.name, b.code
      ORDER BY b.name
    `;

    const bankStats = await db.query(bankStatsQuery);

    // Get error summary
    const errorSummaryQuery = `
      SELECT 
        ve.field_name,
        ve.severity,
        COUNT(*) as error_count,
        COUNT(DISTINCT ve.file_log_id) as affected_files
      FROM validation_errors ve
      WHERE ve.is_resolved = false
      GROUP BY ve.field_name, ve.severity
      ORDER BY error_count DESC
      LIMIT 10
    `;

    const errorSummary = await db.query(errorSummaryQuery);

    // Get processing timeline (last 7 days)
    const timelineQuery = `
      SELECT 
        DATE(fl.processed_at) as date,
        COUNT(*) as files_processed,
        SUM(fl.valid_rows) as valid_rows,
        SUM(fl.invalid_rows) as invalid_rows
      FROM file_logs fl
      WHERE fl.processed_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(fl.processed_at)
      ORDER BY date DESC
    `;

    const timeline = await db.query(timelineQuery);

    res.json({
      success: true,
      data: {
        overview: statsResult.rows[0],
        recentActivity: recentActivity.rows,
        bankStatistics: bankStats.rows,
        errorSummary: errorSummary.rows,
        processingTimeline: timeline.rows
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// Get unresolved errors count
router.get('/errors/unresolved', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_unresolved,
        COUNT(DISTINCT file_log_id) as affected_files,
        COUNT(CASE WHEN severity = 'error' THEN 1 END) as critical_errors,
        COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warnings
      FROM validation_errors
      WHERE is_resolved = false
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get unresolved errors error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des erreurs non résolues',
      error: error.message
    });
  }
});

// Get recent records
router.get('/records/recent', authMiddleware, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const query = `
      SELECT 
        pr.*,
        b.name as bank_name,
        b.code as bank_code
      FROM processed_records pr
      JOIN banks b ON pr.bank_id = b.id
      ORDER BY pr.processed_at DESC
      LIMIT $1
    `;

    const result = await db.query(query, [limit]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get recent records error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des enregistrements récents',
      error: error.message
    });
  }
});

module.exports = router;
