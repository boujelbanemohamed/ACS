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

  if (req.user.role === 'bank' && req.user.bank_id) {
    req.query.bank_id = req.user.bank_id;
    req.bankFilter = req.user.bank_id;
  }

  next();
};

module.exports = {
  checkRole,
  checkBankAccess,
  isSuperAdmin,
  filterByBank
};
