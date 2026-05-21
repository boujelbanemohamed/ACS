const express = require('express');
const router = express.Router();
const db = require('../config/database');
const emailService = require('../services/emailService');
const { authMiddleware } = require('../middleware/auth');
const auditService = require('../services/auditService');

// Import cronService
const cronService = require('../services/cronService');

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Acces refuse' });
  }
  next();
};

router.get('/smtp', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const result = await db.query('SELECT id, host, port, secure, username, from_email, from_name, enabled, updated_at FROM smtp_config LIMIT 1');
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    console.error('Error getting SMTP config:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.put('/smtp', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { host, port, secure, username, password, from_email, from_name, enabled } = req.body;
    const existing = await db.query('SELECT id FROM smtp_config LIMIT 1');
    if (existing.rows.length > 0) {
      let query = 'UPDATE smtp_config SET host = $1, port = $2, secure = $3, username = $4, from_email = $5, from_name = $6, enabled = $7, updated_at = CURRENT_TIMESTAMP';
      let params = [host, port, secure, username, from_email, from_name, enabled];
      if (password && password.trim() !== '') {
        query += ', password = $8 WHERE id = $9';
        params.push(password, existing.rows[0].id);
      } else {
        query += ' WHERE id = $8';
        params.push(existing.rows[0].id);
      }
      await db.query(query, params);
    } else {
      await db.query('INSERT INTO smtp_config (host, port, secure, username, password, from_email, from_name, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [host, port, secure, username, password, from_email, from_name, enabled]);
    }
    await auditService.logAction('UPDATE_SMTP_CONFIG', { tableName: 'smtp_config', newData: { host, port, from_email, enabled } }, req);
    res.json({ success: true, message: 'Configuration SMTP mise a jour' });
  } catch (error) {
    console.error('Error updating SMTP config:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post('/smtp/test', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    await auditService.logAction('TEST_SMTP', { tableName: 'smtp_config' }, req);
    const result = await emailService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/emails/:bankId', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.params;
    if (req.user.role === 'bank' && req.user.bank_id !== parseInt(bankId)) {
      return res.status(403).json({ success: false, message: 'Acces refuse' });
    }
    const result = await db.query('SELECT * FROM bank_notification_emails WHERE bank_id = $1 ORDER BY created_at DESC', [bankId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post('/emails/:bankId', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { bankId } = req.params;
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Email invalide' });
    }
    const existing = await db.query('SELECT id FROM bank_notification_emails WHERE bank_id = $1 AND email = $2', [bankId, email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Cet email existe deja' });
    }
    const result = await db.query('INSERT INTO bank_notification_emails (bank_id, email) VALUES ($1, $2) RETURNING *', [bankId, email]);
    await auditService.logAction('ADD_NOTIFICATION_EMAIL', { tableName: 'bank_notification_emails', recordId: result.rows[0]?.id, newData: { bankId, email } }, req);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.delete('/emails/:id', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const oldEmail = await db.query('SELECT * FROM bank_notification_emails WHERE id = $1', [req.params.id]);
    await db.query('DELETE FROM bank_notification_emails WHERE id = $1', [req.params.id]);
    await auditService.logAction('DELETE_NOTIFICATION_EMAIL', { tableName: 'bank_notification_emails', recordId: req.params.id, oldData: oldEmail.rows[0] }, req);
    res.json({ success: true, message: 'Email supprime' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.put('/emails/:id/toggle', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const result = await db.query('UPDATE bank_notification_emails SET is_active = NOT is_active WHERE id = $1 RETURNING *', [req.params.id]);
    await auditService.logAction('TOGGLE_NOTIFICATION_EMAIL', { tableName: 'bank_notification_emails', recordId: req.params.id, newData: { is_active: result.rows[0]?.is_active } }, req);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post('/send/:bankId', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const reportDate = req.body.date ? new Date(req.body.date) : new Date();
    await auditService.logAction('SEND_REPORT', { tableName: 'notification_logs', newData: { bankId: req.params.bankId } }, req);
    const result = await emailService.sendDailyReport(parseInt(req.params.bankId), reportDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/send-all', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const reportDate = req.body.date ? new Date(req.body.date) : new Date();
    await auditService.logAction('SEND_ALL_REPORTS', { tableName: 'notification_logs' }, req);
    const result = await emailService.sendAllDailyReports(reportDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    let query = 'SELECT nl.*, b.name as bank_name FROM notification_logs nl LEFT JOIN banks b ON nl.bank_id = b.id';
    const params = [];
    if (req.user.role === 'bank') {
      query += ' WHERE nl.bank_id = $1';
      params.push(req.user.bank_id);
    } else if (bankId) {
      query += ' WHERE nl.bank_id = $1';
      params.push(bankId);
    }
    query += ' ORDER BY nl.sent_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// GET /api/notifications/cron-config - Obtenir la config du cron
router.get('/cron-config', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    // cronService already imported
    res.json({
      success: true,
      data: {
        schedule: cronService.dailyReportSchedule || '0 8 * * *',
        enabled: cronService.dailyReportEnabled !== false,
        nextRun: getNextCronRun(cronService.dailyReportSchedule || '0 8 * * *')
      }
    });
  } catch (error) {
    console.error('Error getting cron config:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// PUT /api/notifications/cron-config - Mettre a jour la config du cron
router.put('/cron-config', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { schedule, enabled } = req.body;
    // cronService already imported
    
    // Valider le format cron
    if (schedule && !isValidCron(schedule)) {
      return res.status(400).json({ success: false, message: 'Format cron invalide' });
    }
    
    if (schedule) {
      cronService.dailyReportSchedule = schedule;
    }
    cronService.dailyReportEnabled = enabled !== false;
    
    // Redemarrer le cron avec la nouvelle config
    cronService.startDailyReportTask();

    await auditService.logAction('UPDATE_CRON_CONFIG', { tableName: 'settings', newData: { schedule: cronService.dailyReportSchedule, enabled: cronService.dailyReportEnabled } }, req);

    res.json({
      success: true,
      message: 'Configuration du cron mise a jour',
      data: {
        schedule: cronService.dailyReportSchedule,
        enabled: cronService.dailyReportEnabled,
        nextRun: getNextCronRun(cronService.dailyReportSchedule)
      }
    });
  } catch (error) {
    console.error('Error updating cron config:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Fonction pour valider le format cron
function isValidCron(cronExpression) {
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) return false;
  return true;
}

// Fonction pour calculer la prochaine execution
function getNextCronRun(cronExpression) {
  try {
    const parts = cronExpression.split(' ');
    const [minute, hour] = parts;
    const now = new Date();
    const next = new Date();
    next.setHours(parseInt(hour), parseInt(minute), 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  } catch (e) {
    return null;
  }
}

module.exports = router;
