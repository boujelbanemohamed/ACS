const jwt = require('jsonwebtoken');
const db = require('../config/database');

const { isPasswordExpired, PASSWORD_EXPIRY_DAYS } = require('../utils/passwordPolicy');

// Seul le flux SSE (EventSource ne permet pas d'en-tête) accepte le jeton en paramètre d'URL
const QUERY_TOKEN_PATHS = ['/api/live/stream'];

// Routes accessibles tant que le mot de passe doit être changé
const PASSWORD_CHANGE_ALLOWED_PATHS = ['/api/auth/change-password', '/api/auth/password-status', '/api/auth/me'];

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
  if (req.query?.token && QUERY_TOKEN_PATHS.includes(pathOnly)) return String(req.query.token);
  return null;
};

const authMiddleware = async (req, res, next) => {
  if (req.user) return next();
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification requis'
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Erreur de configuration serveur'
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Récupérer les infos utilisateur à jour depuis la DB
    const userResult = await db.query(
      'SELECT id, username, email, role, bank_id, is_active, must_change_password, password_changed_at, token_version FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const { must_change_password: mustChangePassword, password_changed_at: passwordChangedAt, token_version: tokenVersion, ...user } = userResult.rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Compte désactivé'
      });
    }

    // Jeton émis avant un changement de mot de passe / une révocation
    if ((decoded.tv || 0) !== (tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Session expirée, veuillez vous reconnecter'
      });
    }

    req.user = user;

    // Changement de mot de passe obligatoire imposé côté serveur
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
    if ((mustChangePassword || isPasswordExpired({ password_changed_at: passwordChangedAt })) &&
      !PASSWORD_CHANGE_ALLOWED_PATHS.includes(pathOnly)) {
      return res.status(403).json({
        success: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Vous devez changer votre mot de passe avant de continuer'
      });
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré'
      });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur d\'authentification'
    });
  }
};

module.exports = { authMiddleware, isPasswordExpired, PASSWORD_EXPIRY_DAYS };
