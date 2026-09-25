const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleMiddleware');
const auditService = require('../services/auditService');
const { checkPassword } = require('../utils/passwordPolicy');
const { signToken } = require('../utils/tokens');

const router = express.Router();

const VALID_ROLES = ['super_admin', 'bank_admin', 'bank'];

// Jamais de hash de mot de passe ni de jeton dans les journaux d'audit
const sanitizeUser = (user) => {
  if (!user) return user;
  const { password, reset_token, reset_token_expires, token_version, ...safe } = user;
  return safe;
};

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

    const policyError = checkPassword(password);
    if (policyError) {
      return res.status(400).json({ success: false, message: policyError });
    }

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role invalide' });
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

    // Mot de passe défini par un administrateur : l'utilisateur devra le changer à sa première connexion
    const result = await db.query(`
      INSERT INTO users (username, email, password, role, bank_id, phone, must_change_password)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id, username, email, role, bank_id, phone, created_at
    `, [username, email, hashedPassword, role || 'bank', finalBankId || null, phone || null]);

    await auditService.logAction('CREATE_USER', { tableName: 'users', recordId: result.rows[0].id, newData: result.rows[0] }, req);

    res.json({ success: true, message: 'Utilisateur cree', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Username ou email deja utilise' });
    }
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

    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role invalide' });
    }

    if (password) {
      const policyError = checkPassword(password);
      if (policyError) {
        return res.status(400).json({ success: false, message: policyError });
      }
    }

    // bank_id n'est modifié que s'il est fourni (null explicite = aucune banque)
    const bankIdProvided = req.user.role === 'bank_admin' || Object.prototype.hasOwnProperty.call(req.body, 'bankId');
    const newBankId = req.user.role === 'bank_admin' ? req.user.bank_id : (bankId === undefined ? null : bankId);

    let query = `UPDATE users SET 
      username = COALESCE($1, username),
      email = COALESCE($2, email),
      role = COALESCE($3, role),
      bank_id = CASE WHEN $4::boolean THEN $5::integer ELSE bank_id END,
      phone = COALESCE($6, phone),
      is_active = COALESCE($7, is_active)`;
    
    let params = [username, email, role, bankIdProvided, newBankId, phone, isActive];
    let paramIndex = 8;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      // Mot de passe réinitialisé par un administrateur : changement obligatoire à la prochaine connexion
      query += `, password = $${paramIndex}, must_change_password = true, password_changed_at = CURRENT_TIMESTAMP`;
      params.push(hashedPassword);
      paramIndex++;
    }

    // Toute modification sensible révoque les sessions ouvertes de l'utilisateur
    const previous = oldUser.rows[0];
    const revokeSessions = !!password || (role && role !== previous.role) || isActive === false ||
      (bankIdProvided && Number(newBankId) !== Number(previous.bank_id));
    if (revokeSessions) {
      query += ', token_version = COALESCE(token_version, 0) + 1';
    }

    query += ` WHERE id = $${paramIndex} RETURNING id, username, email, role, bank_id, phone, is_active`;
    params.push(req.params.id);

    const result = await db.query(query, params);

    await auditService.logAction('UPDATE_USER', { tableName: 'users', recordId: req.params.id, oldData: sanitizeUser(oldUser.rows[0]), newData: result.rows[0] }, req);

    res.json({ success: true, message: 'Utilisateur modifie', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Username ou email deja utilise' });
    }
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

    await auditService.logAction('DELETE_USER', { tableName: 'users', recordId: req.params.id, oldData: sanitizeUser(oldUser.rows[0]) }, req);

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
    let newToken;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Mot de passe actuel requis' });
      }

      const policyError = checkPassword(newPassword);
      if (policyError) {
        return res.status(400).json({ success: false, message: policyError });
      }

      // Vérifier le mot de passe actuel
      const user = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
      const isValid = user.rows.length > 0 && await bcrypt.compare(currentPassword, user.rows[0].password);
      
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updated = await db.query(
        `UPDATE users SET password = $1, must_change_password = false, password_changed_at = CURRENT_TIMESTAMP,
           token_version = COALESCE(token_version, 0) + 1
         WHERE id = $2
         RETURNING id, username, email, role, bank_id, must_change_password, token_version`,
        [hashedPassword, req.user.id]
      );
      // Les autres sessions sont révoquées ; la session courante reçoit un nouveau jeton
      if (updated.rows && updated.rows[0]) newToken = signToken(updated.rows[0]);
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

  res.json({ success: true, message: 'Profil mis a jour', data: result.rows[0], token: newToken });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Email deja utilise' });
    }
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
