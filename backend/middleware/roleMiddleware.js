const db = require('../config/database');

// Middleware pour vérifier le rôle
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Non authentifie' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Acces refuse. Role requis: ' + allowedRoles.join(' ou ')
      });
    }

    next();
  };
};

// Middleware pour filtrer par banque (pour les utilisateurs de type "bank")
const filterByBank = async (req, res, next) => {
  if (req.user.role === 'super_admin') {
    // Super admin voit tout
    req.bankFilter = null;
    next();
  } else if (req.user.role === 'bank') {
    // Utilisateur banque ne voit que sa banque
    if (!req.user.bank_id) {
      return res.status(403).json({
        success: false,
        message: 'Aucune banque associee a votre compte'
      });
    }
    req.bankFilter = req.user.bank_id;
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Role non reconnu' });
  }
};

// Middleware pour vérifier l'accès à une banque spécifique
const checkBankAccess = async (req, res, next) => {
  const bankId = req.params.bankId || req.body.bankId || req.query.bankId;
  
  if (req.user.role === 'super_admin') {
    next();
  } else if (req.user.role === 'bank') {
    if (parseInt(bankId) !== req.user.bank_id) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas acces a cette banque'
      });
    }
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Acces refuse' });
  }
};

// Logger les actions dans audit_logs
const auditLog = async (userId, action, entityType, entityId, oldValues, newValues, req) => {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req?.ip || req?.connection?.remoteAddress,
        req?.headers?.['user-agent']
      ]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

module.exports = { checkRole, filterByBank, checkBankAccess, auditLog };
