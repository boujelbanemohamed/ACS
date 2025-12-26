const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { checkRole, auditLog } = require('../middleware/roleMiddleware');

const router = express.Router();

// GET - Liste des utilisateurs (super_admin seulement)
router.get('/', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.bank_id, u.is_active, 
             u.last_login, u.phone, u.created_at,
             b.name as bank_name, b.code as bank_code
      FROM users u
      LEFT JOIN banks b ON u.bank_id = b.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
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
router.post('/', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { username, email, password, role, bankId, phone } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email et password requis' 
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

    // Si role = bank, bankId est requis
    if (role === 'bank' && !bankId) {
      return res.status(400).json({
        success: false,
        message: 'Une banque doit etre associee pour un utilisateur de type banque'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(`
      INSERT INTO users (username, email, password, role, bank_id, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, username, email, role, bank_id, phone, created_at
    `, [username, email, hashedPassword, role || 'bank', bankId || null, phone || null]);

    await auditLog(req.user.id, 'CREATE_USER', 'users', result.rows[0].id, null, result.rows[0], req);

    res.json({ success: true, message: 'Utilisateur cree', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Modifier un utilisateur
router.put('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { username, email, password, role, bankId, phone, isActive } = req.body;

    // Récupérer l'ancien utilisateur
    const oldUser = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (oldUser.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouve' });
    }

    let query = `UPDATE users SET 
      username = COALESCE($1, username),
      email = COALESCE($2, email),
      role = COALESCE($3, role),
      bank_id = $4,
      phone = COALESCE($5, phone),
      is_active = COALESCE($6, is_active)`;
    
    let params = [username, email, role, bankId, phone, isActive];
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

    await auditLog(req.user.id, 'UPDATE_USER', 'users', req.params.id, oldUser.rows[0], result.rows[0], req);

    res.json({ success: true, message: 'Utilisateur modifie', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Supprimer un utilisateur
router.delete('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    // Ne pas permettre de supprimer son propre compte
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vous ne pouvez pas supprimer votre propre compte' 
      });
    }

    const oldUser = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouve' });
    }

    await auditLog(req.user.id, 'DELETE_USER', 'users', req.params.id, oldUser.rows[0], null, req);

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

    res.json({ success: true, message: 'Profil mis a jour', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
