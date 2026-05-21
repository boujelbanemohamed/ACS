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

  if ((req.user.role === 'bank' || req.user.role === 'bank_admin') && req.user.bank_id) {
    req.query.bankId = req.user.bank_id;
    req.bankFilter = req.user.bank_id;
  }

  next();
};

const forceBankId = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Non authentifié'
    });
  }

  if ((req.user.role === 'bank' || req.user.role === 'bank_admin') && req.user.bank_id) {
    req.body.bankId = req.user.bank_id;
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
      res.status(500).json({ success: false, message: error.message });
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
