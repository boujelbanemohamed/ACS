/**
 * Schémas de validation Joi pour toutes les entrées API
 */
const Joi = require('joi');

// Schémas pour l'authentification
const authSchemas = {
  login: Joi.object({
    username: Joi.string().min(3).max(50).required()
      .messages({
        'string.empty': 'Le nom d\'utilisateur est requis',
        'string.min': 'Le nom d\'utilisateur doit avoir au moins 3 caractères'
      }),
    password: Joi.string().min(4).max(100).required()
      .messages({
        'string.empty': 'Le mot de passe est requis',
        'string.min': 'Le mot de passe doit avoir au moins 4 caractères'
      })
  })
};

// Schémas pour les banques
const bankSchemas = {
  create: Joi.object({
    code: Joi.string().uppercase().min(2).max(10).required()
      .messages({
        'string.empty': 'Le code banque est requis',
        'string.max': 'Le code ne doit pas dépasser 10 caractères'
      }),
    name: Joi.string().min(2).max(255).required()
      .messages({
        'string.empty': 'Le nom de la banque est requis'
      }),
    source_url: Joi.string().max(500).required(),
    destination_url: Joi.string().max(500).required(),
    old_url: Joi.string().max(500).required(),
    xml_output_url: Joi.string().max(500).required(),
    enrollment_report_url: Joi.string().max(500).allow(null, ''),
    is_active: Joi.boolean().default(true)
  }),
  
  update: Joi.object({
    code: Joi.string().uppercase().min(2).max(10),
    name: Joi.string().min(2).max(255),
    source_url: Joi.string().max(500),
    destination_url: Joi.string().max(500),
    old_url: Joi.string().max(500),
    xml_output_url: Joi.string().max(500),
    enrollment_report_url: Joi.string().max(500).allow(null, ''),
    is_active: Joi.boolean()
  })
};

// Schémas pour les utilisateurs
const userSchemas = {
  create: Joi.object({
    username: Joi.string().min(3).max(100).required()
      .messages({
        'string.empty': 'Le nom d\'utilisateur est requis'
      }),
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Email invalide'
      }),
    password: Joi.string().min(6).max(100).required()
      .messages({
        'string.min': 'Le mot de passe doit avoir au moins 6 caractères'
      }),
    role: Joi.string().valid('super_admin', 'bank').default('bank'),
    bankId: Joi.number().integer().allow(null),
    phone: Joi.string().max(20).allow(null, '')
  }),
  
  update: Joi.object({
    username: Joi.string().min(3).max(100),
    email: Joi.string().email(),
    password: Joi.string().min(6).max(100).allow(null, ''),
    role: Joi.string().valid('super_admin', 'bank'),
    bankId: Joi.number().integer().allow(null),
    phone: Joi.string().max(20).allow(null, ''),
    isActive: Joi.boolean()
  })
};

// Schémas pour le traitement
const processingSchemas = {
  processUrl: Joi.object({
    bankId: Joi.number().integer().required()
      .messages({
        'any.required': 'L\'ID de la banque est requis'
      }),
    baseUrl: Joi.string().uri().required()
      .messages({
        'string.uri': 'URL invalide'
      })
  }),
  
  manualEntry: Joi.object({
    bankId: Joi.number().integer().required(),
    entries: Joi.array().items(
      Joi.object({
        language: Joi.string().valid('fr', 'en', 'ar').default('fr'),
        firstName: Joi.string().min(2).max(255).required(),
        lastName: Joi.string().min(2).max(255).required(),
        pan: Joi.string().pattern(/^\d{16}$/).required()
          .messages({
            'string.pattern.base': 'Le PAN doit contenir exactement 16 chiffres'
          }),
        expiry: Joi.string().pattern(/^\d{6}$/).required()
          .messages({
            'string.pattern.base': 'Format expiry invalide (YYYYMM)'
          }),
        phone: Joi.string().pattern(/^216\d{8}$/).required()
          .messages({
            'string.pattern.base': 'Format téléphone invalide (216XXXXXXXX)'
          }),
        behaviour: Joi.string().valid('otp', 'sms', 'email').default('otp'),
        action: Joi.string().valid('update', 'create', 'delete').default('update')
      })
    ).min(1).required()
  })
};

// Schémas pour les notifications
const notificationSchemas = {
  smtp: Joi.object({
    host: Joi.string().max(255).required(),
    port: Joi.number().integer().min(1).max(65535).default(587),
    secure: Joi.boolean().default(false),
    username: Joi.string().max(255).allow(null, ''),
    password: Joi.string().max(255).allow(null, ''),
    from_email: Joi.string().email().required(),
    from_name: Joi.string().max(255).default('ACS Banking System'),
    enabled: Joi.boolean().default(false)
  }),
  
  email: Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Email invalide'
      })
  }),
  
  cronConfig: Joi.object({
    schedule: Joi.string().pattern(/^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/)
      .messages({
        'string.pattern.base': 'Format cron invalide'
      }),
    enabled: Joi.boolean()
  })
};

// Schémas pour les API Keys
const apiKeySchemas = {
  create: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    institution: Joi.string().max(255).allow(null, ''),
    bankId: Joi.number().integer().allow(null),
    permissions: Joi.array().items(Joi.string().valid('read', 'write')).default(['read', 'write']),
    rateLimit: Joi.number().integer().min(1).max(10000).default(100),
    expiresAt: Joi.date().iso().allow(null)
  }),
  
  update: Joi.object({
    name: Joi.string().min(2).max(255),
    institution: Joi.string().max(255).allow(null, ''),
    bankId: Joi.number().integer().allow(null),
    permissions: Joi.array().items(Joi.string().valid('read', 'write')),
    rateLimit: Joi.number().integer().min(1).max(10000),
    expiresAt: Joi.date().iso().allow(null),
    isActive: Joi.boolean()
  })
};

// Middleware de validation
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors,
        timestamp: new Date().toISOString()
      });
    }
    
    req.body = value;
    next();
  };
};

// Validation des paramètres d'URL
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false
    });
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres invalides',
        errors: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message.replace(/"/g, '')
        })),
        timestamp: new Date().toISOString()
      });
    }
    
    req.params = value;
    next();
  };
};

// Schéma commun pour les IDs
const idSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

module.exports = {
  authSchemas,
  bankSchemas,
  userSchemas,
  processingSchemas,
  notificationSchemas,
  apiKeySchemas,
  validate,
  validateParams,
  idSchema
};
