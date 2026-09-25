const db = require('../config/database');
const roleFeaturesService = require('../services/roleFeaturesService');

const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé pour ce rôle'
      });
    }

    next();
  };
};

const checkBankAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Non authentifié'
    });
  }

  if (req.user.role === 'super_admin') {
    return next();
  }

  const requestedBankId = req.params.bankId || req.body.bank_id || req.query.bank_id;
  
  if (requestedBankId && req.user.bank_id !== parseInt(requestedBankId)) {
    return res.status(403).json({
      success: false,
      message: 'Accès non autorisé à cette banque'
    });
  }

  next();
};

const isSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Non authentifié'
    });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Accès réservé aux super administrateurs'
    });
  }

  next();
};

const filterByBank = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Non authentifié'
    });
  }

  if (req.user.role === 'super_admin') {
    return next();
  }

  // Tout utilisateur non super_admin est limité à sa banque (-1 = aucune banque => aucun résultat)
  const bankId = req.user.bank_id ? req.user.bank_id : -1;
  req.query.bankId = bankId;
  req.bankFilter = bankId;

  next();
};

const forceBankId = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Non authentifié'
    });
  }

  if (req.user.role !== 'super_admin') {
    if (!req.user.bank_id) {
      return res.status(403).json({
        success: false,
        message: 'Aucune banque associée à votre compte'
      });
    }
    if (req.body) req.body.bankId = req.user.bank_id;
  }

  next();
};

const checkFeature = (featureName) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false, message: 'Non authentifié'
      });
    }
    if (req.user.role === 'super_admin') {
      return next();
    }
    try {
      const features = await roleFeaturesService.getEffectiveFeatures(
        req.user.id, req.user.role, req.user.bank_id
      );
      if (!features[featureName]) {
        return res.status(403).json({
          success: false, message: 'Accès refusé : fonctionnalité non autorisée'
        });
      }
      next();
    } catch (error) {
      console.error('checkFeature error:', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la vérification des droits' });
    }
  };
};

const isSuperAdminOrBankAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Non authentifié'
    });
  }

  if (req.user.role === 'super_admin' || req.user.role === 'bank_admin') {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Accès réservé aux administrateurs'
  });
};

module.exports = {
  checkRole,
  checkBankAccess,
  isSuperAdmin,
  isSuperAdminOrBankAdmin,
  filterByBank,
  forceBankId,
  checkFeature
};
