const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const { authSchemas, validate } = require('../utils/validators');

const router = express.Router();

// Login avec bcrypt
router.post('/login', validate(authSchemas.login), async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT u.*, b.name as bank_name, b.code as bank_code FROM users u LEFT JOIN banks b ON u.bank_id = b.id WHERE u.username = $1';
    const result = await db.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    const user = result.rows[0];

    // Comparaison avec bcrypt
    // Vérifier si le compte est actif
    if (user.is_active === false) {
      return res.status(401).json({
        success: false,
        message: 'Compte desactive. Contactez l\'administrateur.'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    // Mettre à jour last_login
    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        role: user.role,
        bank_id: user.bank_id
      },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key',
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    res.json({
      success: true,
      message: 'Connexion reussie',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          bank_id: user.bank_id,
          bank_name: user.bank_name,
          bank_code: user.bank_code
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion',
      error: error.message
    });
  }
});

module.exports = router;
