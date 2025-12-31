const express = require('express');
const router = express.Router();
const db = require('../config/database');
const emailService = require('../services/emailService');
const { authMiddleware } = require('../middleware/auth');

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
    res.json({ success: true, message: 'Configuration SMTP mise a jour' });
  } catch (error) {
    console.error('Error updating SMTP config:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post('/smtp/test', authMiddleware, superAdminOnly, async (req, res) => {
  try {
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
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.delete('/emails/:id', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM bank_notification_emails WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Email supprime' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.put('/emails/:id/toggle', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const result = await db.query('UPDATE bank_notification_emails SET is_active = NOT is_active WHERE id = $1 RETURNING *', [req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

router.post('/send/:bankId', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const reportDate = req.body.date ? new Date(req.body.date) : new Date();
    const result = await emailService.sendDailyReport(parseInt(req.params.bankId), reportDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/send-all', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const reportDate = req.body.date ? new Date(req.body.date) : new Date();
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

module.exports = router;
