const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const emailService = require('../services/emailService');

const { authSchemas, validate } = require('../utils/validators');
const auditService = require('../services/auditService');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const PASSWORD_EXPIRY_DAYS = parseInt(process.env.PASSWORD_EXPIRY_DAYS, 10) || 90;

// Login avec bcrypt
router.post('/login', validate(authSchemas.login), async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT u.*, b.name as bank_name, b.code as bank_code FROM users u LEFT JOIN banks b ON u.bank_id = b.id WHERE u.username = $1';
    const result = await db.query(query, [username]);

    if (result.rows.length === 0) {
      await auditService.log(null, username, null, 'LOGIN_FAILED', 'users', null, null, { reason: 'user_not_found' }, req);
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    const user = result.rows[0];

    if (user.is_active === false) {
      await auditService.log(user.id, user.username, user.role, 'LOGIN_FAILED', 'users', user.id, null, { reason: 'account_disabled' }, req);
      return res.status(401).json({
        success: false,
        message: 'Compte desactive. Contactez l\'administrateur.'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await auditService.log(user.id, user.username, user.role, 'LOGIN_FAILED', 'users', user.id, null, { reason: 'wrong_password' }, req);
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    await auditService.log(user.id, user.username, user.role, 'LOGIN_SUCCESS', 'users', user.id, null, null, { user: { id: user.id, username: user.username, role: user.role, bank_id: user.bank_id }, ip: req.ip, connection: req.connection });

    const passwordExpired = user.password_changed_at && (
      new Date(user.password_changed_at).getTime() + (PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000) < Date.now()
    );

    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        role: user.role,
        bank_id: user.bank_id,
        must_change_password: user.must_change_password || false
      },
      process.env.JWT_SECRET,
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
        },
        must_change_password: user.must_change_password || false,
        password_expired: passwordExpired
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

// Changement de mot de passe (utilisateur connecté)
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Mot de passe actuel et nouveau mot de passe requis' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ success: false, message: 'Le mot de passe est trop long' });
    }

    const userResult = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password);
    if (!isValid) {
      await auditService.log(req.user.id, req.user.username, req.user.role, 'CHANGE_PASSWORD_FAILED', 'users', req.user.id, null, { reason: 'wrong_current_password' }, req);
      return res.status(400).json({ success: false, message: 'Mot de passe actuel incorrect' });
    }

    const samePassword = await bcrypt.compare(newPassword, userResult.rows[0].password);
    if (samePassword) {
      return res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit être différent de l\'ancien' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.query(
      'UPDATE users SET password = $1, must_change_password = false, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.user.id]
    );

    await auditService.log(req.user.id, req.user.username, req.user.role, 'CHANGE_PASSWORD_SUCCESS', 'users', req.user.id, null, null, req);

    res.json({ success: true, message: 'Mot de passe changé avec succès' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du changement de mot de passe'
    });
  }
});

// Vérifier si le mot de passe est expiré
router.get('/password-status', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT must_change_password, password_changed_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }
    const user = result.rows[0];
    const passwordExpired = user.password_changed_at && (
      new Date(user.password_changed_at).getTime() + (PASSWORD_EXPIRY_DAYS * 24 * 60 * 60 * 1000) < Date.now()
    );
    res.json({
      success: true,
      data: {
        must_change_password: user.must_change_password || false,
        password_expired: !!passwordExpired,
        password_changed_at: user.password_changed_at,
        password_expires_days: PASSWORD_EXPIRY_DAYS
      }
    });
  } catch (error) {
    console.error('Password status error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification' });
  }
});

// Mot de passe oublié - génération du token
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email requis' });
    }

    const userResult = await db.query('SELECT id, username, email FROM users WHERE email = $1 AND is_active = true', [email]);

    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
    }

    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000);

    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, expiresAt, user.id]
    );

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;

    const htmlContent = `
      <h2>Réinitialisation de mot de passe</h2>
      <p>Bonjour ${user.username},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p>Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Réinitialiser mon mot de passe</a></p>
      <p>Ce lien expire dans 1 heure.</p>
      <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      <hr>
      <p style="color:#666;font-size:12px;">ACS Banking System</p>
    `;

    const textContent = `Réinitialisation de mot de passe\n\nBonjour ${user.username},\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur ce lien : ${resetUrl}\n\nCe lien expire dans 1 heure.\n\nACS Banking System`;

    await emailService.sendEmail(user.email, 'Réinitialisation de mot de passe - ACS Banking', htmlContent, textContent);

    await auditService.log(user.id, user.username, user.role, 'FORGOT_PASSWORD', 'users', user.id, null, null, req);

    res.json({ success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la demande de réinitialisation' });
  }
});

// Réinitialisation du mot de passe
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token et nouveau mot de passe requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    const userResult = await db.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND is_active = true',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Token invalide ou expiré' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      'UPDATE users SET password = $1, must_change_password = false, password_changed_at = CURRENT_TIMESTAMP, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, userResult.rows[0].id]
    );

    await auditService.log(userResult.rows[0].id, null, null, 'RESET_PASSWORD', 'users', userResult.rows[0].id, null, null, req);

    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
});

module.exports = router;
