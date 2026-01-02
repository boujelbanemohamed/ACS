/**
 * Middleware global de gestion des erreurs
 * Centralise toutes les erreurs et retourne des réponses standardisées
 */

// Classe d'erreur personnalisée
class AppError extends Error {
  constructor(message, statusCode, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'error';
    this.isOperational = true;
    this.errors = errors;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Erreurs prédéfinies
const createValidationError = (errors) => new AppError('Erreur de validation', 400, errors);
const createNotFoundError = (resource = 'Ressource') => new AppError(`${resource} non trouvé(e)`, 404);
const createUnauthorizedError = (message = 'Non autorisé') => new AppError(message, 401);
const createForbiddenError = (message = 'Accès refusé') => new AppError(message, 403);
const createConflictError = (message = 'Conflit de données') => new AppError(message, 409);

// Middleware de gestion des erreurs
const errorHandler = (err, req, res, next) => {
  // Log de l'erreur
  console.error(`[ERROR] ${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.error(`Message: ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(`Stack: ${err.stack}`);
  }

  // Erreur opérationnelle (prévue)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors || undefined,
      timestamp: new Date().toISOString()
    });
  }

  // Erreur Multer (upload de fichiers)
  if (err.name === 'MulterError') {
    const messages = {
      'LIMIT_FILE_SIZE': 'Fichier trop volumineux (max 10MB)',
      'LIMIT_FILE_COUNT': 'Trop de fichiers',
      'LIMIT_UNEXPECTED_FILE': 'Type de fichier non autorisé'
    };
    return res.status(400).json({
      success: false,
      message: messages[err.code] || 'Erreur de téléchargement',
      timestamp: new Date().toISOString()
    });
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token invalide',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expiré',
      timestamp: new Date().toISOString()
    });
  }

  // Erreur PostgreSQL - Contrainte unique
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'Cette entrée existe déjà',
      timestamp: new Date().toISOString()
    });
  }

  // Erreur PostgreSQL - Clé étrangère
  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Référence invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Erreur de validation Joi
  if (err.name === 'ValidationError' && err.isJoi) {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      errors: err.details.map(d => ({
        field: d.path.join('.'),
        message: d.message
      })),
      timestamp: new Date().toISOString()
    });
  }

  // Erreur de syntaxe JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'JSON invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Erreur inconnue (ne pas exposer les détails en production)
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Erreur serveur interne' 
      : err.message,
    timestamp: new Date().toISOString()
  });
};

// Middleware pour les routes non trouvées
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} non trouvée`,
    timestamp: new Date().toISOString()
  });
};

// Wrapper async pour éviter les try/catch répétitifs
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  createValidationError,
  createNotFoundError,
  createUnauthorizedError,
  createForbiddenError,
  createConflictError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
