const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { checkRole, filterByBank, isSuperAdmin } = require('../middleware/roleMiddleware');
const auditService = require('../services/auditService');

const { effectiveBankId } = require('../utils/bankScope');

const router = express.Router();

// Générer une API Key
const generateApiKey = () => {
  return 'acs_' + crypto.randomBytes(32).toString('hex');
};

// Seule l'empreinte de la clé est conservée ; la clé complète n'est affichée qu'à sa création
const hashApiKey = (apiKey) => crypto.createHash('sha256').update(apiKey).digest('hex');
const keyPrefix = (apiKey) => apiKey.slice(0, 12);

// Ne jamais renvoyer la clé ni son empreinte
const presentKey = (row) => {
  if (!row) return row;
  const { api_key, key_hash, ...rest } = row;
  return rest;
};

const VALID_PERMISSIONS = ['read', 'write'];
const sanitizePermissions = (permissions) => {
  if (!Array.isArray(permissions)) return null;
  const filtered = permissions.filter(p => VALID_PERMISSIONS.includes(p));
  return filtered.length > 0 ? filtered : null;
};

// GET - Liste des API Keys
router.get('/', authMiddleware, filterByBank, async (req, res) => {
  try {
    let query = `
      SELECT ak.*, b.name as bank_name, b.code as bank_code,
        (SELECT COUNT(*) FROM api_logs al WHERE al.api_key_id = ak.id) as total_calls,
        (SELECT COUNT(*) FROM api_logs al WHERE al.api_key_id = ak.id AND al.created_at > NOW() - INTERVAL '24 hours') as calls_today
      FROM api_keys ak
      LEFT JOIN banks b ON ak.bank_id = b.id
    `;
    const params = [];
    const bankId = effectiveBankId(req.user, req.query.bankId);
    if (bankId !== null) {
      query += ' WHERE ak.bank_id = $1';
      params.push(bankId);
    }
    query += ' ORDER BY ak.created_at DESC';
    
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows.map(presentKey) });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Stats des API Keys
router.get('/stats', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_keys,
        COUNT(*) FILTER (WHERE is_active = true) as active_keys,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_keys,
        (SELECT COUNT(*) FROM api_logs) as total_api_calls,
        (SELECT COUNT(*) FROM api_logs WHERE created_at > NOW() - INTERVAL '24 hours') as calls_today,
        (SELECT COUNT(*) FROM api_logs WHERE response_status >= 400) as error_calls
      FROM api_keys
    `);
    res.json({ success: true, data: stats.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Logs d'une API Key
router.get('/:id/logs', authMiddleware, isSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const [result, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM api_logs WHERE api_key_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset]
      ),
      db.query('SELECT COUNT(*) as total FROM api_logs WHERE api_key_id = $1', [req.params.id])
    ]);
    res.json({
      success: true,
      data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), limit, offset }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Créer une API Key
router.post('/', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { name, institution, bankId, permissions, rateLimit, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Nom requis' });
    }

    const apiKey = generateApiKey();
    const safeRateLimit = Math.min(Math.max(parseInt(rateLimit, 10) || 100, 1), 100000);

    const result = await db.query(
      `INSERT INTO api_keys (name, api_key, key_hash, key_prefix, institution, bank_id, permissions, rate_limit, expires_at, created_by)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        name,
        hashApiKey(apiKey),
        keyPrefix(apiKey),
        institution || null,
        bankId || null,
        sanitizePermissions(permissions) || ['read', 'write'],
        safeRateLimit,
        expiresAt || null,
        req.user.id
      ]
    );

    await auditService.logAction('CREATE_API_KEY', { tableName: 'api_keys', recordId: result.rows[0].id, newData: { name, institution, bankId } }, req);

    res.json({
      success: true,
      message: 'API Key creee avec succes',
      data: {
        ...presentKey(result.rows[0]),
        api_key: apiKey
      }
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Modifier une API Key
router.put('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { name, institution, bankId, permissions, rateLimit, expiresAt, isActive } = req.body;

    const result = await db.query(
      `UPDATE api_keys SET 
        name = COALESCE($1, name),
        institution = COALESCE($2, institution),
        bank_id = COALESCE($3, bank_id),
        permissions = COALESCE($4, permissions),
        rate_limit = COALESCE($5, rate_limit),
        expires_at = COALESCE($6, expires_at),
        is_active = COALESCE($7, is_active)
       WHERE id = $8 RETURNING *`,
      [
        name,
        institution,
        bankId,
        permissions === undefined ? null : sanitizePermissions(permissions),
        rateLimit === undefined || rateLimit === null ? null : Math.min(Math.max(parseInt(rateLimit, 10) || 100, 1), 100000),
        expiresAt,
        isActive,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'API Key non trouvee' });
    }

    await auditService.logAction('UPDATE_API_KEY', { tableName: 'api_keys', recordId: req.params.id, newData: presentKey(result.rows[0]) }, req);

    res.json({ success: true, data: presentKey(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Supprimer une API Key
router.delete('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const oldKey = await db.query('SELECT * FROM api_keys WHERE id = $1', [req.params.id]);
    await db.query('DELETE FROM api_logs WHERE api_key_id = $1', [req.params.id]);
    const result = await db.query('DELETE FROM api_keys WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'API Key non trouvee' });
    }

    await auditService.logAction('DELETE_API_KEY', { tableName: 'api_keys', recordId: req.params.id, oldData: presentKey(oldKey.rows[0]) }, req);

    res.json({ success: true, message: 'API Key supprimee' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Régénérer une API Key
router.post('/:id/regenerate', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const newApiKey = generateApiKey();

    const result = await db.query(
      'UPDATE api_keys SET api_key = NULL, key_hash = $1, key_prefix = $2 WHERE id = $3 RETURNING *',
      [hashApiKey(newApiKey), keyPrefix(newApiKey), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'API Key non trouvee' });
    }

    await auditService.logAction('REGENERATE_API_KEY', { tableName: 'api_keys', recordId: req.params.id }, req);

    res.json({
      success: true,
      message: 'API Key regeneree',
      data: { ...presentKey(result.rows[0]), api_key: newApiKey }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
module.exports.hashApiKey = hashApiKey;
