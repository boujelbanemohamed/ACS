const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const router = express.Router();

// Login avec bcrypt
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Nom d\'utilisateur et mot de passe requis'
      });
    }

    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await db.query(query, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    const user = result.rows[0];

    // Comparaison avec bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        role: user.role 
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
          role: user.role
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
