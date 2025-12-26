const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    
    // Construire les filtres SQL
    const bankFilterId = bankId ? parseInt(bankId) : null;
    
    // Total des banques (1 si filtre, sinon toutes)
    let totalBanksQuery = 'SELECT COUNT(*) FROM banks WHERE is_active = true';
    if (bankFilterId) {
      totalBanksQuery += ' AND id = ' + bankFilterId;
    }
    const totalBanks = await db.query(totalBanksQuery);

    // Total des enregistrements
    let totalRecordsQuery = 'SELECT COUNT(*) FROM processed_records';
    if (bankFilterId) {
      totalRecordsQuery += ' WHERE bank_id = ' + bankFilterId;
    }
    const totalRecords = await db.query(totalRecordsQuery);

    // Fichiers traités aujourd'hui
    let todayFilesQuery = 'SELECT COUNT(*) FROM file_logs WHERE DATE(processed_at) = CURRENT_DATE';
    if (bankFilterId) {
      todayFilesQuery += ' AND bank_id = ' + bankFilterId;
    }
    const todayFiles = await db.query(todayFilesQuery);

    // Erreurs en attente
    let pendingErrorsQuery = `
      SELECT COUNT(*) FROM validation_errors ve 
      JOIN file_logs fl ON ve.file_log_id = fl.id 
      WHERE ve.is_resolved = false
    `;
    if (bankFilterId) {
      pendingErrorsQuery += ' AND fl.bank_id = ' + bankFilterId;
    }
    const pendingErrors = await db.query(pendingErrorsQuery);

    // Activité récente
    let recentActivityQuery = `
      SELECT fl.*, b.name as bank_name, b.code as bank_code
      FROM file_logs fl
      JOIN banks b ON fl.bank_id = b.id
    `;
    if (bankFilterId) {
      recentActivityQuery += ' WHERE fl.bank_id = ' + bankFilterId;
    }
    recentActivityQuery += ' ORDER BY fl.processed_at DESC LIMIT 10';
    const recentActivity = await db.query(recentActivityQuery);

    // Statistiques par banque
    let bankStatsQuery = `
      SELECT 
        b.id,
        b.name,
        b.code,
        COUNT(DISTINCT pr.id) as total_records,
        COUNT(DISTINCT fl.id) as total_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'success' THEN fl.id END) as successful_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'error' THEN fl.id END) as failed_files
      FROM banks b
      LEFT JOIN processed_records pr ON pr.bank_id = b.id
      LEFT JOIN file_logs fl ON fl.bank_id = b.id
      WHERE b.is_active = true
    `;
    if (bankFilterId) {
      bankStatsQuery += ' AND b.id = ' + bankFilterId;
    }
    bankStatsQuery += ' GROUP BY b.id, b.name, b.code ORDER BY b.name';
    const bankStats = await db.query(bankStatsQuery);

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
