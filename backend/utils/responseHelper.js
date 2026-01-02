/**
 * Helper pour standardiser toutes les réponses API
 */

const sendSuccess = (res, data = null, message = 'Opération réussie', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

const sendError = (res, message = 'Une erreur est survenue', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return res.status(statusCode).json(response);
};

const sendValidationError = (res, errors) => {
  return res.status(400).json({
    success: false,
    message: 'Erreur de validation',
    errors: Array.isArray(errors) ? errors : [errors],
    timestamp: new Date().toISOString()
  });
};

const sendNotFound = (res, resource = 'Ressource') => {
  return res.status(404).json({
    success: false,
    message: `${resource} non trouvé(e)`,
    timestamp: new Date().toISOString()
  });
};

const sendUnauthorized = (res, message = 'Non autorisé') => {
  return res.status(401).json({
    success: false,
    message,
    timestamp: new Date().toISOString()
  });
};

const sendForbidden = (res, message = 'Accès refusé') => {
  return res.status(403).json({
    success: false,
    message,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden
};
