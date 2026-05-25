/**
 * Routes API pour l'historique des enregistrements
 * Traçabilité complète par PAN
 */
const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { filterByBank } = require('../middleware/roleMiddleware');
const recordHistoryService = require('../services/recordHistoryService');
const { decrypt, hashPan } = require('../services/encryptionService');

const router = express.Router();

/**
 * GET /api/record-history/search
 * Recherche dans l'historique avec filtres
 */
router.get('/search', authMiddleware, filterByBank, async (req, res) => {
  try {
    const {
      bankId,
      status,
      sourceType,
      userId,
      dateFrom,
      dateTo,
      hasErrors,
      limit = 50,
      offset = 0
    } = req.query;
    
    // Si utilisateur banque, forcer son bankId
    let filterBankId = bankId;
    if (req.user.role === 'bank' && req.user.bank_id) {
      filterBankId = req.user.bank_id;
    }
    
    const result = await recordHistoryService.searchHistory({
      bankId: filterBankId ? parseInt(filterBankId) : null,
      status,
      sourceType,
      userId: userId ? parseInt(userId) : null,
      dateFrom,
      dateTo,
      hasErrors: hasErrors === 'true' ? true : hasErrors === 'false' ? false : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset
      }
    });
  } catch (error) {
    console.error('Search history error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche dans l\'historique',
      error: error.message
    });
  }
});

/**
 * GET /api/record-history/stats
 * Statistiques globales de l'historique
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    
    // Si utilisateur banque, forcer son bankId
    let filterBankId = bankId;
    if (req.user.role === 'bank' && req.user.bank_id) {
      filterBankId = req.user.bank_id;
    }
    
    const stats = await recordHistoryService.getStats(
      filterBankId ? parseInt(filterBankId) : null
    );
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get history stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

/**
 * GET /api/record-history/top-errors
 * Erreurs les plus fréquentes
 */
router.get('/top-errors', authMiddleware, async (req, res) => {
  try {
    const { bankId, limit = 10 } = req.query;
    
    let filterBankId = bankId;
    if (req.user.role === 'bank' && req.user.bank_id) {
      filterBankId = req.user.bank_id;
    }
    
    const errors = await recordHistoryService.getTopErrors(
      filterBankId ? parseInt(filterBankId) : null,
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: errors
    });
  } catch (error) {
    console.error('Get top errors error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des erreurs fréquentes'
    });
  }
});

/**
 * GET /api/record-history/pan/:bankId/:pan
 * Historique complet d'un PAN spécifique
 */
router.get('/pan/:bankId/:pan', authMiddleware, async (req, res) => {
  try {
    const { bankId, pan } = req.params;
    
    // Vérifier accès banque
    if (req.user.role === 'bank' && req.user.bank_id !== parseInt(bankId)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette banque'
      });
    }
    
    const history = await recordHistoryService.getHistoryByPan(
      parseInt(bankId),
      pan
    );
    
    if (!history.attempts || history.attempts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucun historique trouvé pour ce PAN'
      });
    }
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get PAN history error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique',
      error: error.message
    });
  }
});

/**
 * GET /api/record-history/by-record/:recordId
 * Historique complet via l'ID d'un enregistrement (processed_records)
 * Résout le PAN réel depuis la base pour contourner le masquage
 */
router.get('/by-record/:recordId', authMiddleware, async (req, res) => {
  try {
    const { recordId } = req.params;

    const recordResult = await db.query(
      'SELECT pan, bank_id FROM processed_records WHERE id = $1',
      [recordId]
    );

    if (recordResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enregistrement non trouvé'
      });
    }

    const { pan: encryptedPan, bank_id } = recordResult.rows[0];
    const pan = decrypt(encryptedPan);

    if (req.user.role === 'bank' && req.user.bank_id !== bank_id) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette banque'
      });
    }

    const history = await recordHistoryService.getHistoryByPan(bank_id, pan);

    if (!history.attempts || history.attempts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucun historique trouvé pour cet enregistrement'
      });
    }

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Get record history error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique',
      error: error.message
    });
  }
});

/**
 * GET /api/record-history/pan-lookup
 * Recherche rapide par PAN (partiel ou complet)
 */
