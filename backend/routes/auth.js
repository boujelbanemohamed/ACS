const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../config/database');
const emailService = require('../services/emailService');

const { authSchemas, validate } = require('../utils/validators');
const auditService = require('../services/auditService');
const { authMiddleware } = require('../middleware/auth');
const { checkPassword, isPasswordExpired, rateLimitDisabled, PASSWORD_EXPIRY_DAYS } = require('../utils/passwordPolicy');
const { signToken } = require('../utils/tokens');

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Hash bcrypt factice : même temps de réponse que l'utilisateur existe ou non
const DUMMY_HASH = '$2a$10$J.DMNLoDI8UBDu4P2Ng3uuPcf976BSamJxOpFIrlzXNlIJ0y8qbFC';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const hashResetToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

// Limites anti force brute (par compte et par adresse pour les demandes de réinitialisation)
const accountLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_ACCOUNT_MAX_FAILURES, 10) || 10,
  skipSuccessfulRequests: true,
  skip: rateLimitDisabled,
  keyGenerator: (req) => `login:${String(req.body?.username || '').toLowerCase()}`,
  validate: { keyGeneratorIpFallback: false },
  message: { success: false, message: 'Trop de tentatives pour ce compte, réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PASSWORD_RESET_RATE_LIMIT_MAX, 10) || 10,
  skip: rateLimitDisabled,
  message: { success: false, message: 'Trop de demandes, réessayez plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// URL publique de l'application : jamais déduite de l'en-tête Host (falsifiable)
const getFrontendUrl = () => {
  const configured = process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0];
  return configured.trim().replace(/\/+$/, '');
};

// Login avec bcrypt
router.post('/login', accountLoginLimiter, validate(authSchemas.login), async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT u.*, b.name as bank_name, b.code as bank_code FROM users u LEFT JOIN banks b ON u.bank_id = b.id WHERE u.username = $1';
    const result = await db.query(query, [username]);

    if (result.rows.length === 0) {
      await bcrypt.compare(password, DUMMY_HASH);
      await auditService.log(null, username, null, 'LOGIN_FAILED', 'users', null, null, { reason: 'user_not_found' }, req);
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await auditService.log(user.id, user.username, user.role, 'LOGIN_FAILED', 'users', user.id, null, { reason: 'wrong_password' }, req);
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides'
      });
    }

    // Vérifié après le mot de passe : ne révèle pas l'existence d'un compte à un tiers
    if (user.is_active === false) {
      await auditService.log(user.id, user.username, user.role, 'LOGIN_FAILED', 'users', user.id, null, { reason: 'account_disabled' }, req);
      return res.status(401).json({
        success: false,
        message: 'Compte desactive. Contactez l\'administrateur.'
      });
    }

    await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    await auditService.log(user.id, user.username, user.role, 'LOGIN_SUCCESS', 'users', user.id, null, null, { user: { id: user.id, username: user.username, role: user.role, bank_id: user.bank_id }, ip: req.ip, connection: req.connection });

    const passwordExpired = isPasswordExpired(user);
    const token = signToken(user);

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
        must_change_password: user.must_change_password || passwordExpired || false,
        password_expired: passwordExpired
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la connexion'
    });
  }
});

// Utilisateur courant
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.email, u.role, u.bank_id, b.name as bank_name, b.code as bank_code
       FROM users u LEFT JOIN banks b ON u.bank_id = b.id WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Changement de mot de passe (utilisateur connecté)
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Mot de passe actuel et nouveau mot de passe requis' });
    }

    const policyError = checkPassword(newPassword);
    if (policyError) {
      return res.status(400).json({ success: false, message: policyError });
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

    // token_version incrémenté : toutes les autres sessions sont révoquées
    const updated = await db.query(
      `UPDATE users SET password = $1, must_change_password = false, password_changed_at = CURRENT_TIMESTAMP,
         token_version = COALESCE(token_version, 0) + 1
       WHERE id = $2
       RETURNING id, username, email, role, bank_id, must_change_password, token_version`,
      [hashedPassword, req.user.id]
    );

    await auditService.log(req.user.id, req.user.username, req.user.role, 'CHANGE_PASSWORD_SUCCESS', 'users', req.user.id, null, null, req);

    const refreshed = updated.rows && updated.rows[0];
    res.json({
      success: true,
      message: 'Mot de passe changé avec succès',
      data: refreshed ? { token: signToken(refreshed) } : undefined
    });
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
    res.json({
      success: true,
      data: {
        must_change_password: user.must_change_password || false,
        password_expired: isPasswordExpired(user),
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
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  const genericResponse = { success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' };
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Email requis' });
    }

    const userResult = await db.query('SELECT id, username, email, role FROM users WHERE email = $1 AND is_active = true', [email]);

    if (userResult.rows.length === 0) {
      return res.json(genericResponse);
    }

    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    // Seule l'empreinte du jeton est stockée
    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [hashResetToken(resetToken), expiresAt, user.id]
    );

    const resetUrl = `${getFrontendUrl()}/reset-password?token=${resetToken}`;
    const safeUsername = escapeHtml(user.username);

    const htmlContent = `
      <h2>Réinitialisation de mot de passe</h2>
      <p>Bonjour ${safeUsername},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      <p>Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :</p>
      <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Réinitialiser mon mot de passe</a></p>
      <p>Ce lien expire dans 1 heure.</p>
      <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
      <hr>
      <p style="color:#666;font-size:12px;">ACS Banking System</p>
    `;

    const textContent = `Réinitialisation de mot de passe\n\nBonjour ${user.username},\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur ce lien : ${resetUrl}\n\nCe lien expire dans 1 heure.\n\nACS Banking System`;

    await emailService.sendEmail(user.email, 'Réinitialisation de mot de passe - ACS Banking', htmlContent, textContent);

    await auditService.log(user.id, user.username, user.role, 'FORGOT_PASSWORD', 'users', user.id, null, null, req);

    res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la demande de réinitialisation' });
  }
});

// Réinitialisation du mot de passe
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Token et nouveau mot de passe requis' });
    }

    const policyError = checkPassword(password);
    if (policyError) {
      return res.status(400).json({ success: false, message: policyError });
    }

    const userResult = await db.query(
      'SELECT id, username, role FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND is_active = true',
      [hashResetToken(token)]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Token invalide ou expiré' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = userResult.rows[0];

    await db.query(
      `UPDATE users SET password = $1, must_change_password = false, password_changed_at = CURRENT_TIMESTAMP,
         reset_token = NULL, reset_token_expires = NULL, token_version = COALESCE(token_version, 0) + 1
       WHERE id = $2`,
      [hashedPassword, user.id]
    );

    await auditService.log(user.id, user.username || null, user.role || null, 'RESET_PASSWORD', 'users', user.id, null, null, req);

    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la réinitialisation du mot de passe' });
  }
});

module.exports = router;
