const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleMiddleware');
const auditService = require('../services/auditService');

const router = express.Router();

// GET - Liste des utilisateurs
router.get('/', authMiddleware, (req, res, next) => {
  if (req.user.role === 'super_admin' || req.user.role === 'bank_admin') return next();
  return res.status(403).json({ success: false, message: 'Accès non autorisé' });
}, async (req, res) => {
  try {
    let query;
    let countQuery;
    let params = [];
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;

    if (req.user.role === 'super_admin') {
      query = `
        SELECT u.id, u.username, u.email, u.role, u.bank_id, u.is_active, 
               u.last_login, u.phone, u.created_at,
               b.name as bank_name, b.code as bank_code
        FROM users u
        LEFT JOIN banks b ON u.bank_id = b.id
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      countQuery = 'SELECT COUNT(*) as total FROM users';
      params = [limit, offset];
    } else {
      query = `
        SELECT u.id, u.username, u.email, u.role, u.bank_id, u.is_active, 
               u.last_login, u.phone, u.created_at,
               b.name as bank_name, b.code as bank_code
        FROM users u
        LEFT JOIN banks b ON u.bank_id = b.id
        WHERE u.bank_id = $1
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      countQuery = 'SELECT COUNT(*) as total FROM users WHERE bank_id = $1';
      params = [req.user.bank_id, limit, offset];
    }

    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, req.user.role === 'super_admin' ? [] : [req.user.bank_id])
    ]);
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Utilisateur par ID
router.get('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.bank_id, u.is_active, 
             u.last_login, u.phone, u.created_at,
             b.name as bank_name, b.code as bank_code
      FROM users u
      LEFT JOIN banks b ON u.bank_id = b.id
      WHERE u.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouve' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Créer un utilisateur
router.post('/', authMiddleware, (req, res, next) => {
  if (req.user.role === 'super_admin' || req.user.role === 'bank_admin') return next();
  return res.status(403).json({ success: false, message: 'Accès non autorisé' });
}, async (req, res) => {
  try {
    const { username, email, password, role, bankId, phone } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email et password requis' 
      });
    }

    // bank_admin peut créer des bank et bank_admin pour sa banque
    if (req.user.role === 'bank_admin') {
      if (role && role !== 'bank' && role !== 'bank_admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous pouvez uniquement créer des utilisateurs de type Banque'
        });
      }
      req.body.bankId = req.user.bank_id;
    }

    const finalBankId = req.body.bankId || bankId;

    // Si role = bank ou bank_admin, bankId est requis
    if ((role === 'bank' || role === 'bank_admin') && !finalBankId) {
      return res.status(400).json({
        success: false,
        message: 'Une banque doit etre associee pour un utilisateur de type banque'
      });
    }

    // Vérifier si username ou email existe déjà
    const existing = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username ou email deja utilise' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(`
      INSERT INTO users (username, email, password, role, bank_id, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, email, role, bank_id, phone, created_at
    `, [username, email, hashedPassword, role || 'bank', finalBankId || null, phone || null]);

    await auditService.logAction('CREATE_USER', { tableName: 'users', recordId: result.rows[0].id, newData: result.rows[0] }, req);

    res.json({ success: true, message: 'Utilisateur cree', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Modifier un utilisateur
router.put('/:id', authMiddleware, (req, res, next) => {
  if (req.user.role === 'super_admin' || req.user.role === 'bank_admin') return next();
  return res.status(403).json({ success: false, message: 'Accès non autorisé' });
}, async (req, res) => {
  try {
    const { username, email, password, role, bankId, phone, isActive } = req.body;

    // Récupérer l'ancien utilisateur
    const oldUser = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (oldUser.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouve' });
    }

    // bank_admin : restrictions
    if (req.user.role === 'bank_admin') {
      if (oldUser.rows[0].bank_id !== req.user.bank_id) {
        return res.status(403).json({ success: false, message: 'Utilisateur non rattaché à votre banque' });
      }
      if (oldUser.rows[0].role === 'super_admin' || oldUser.rows[0].role === 'bank_admin') {
        return res.status(403).json({ success: false, message: 'Vous ne pouvez pas modifier cet utilisateur' });
      }
      if (role && (role !== 'bank' && role !== 'bank_admin')) {
        return res.status(403).json({ success: false, message: 'Role non autorisé' });
      }
      req.body.bankId = req.user.bank_id;
    }

    let query = `UPDATE users SET 
      username = COALESCE($1, username),
      email = COALESCE($2, email),
      role = COALESCE($3, role),
      bank_id = $4,
      phone = COALESCE($5, phone),
      is_active = COALESCE($6, is_active)`;
    
    let params = [username, email, role, req.body.bankId || bankId, phone, isActive];
    let paramIndex = 7;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += `, password = $${paramIndex}`;
      params.push(hashedPassword);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex} RETURNING id, username, email, role, bank_id, phone, is_active`;
    params.push(req.params.id);

    const result = await db.query(query, params);

    await auditService.logAction('UPDATE_USER', { tableName: 'users', recordId: req.params.id, oldData: oldUser.rows[0], newData: result.rows[0] }, req);

    res.json({ success: true, message: 'Utilisateur modifie', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Supprimer un utilisateur
router.delete('/:id', authMiddleware, (req, res, next) => {
  if (req.user.role === 'super_admin' || req.user.role === 'bank_admin') return next();
  return res.status(403).json({ success: false, message: 'Accès non autorisé' });
}, async (req, res) => {
  try {
    // Ne pas permettre de supprimer son propre compte
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vous ne pouvez pas supprimer votre propre compte' 
      });
    }

    const oldUser = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (oldUser.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouve' });
    }

    // bank_admin : ne peut supprimer que les bank user de sa banque
    if (req.user.role === 'bank_admin') {
      if (oldUser.rows[0].bank_id !== req.user.bank_id) {
        return res.status(403).json({ success: false, message: 'Utilisateur non rattaché à votre banque' });
      }
      if (oldUser.rows[0].role === 'super_admin' || oldUser.rows[0].role === 'bank_admin') {
        return res.status(403).json({ success: false, message: 'Vous ne pouvez pas supprimer cet utilisateur' });
      }
    }
    
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouve' });
    }

    await auditService.logAction('DELETE_USER', { tableName: 'users', recordId: req.params.id, oldData: oldUser.rows[0] }, req);

    res.json({ success: true, message: 'Utilisateur supprime' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Mon profil
router.get('/me/profile', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.bank_id, u.phone, u.created_at, u.last_login,
             b.name as bank_name, b.code as bank_code
      FROM users u
      LEFT JOIN banks b ON u.bank_id = b.id
      WHERE u.id = $1
    `, [req.user.id]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Modifier mon profil
router.put('/me/profile', authMiddleware, async (req, res) => {
  try {
    const { email, phone, currentPassword, newPassword } = req.body;

    if (newPassword) {
      // Vérifier le mot de passe actuel
      const user = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      const isValid = await bcrypt.compare(currentPassword, user.rows[0].password);
      
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id]);
    }

    const result = await db.query(`
      UPDATE users SET 
        email = COALESCE($1, email),
        phone = COALESCE($2, phone)
      WHERE id = $3
      RETURNING id, username, email, phone
    `, [email, phone, req.user.id]);

  const changes = {};
  if (email) changes.email = email;
  if (phone) changes.phone = phone;
  if (newPassword) changes.password_changed = true;
  await auditService.logAction('UPDATE_PROFILE', { tableName: 'users', recordId: req.user.id, newData: changes }, req);

  res.json({ success: true, message: 'Profil mis a jour', data: result.rows[0] });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
