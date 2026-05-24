const express = require('express');
const db = require('../config/database');
const cronService = require('../services/cronService');
const { authMiddleware } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleMiddleware');
const auditService = require('../services/auditService');

const router = express.Router();

router.get('/status', authMiddleware, (req, res) => {
  res.json({ success: true, data: cronService.getStatus() });
});

router.post('/trigger', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const results = await cronService.run();
    await auditService.logAction('TRIGGER_SCAN', { tableName: 'scan_logs' }, req);
    res.json({ success: true, message: 'Scan terminé', data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur scan' });
  }
});

router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const bankId = req.query.bankId || (req.user.role !== 'super_admin' ? req.user.bank_id : null);

    let query, params;
    if (bankId) {
      query = 'SELECT * FROM scan_logs WHERE bank_id = $1 ORDER BY scan_time DESC LIMIT $2 OFFSET $3';
      params = [bankId, limit, offset];
    } else {
      query = 'SELECT * FROM scan_logs ORDER BY scan_time DESC LIMIT $1 OFFSET $2';
      params = [limit, offset];
    }
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur logs' });
  }
});

module.exports = router;
