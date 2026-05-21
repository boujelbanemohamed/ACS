const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/roleMiddleware');
const roleFeaturesService = require('../services/roleFeaturesService');
const auditService = require('../services/auditService');

const router = express.Router();

// Get current user's features (accessible by any authenticated user)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const features = await roleFeaturesService.getAll();
    const userFeatures = features[req.user.role] || {};
    res.json({ success: true, data: userFeatures });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all features (super_admin only)
router.get('/', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const features = await roleFeaturesService.getAll();
    res.json({ success: true, data: features });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:role/:feature', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const { role, feature } = req.params;
    const { enabled } = req.body;

    if (!['bank_admin', 'bank'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role invalide' });
    }

    await roleFeaturesService.setFeature(role, feature, enabled);
    await auditService.logAction('UPDATE_ROLE_FEATURE', { tableName: 'role_features', newData: { role, feature, enabled } }, req);

    res.json({ success: true, message: 'Permission mise à jour' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/reset', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    await roleFeaturesService.ensureTable();
    await db.query('DELETE FROM role_features');
    await roleFeaturesService.seedDefaults();
    await auditService.logAction('RESET_ROLE_FEATURES', { tableName: 'role_features', newData: { reset: true } }, req);
    res.json({ success: true, message: 'Permissions réinitialisées' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