router.get('/pan-lookup', authMiddleware, async (req, res) => {
  try {
    const { pan, bankId } = req.query;
    
    if (!pan || pan.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Le PAN doit contenir au moins 4 caractères'
      });
    }
    
    const panHash = hashPan(pan);
    
    let query = `
      SELECT 
        rh.pan_hash,
        rh.bank_id,
        b.code as bank_code,
        b.name as bank_name,
        COUNT(*) as total_attempts,
        MAX(rh.processed_at) as last_attempt,
        MAX(CASE WHEN rh.status = 'SUCCESS' THEN 1 ELSE 0 END) as has_success
      FROM record_history rh
      JOIN banks b ON rh.bank_id = b.id
      WHERE rh.pan_hash = $1
    `;
    
    const params = [panHash];
    let paramCount = 2;
    
    if (bankId) {
      query += ` AND rh.bank_id = $${paramCount}`;
      params.push(parseInt(bankId));
    } else if (req.user.role === 'bank' && req.user.bank_id) {
      query += ` AND rh.bank_id = $${paramCount}`;
      params.push(req.user.bank_id);
    }
    
    query += `
      GROUP BY rh.pan_hash, rh.bank_id, b.code, b.name
      ORDER BY last_attempt DESC
      LIMIT 20
    `;
    
    const result = await db.query(query, params);
    
    res.json({
      success: true,
      data: result.rows.map(row => ({
        ...row,
        pan: pan,
        status: row.has_success ? 'SUCCESS' : 'PENDING'
      }))
    });
  } catch (error) {
    console.error('PAN lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche'
    });
  }
});

/**
 * GET /api/record-history/corrections
 * Liste des PANs qui ont nécessité des corrections
 */
router.get('/corrections', authMiddleware, async (req, res) => {
  try {
    const { bankId, limit = 50, offset = 0 } = req.query;
    
    let filterBankId = bankId;
    if (req.user.role === 'bank' && req.user.bank_id) {
      filterBankId = req.user.bank_id;
    }
    
    let query = `
      SELECT 
        rh.pan_hash,
        rh.bank_id,
        b.code as bank_code,
        b.name as bank_name,
        COUNT(*) as total_attempts,
        MIN(rh.processed_at) as first_attempt,
        MAX(rh.processed_at) as last_attempt,
        MAX(CASE WHEN rh.status = 'SUCCESS' THEN rh.processed_at END) as success_date,
        ARRAY_AGG(DISTINCT rh.username) FILTER (WHERE rh.username IS NOT NULL) as contributors,
        ARRAY_AGG(DISTINCT rh.source_type) as source_types,
        SUM(rh.total_errors) as total_errors_encountered
      FROM record_history rh
      JOIN banks b ON rh.bank_id = b.id
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (filterBankId) {
      query += ` WHERE rh.bank_id = $${paramCount}`;
      params.push(parseInt(filterBankId));
      paramCount++;
    }
    
    query += `
      GROUP BY rh.pan_hash, rh.bank_id, b.code, b.name
      HAVING COUNT(*) > 1
      ORDER BY last_attempt DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await db.query(query, params);
    
    // Calculer le délai de correction pour chaque entrée
    const data = result.rows.map(row => ({
      ...row,
      pan_hash: row.pan_hash,
      pan: row.pan_hash ? '(chiffré)' : null,
      correction_delay_hours: row.success_date 
        ? Math.round((new Date(row.success_date) - new Date(row.first_attempt)) / (1000 * 60 * 60) * 10) / 10
        : null,
      is_resolved: !!row.success_date
    }));
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get corrections error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des corrections'
    });
  }
});

/**
 * GET /api/record-history/timeline/:days
 * Timeline des activités sur X jours
 */
router.get('/timeline/:days', authMiddleware, async (req, res) => {
  try {
    const { days } = req.params;
    const { bankId } = req.query;
    
    let filterBankId = bankId;
    if (req.user.role === 'bank' && req.user.bank_id) {
      filterBankId = req.user.bank_id;
    }
    
    let query = `
      SELECT 
        DATE(processed_at) as date,
        COUNT(*) as total_attempts,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_count,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_count,
        COUNT(*) FILTER (WHERE source_type = 'cron') as cron_count,
        COUNT(*) FILTER (WHERE source_type IN ('upload', 'manual', 'correction')) as manual_count,
        COUNT(DISTINCT pan) as unique_pans
      FROM record_history
      WHERE processed_at >= CURRENT_DATE - $1::interval
    `;
    
    const queryParams = [`${parseInt(days) || 30} days`];
    
    if (filterBankId) {
      query += ` AND bank_id = $2`;
      queryParams.push(parseInt(filterBankId));
    }
    
    query += `
      GROUP BY DATE(processed_at)
      ORDER BY date ASC
    `;
    
    const result = await db.query(query, queryParams);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get timeline error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la timeline'
    });
  }
});

module.exports = router;
