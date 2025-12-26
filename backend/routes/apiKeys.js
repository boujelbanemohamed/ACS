const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Générer une API Key
const generateApiKey = () => {
  return 'acs_' + crypto.randomBytes(32).toString('hex');
};

// GET - Liste des API Keys
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ak.*, b.name as bank_name, b.code as bank_code,
        (SELECT COUNT(*) FROM api_logs al WHERE al.api_key_id = ak.id) as total_calls,
        (SELECT COUNT(*) FROM api_logs al WHERE al.api_key_id = ak.id AND al.created_at > NOW() - INTERVAL '24 hours') as calls_today
       FROM api_keys ak
       LEFT JOIN banks b ON ak.bank_id = b.id
       ORDER BY ak.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Stats des API Keys
router.get('/stats', authMiddleware, async (req, res) => {
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
router.get('/:id/logs', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await db.query(
      `SELECT * FROM api_logs WHERE api_key_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Créer une API Key
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, institution, bankId, permissions, rateLimit, expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Nom requis' });
    }

    const apiKey = generateApiKey();

    const result = await db.query(
      `INSERT INTO api_keys (name, api_key, institution, bank_id, permissions, rate_limit, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name,
        apiKey,
        institution || null,
        bankId || null,
        permissions || ['read', 'write'],
        rateLimit || 100,
        expiresAt || null,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'API Key creee avec succes',
      data: {
        ...result.rows[0],
        api_key: apiKey // Montrer la clé complète une seule fois
      }
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Modifier une API Key
router.put('/:id', authMiddleware, async (req, res) => {
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
      [name, institution, bankId, permissions, rateLimit, expiresAt, isActive, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'API Key non trouvee' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Supprimer une API Key
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await db.query('DELETE FROM api_logs WHERE api_key_id = $1', [req.params.id]);
    const result = await db.query('DELETE FROM api_keys WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'API Key non trouvee' });
    }

    res.json({ success: true, message: 'API Key supprimee' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Régénérer une API Key
router.post('/:id/regenerate', authMiddleware, async (req, res) => {
  try {
    const newApiKey = generateApiKey();

    const result = await db.query(
      'UPDATE api_keys SET api_key = $1 WHERE id = $2 RETURNING *',
      [newApiKey, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'API Key non trouvee' });
    }

    res.json({
      success: true,
      message: 'API Key regeneree',
      data: { ...result.rows[0], api_key: newApiKey }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
