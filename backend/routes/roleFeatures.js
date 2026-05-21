const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { isSuperAdmin, isSuperAdminOrBankAdmin } = require('../middleware/roleMiddleware');
const roleFeaturesService = require('../services/roleFeaturesService');
const auditService = require('../services/auditService');

const router = express.Router();

const checkBankAccess = (req, res, next) => {
  if (req.user.role === 'super_admin') return next();
  if (req.user.role === 'bank_admin') {
    const bankId = parseInt(req.params.bankId);
    if (bankId !== req.user.bank_id) {
      return res.status(403).json({ success: false, message: 'Accès refusé à cette banque.' });
    }
    return next();
  }
  return res.status(403).json({ success: false, message: 'Accès refusé.' });
};

// Get current user's effective features (any authenticated user)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'super_admin') {
      return res.json({ success: true, data: {} });
    }
    const features = await roleFeaturesService.getEffectiveFeatures(req.user.id, req.user.role, req.user.bank_id);
    res.json({ success: true, data: features });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all features with bank/user overrides (super_admin only)
router.get('/', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const features = await roleFeaturesService.getAll();
    res.json({ success: true, data: features });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// List banks for the permissions UI
router.get('/banks', authMiddleware, isSuperAdminOrBankAdmin, async (req, res) => {
  try {
    let query = 'SELECT id, name, code FROM banks WHERE is_active = true';
    let params = [];
    if (req.user.role === 'bank_admin') {
      query += ' AND id = $1';
      params.push(req.user.bank_id);
    }
    query += ' ORDER BY name';
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// List users (with bank context) for the permissions UI
router.get('/users', authMiddleware, isSuperAdminOrBankAdmin, async (req, res) => {
  try {
    const { bankId } = req.query;
    let query = `SELECT u.id, u.username, u.role, u.bank_id, b.name as bank_name
                 FROM users u LEFT JOIN banks b ON u.bank_id = b.id`;
    let params = [];
    const conditions = [];
    if (req.user.role === 'bank_admin') {
      conditions.push('u.bank_id = $' + (params.length + 1));
      params.push(req.user.bank_id);
    } else if (bankId) {
      conditions.push('u.bank_id = $' + (params.length + 1));
      params.push(parseInt(bankId));
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY u.username';
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get bank-level features for a specific bank
router.get('/bank/:bankId', authMiddleware, isSuperAdminOrBankAdmin, checkBankAccess, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM bank_features WHERE bank_id = $1', [req.params.bankId]);
    const features = {};
    for (const row of result.rows) {
      features[row.feature] = row.enabled;
    }
    res.json({ success: true, data: features });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user-level features for a specific user
router.get('/user/:userId', authMiddleware, isSuperAdminOrBankAdmin, async (req, res) => {
  try {
    // Verify user belongs to bank_admin's bank if applicable
    if (req.user.role === 'bank_admin') {
      const userCheck = await db.query('SELECT bank_id FROM users WHERE id = $1', [parseInt(req.params.userId)]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
      }
      if (userCheck.rows[0].bank_id !== req.user.bank_id) {
        return res.status(403).json({ success: false, message: 'Accès refusé à cet utilisateur.' });
      }
    }
    const result = await db.query('SELECT * FROM user_features WHERE user_id = $1', [req.params.userId]);
    const features = {};
    for (const row of result.rows) {
      features[row.feature] = row.enabled;
    }
    res.json({ success: true, data: features });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle role feature
router.put('/role/:role/:feature', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const { role, feature } = req.params;
    const { enabled } = req.body;
    await roleFeaturesService.setRoleFeature(role, feature, enabled);
    await auditService.logAction('UPDATE_ROLE_FEATURE', { tableName: 'role_features', newData: { level: 'role', role, feature, enabled } }, req);
    res.json({ success: true, message: 'Permission mise à jour' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle bank feature
router.put('/bank/:bankId/:feature', authMiddleware, isSuperAdminOrBankAdmin, checkBankAccess, async (req, res) => {
  try {
    const { bankId, feature } = req.params;
    const { enabled } = req.body;
    await roleFeaturesService.setBankFeature(parseInt(bankId), feature, enabled);
    await auditService.logAction('UPDATE_ROLE_FEATURE', { tableName: 'bank_features', newData: { level: 'bank', bankId, feature, enabled } }, req);
    res.json({ success: true, message: 'Permission bancaire mise à jour' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle user feature
router.put('/user/:userId/:feature', authMiddleware, isSuperAdminOrBankAdmin, async (req, res) => {
  try {
    const { userId, feature } = req.params;
    const { enabled } = req.body;
    // Verify user belongs to bank_admin's bank if applicable
    if (req.user.role === 'bank_admin') {
      const userCheck = await db.query('SELECT bank_id FROM users WHERE id = $1', [parseInt(userId)]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
      }
      if (userCheck.rows[0].bank_id !== req.user.bank_id) {
        return res.status(403).json({ success: false, message: 'Accès refusé à cet utilisateur.' });
      }
    }
    await roleFeaturesService.setUserFeature(parseInt(userId), feature, enabled);
    await auditService.logAction('UPDATE_ROLE_FEATURE', { tableName: 'user_features', newData: { level: 'user', userId, feature, enabled } }, req);
    res.json({ success: true, message: 'Permission utilisateur mise à jour' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove bank override (reset to role default)
router.delete('/bank/:bankId/:feature', authMiddleware, isSuperAdminOrBankAdmin, checkBankAccess, async (req, res) => {
  try {
    await roleFeaturesService.deleteBankFeature(parseInt(req.params.bankId), req.params.feature);
    res.json({ success: true, message: 'Override banque supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove user override (reset to role/bank default)
router.delete('/user/:userId/:feature', authMiddleware, isSuperAdminOrBankAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    // Verify user belongs to bank_admin's bank if applicable
    if (req.user.role === 'bank_admin') {
      const userCheck = await db.query('SELECT bank_id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
      }
      if (userCheck.rows[0].bank_id !== req.user.bank_id) {
        return res.status(403).json({ success: false, message: 'Accès refusé à cet utilisateur.' });
      }
    }
    await roleFeaturesService.deleteUserFeature(userId, req.params.feature);
    res.json({ success: true, message: 'Override utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/reset', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    await roleFeaturesService.resetDefaults();
    await auditService.logAction('RESET_ROLE_FEATURES', { tableName: 'role_features', newData: { reset: true } }, req);
    res.json({ success: true, message: 'Permissions réinitialisées' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
