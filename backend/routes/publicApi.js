const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { commitValidRecords } = require('../services/pipelineService');
const { validateCards } = require('../utils/cardValidation');
const { maskPan } = require('../services/encryptionService');
const { redactBankUrls } = require('../utils/bankScope');

const auditService = require('../services/auditService');

const router = express.Router();

const MAX_CARDS_PER_REQUEST = parseInt(process.env.PUBLIC_API_MAX_CARDS, 10) || 1000;
const PAN_KEYS = ['pan', 'cardNumber', 'card_number'];

const hashApiKey = (apiKey) => crypto.createHash('sha256').update(apiKey).digest('hex');

// Copie d'un objet où tous les numéros de carte sont masqués (journalisation)
const maskCardData = (data) => {
  if (Array.isArray(data)) return data.map(maskCardData);
  if (data && typeof data === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(data)) {
      out[key] = PAN_KEYS.includes(key) && (typeof value === 'string' || typeof value === 'number')
        ? maskPan(String(value))
        : maskCardData(value);
    }
    return out;
  }
  return data;
};

const hasPermission = (apiKey, permission) => {
  const permissions = Array.isArray(apiKey.permissions) ? apiKey.permissions : ['read', 'write'];
  return permissions.includes(permission);
};

// Middleware d'authentification API
const apiAuthMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API_KEY_REQUIRED',
      message: 'Cle API requise. Utilisez le header X-API-Key ou Authorization: Bearer <key>'
    });
  }

  try {
    // La clé n'est jamais stockée en clair : recherche par empreinte SHA-256
    const result = await db.query(
      'SELECT ak.*, b.code as bank_code FROM api_keys ak LEFT JOIN banks b ON ak.bank_id = b.id WHERE ak.key_hash = $1 AND ak.is_active = true',
      [hashApiKey(String(apiKey))]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_API_KEY',
        message: 'Cle API invalide ou inactive'
      });
    }

    const keyData = result.rows[0];

    // Vérifier expiration
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'API_KEY_EXPIRED',
        message: 'Cle API expiree'
      });
    }

    // Mettre à jour last_used_at
    await db.query('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [keyData.id]);

    delete keyData.api_key;
    delete keyData.key_hash;
    req.apiKey = keyData;
    next();
  } catch (error) {
    console.error('API Auth error:', error);
    res.status(500).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Erreur d\'authentification'
    });
  }
};

// Rate limiter par clé API, partagé entre toutes les instances (compteur en base, fenêtre d'une minute)
const apiRateLimiter = async (req, res, next) => {
  if (!req.apiKey) {
    return next();
  }

  try {
    const maxRequests = req.apiKey.rate_limit || 100;
    const result = await db.query(
      `INSERT INTO api_rate_limits (api_key_id, window_start, request_count)
       VALUES ($1, date_trunc('minute', NOW()), 1)
       ON CONFLICT (api_key_id, window_start) DO UPDATE SET request_count = api_rate_limits.request_count + 1
       RETURNING request_count`,
      [req.apiKey.id]
    );
    const count = parseInt(result.rows[0].request_count, 10);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(maxRequests - count, 0));

    if (count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Limite de requêtes dépassée pour cette clé API'
      });
    }

    // Nettoyage occasionnel des fenêtres expirées
    if (Math.random() < 0.01) {
      db.query("DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '1 hour'").catch(() => {});
    }

    next();
  } catch (error) {
    console.error('API rate limit error:', error);
    res.status(500).json({ success: false, error: 'SERVER_ERROR', message: 'Erreur serveur' });
  }
};

const requirePermission = (permission) => (req, res, next) => {
  if (!hasPermission(req.apiKey, permission)) {
    return res.status(403).json({
      success: false,
      error: 'PERMISSION_DENIED',
      message: `Permission "${permission}" requise pour cette cle API`
    });
  }
  next();
};

// Logger les appels API (sans numéro de carte en clair)
const logApiCall = async (req, res, startTime, responseBody) => {
  try {
    const processingTime = Date.now() - startTime;
    await db.query(
      'INSERT INTO api_logs (api_key_id, endpoint, method, request_body, response_status, response_body, ip_address, user_agent, processing_time_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        req.apiKey?.id,
        req.originalUrl,
        req.method,
        JSON.stringify(maskCardData(req.body) || {}).substring(0, 10000),
        res.statusCode,
        JSON.stringify(maskCardData(responseBody)).substring(0, 10000),
        req.ip || req.connection?.remoteAddress,
        req.headers['user-agent'],
        processingTime
      ]
    );
  } catch (error) {
    console.error('API Log error:', error);
  }
};

const send = async (req, res, startTime, status, response) => {
  res.status(status);
  await logApiCall(req, res, startTime, response);
  return res.json(response);
};

// Recherche la banque demandée en respectant la banque liée à la clé API
async function resolveBank(req, bankCode, columns = 'id, code') {
  const bankResult = await db.query(`SELECT ${columns} FROM banks WHERE code = $1 AND is_active = true`, [bankCode]);
  if (bankResult.rows.length === 0) {
    return { status: 404, response: { success: false, error: 'BANK_NOT_FOUND', message: 'Banque non trouvee: ' + bankCode } };
  }
  const bank = bankResult.rows[0];
  if (req.apiKey.bank_id && Number(req.apiKey.bank_id) !== Number(bank.id)) {
    return { status: 403, response: { success: false, error: 'BANK_FORBIDDEN', message: 'Cette cle API n\'est pas autorisee pour cette banque' } };
  }
  return { bank };
}

const validateRequestBody = (bankCode, cards) => {
  if (!bankCode || typeof bankCode !== 'string' || !Array.isArray(cards) || cards.length === 0) {
    return 'bankCode et cards (array non vide) sont requis';
  }
  if (cards.length > MAX_CARDS_PER_REQUEST) {
    return `Maximum ${MAX_CARDS_PER_REQUEST} cartes par requete`;
  }
  return null;
};

// GET /api/v1/banks - Liste des banques
router.get('/banks', apiAuthMiddleware, apiRateLimiter, requirePermission('read'), async (req, res) => {
  const startTime = Date.now();
  try {
    const result = req.apiKey.bank_id
      ? await db.query('SELECT id, name, code FROM banks WHERE is_active = true AND id = $1 ORDER BY name', [req.apiKey.bank_id])
      : await db.query('SELECT id, name, code FROM banks WHERE is_active = true ORDER BY name');
    return send(req, res, startTime, 200, { success: true, data: result.rows });
  } catch (error) {
    console.error('Public API banks error:', error);
    return send(req, res, startTime, 500, { success: false, error: 'SERVER_ERROR', message: 'Erreur serveur' });
  }
});

// POST /api/v1/cards/validate - Valider des cartes sans enregistrer
router.post('/cards/validate', apiAuthMiddleware, apiRateLimiter, requirePermission('read'), async (req, res) => {
  const startTime = Date.now();
  try {
    const { bankCode, cards } = req.body;

    const invalidRequest = validateRequestBody(bankCode, cards);
    if (invalidRequest) {
      return send(req, res, startTime, 400, { success: false, error: 'INVALID_REQUEST', message: invalidRequest });
    }

    const resolved = await resolveBank(req, bankCode);
    if (!resolved.bank) return send(req, res, startTime, resolved.status, resolved.response);

    const { valid, invalid } = validateCards(cards);

    return send(req, res, startTime, 200, {
      success: true,
      data: {
        totalReceived: cards.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        validCards: valid.map(v => ({ ...v.card, warnings: v.warnings.length > 0 ? v.warnings : undefined })),
        invalidCards: invalid.map(item => ({ index: item.index, errors: item.errors }))
      }
    });
  } catch (error) {
    console.error('Validate error:', error);
    return send(req, res, startTime, 500, { success: false, error: 'SERVER_ERROR', message: 'Erreur serveur' });
  }
});

// POST /api/v1/cards/register - Enregistrer des cartes
router.post('/cards/register', apiAuthMiddleware, apiRateLimiter, requirePermission('write'), async (req, res) => {
  const startTime = Date.now();
  let fileLogId = null;
  try {
    const { bankCode, cards, generateXml = true } = req.body;

    const invalidRequest = validateRequestBody(bankCode, cards);
    if (invalidRequest) {
      return send(req, res, startTime, 400, { success: false, error: 'INVALID_REQUEST', message: invalidRequest });
    }

    const resolved = await resolveBank(req, bankCode, '*');
    if (!resolved.bank) return send(req, res, startTime, resolved.status, resolved.response);
    const bank = resolved.bank;

    // Même validation que les autres sources (Luhn, format, valeurs autorisées)
    const { valid, invalid } = validateCards(cards);
    const validCards = valid.map(v => v.card);
    const invalidCards = invalid.map(item => ({ index: item.index, errors: item.errors }));

    if (validCards.length === 0) {
      return send(req, res, startTime, 400, {
        success: false,
        error: 'NO_VALID_CARDS',
        message: 'Aucune carte valide',
        data: { invalidCards }
      });
    }

    // Créer file_log
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = 'API_' + bank.code + '_' + timestamp + '_' + crypto.randomBytes(3).toString('hex') + '.csv';

    const fileLogResult = await db.query(
      'INSERT INTO file_logs (bank_id, file_name, original_path, status, source_type, total_rows, valid_rows, invalid_rows) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [bank.id, fileName, 'API', 'processing', 'api', cards.length, validCards.length, invalidCards.length]
    );
    fileLogId = fileLogResult.rows[0].id;

    // Enregistrement + XML atomiques
    const { xmlResult } = await commitValidRecords({
      bank,
      fileLogId,
      fileName,
      rows: validCards,
      generateXml: generateXml !== false
    });

    await auditService.log(null, req.apiKey?.name || 'API', 'api', 'PUBLIC_API_REGISTER', 'file_logs', fileLogId, null, { bankCode: bank.code, cardsCount: validCards.length }, req, bank.id);

    return send(req, res, startTime, 200, {
      success: true,
      message: validCards.length + ' carte(s) enregistree(s) avec succes',
      data: {
        fileLogId,
        fileName,
        xmlFileName: xmlResult ? xmlResult.fileName : null,
        totalReceived: cards.length,
        registered: validCards.length,
        rejected: invalidCards.length,
        xmlEntriesGenerated: xmlResult ? xmlResult.xmlEntriesCount : 0,
        invalidCards: invalidCards.length > 0 ? invalidCards : undefined
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return send(req, res, startTime, 500, { success: false, error: 'SERVER_ERROR', message: 'Erreur lors de l\'enregistrement', fileLogId: fileLogId || undefined });
  }
});

// GET /api/v1/status/:fileLogId - Statut d'un traitement
router.get('/status/:fileLogId', apiAuthMiddleware, apiRateLimiter, requirePermission('read'), async (req, res) => {
  const startTime = Date.now();
  try {
    const fileLogId = parseInt(req.params.fileLogId, 10);
    if (Number.isNaN(fileLogId)) {
      return send(req, res, startTime, 400, { success: false, error: 'INVALID_REQUEST', message: 'Identifiant invalide' });
    }

    const result = await db.query(
      `SELECT fl.*, b.name as bank_name, b.code as bank_code,
        xl.xml_file_name, xl.status as xml_status, xl.xml_entries_count
       FROM file_logs fl
       JOIN banks b ON fl.bank_id = b.id
       LEFT JOIN xml_logs xl ON xl.file_log_id = fl.id
       WHERE fl.id = $1`,
      [fileLogId]
    );

    // Un traitement d'une autre banque est présenté comme inexistant
    if (result.rows.length === 0 ||
      (req.apiKey.bank_id && Number(req.apiKey.bank_id) !== Number(result.rows[0].bank_id))) {
      return send(req, res, startTime, 404, { success: false, error: 'NOT_FOUND', message: 'Traitement non trouve' });
    }

    const { original_path, file_hash, ...row } = redactBankUrls(result.rows[0]);
    return send(req, res, startTime, 200, { success: true, data: row });
  } catch (error) {
    console.error('Public API status error:', error);
    return send(req, res, startTime, 500, { success: false, error: 'SERVER_ERROR', message: 'Erreur serveur' });
  }
});

// GET /api/v1/docs - Documentation API
router.get('/docs', (req, res) => {
  res.json({
    name: 'ACS Banking CSV Processor API',
    version: '1.0.0',
    baseUrl: '/api/v1',
    authentication: {
      type: 'API Key',
      header: 'X-API-Key ou Authorization: Bearer <key>'
    },
    endpoints: [
      {
        method: 'GET',
        path: '/banks',
        description: 'Liste des banques disponibles (permission read)'
      },
      {
        method: 'POST',
        path: '/cards/validate',
        description: 'Valider des cartes sans les enregistrer (permission read)',
        body: {
          bankCode: 'string (code de la banque)',
          cards: `array of card objects (max ${MAX_CARDS_PER_REQUEST})`
        }
      },
      {
        method: 'POST',
        path: '/cards/register',
        description: 'Enregistrer des cartes et generer XML (permission write)',
        body: {
          bankCode: 'string',
          cards: `array (max ${MAX_CARDS_PER_REQUEST})`,
          generateXml: 'boolean (default: true)'
        }
      },
      {
        method: 'GET',
        path: '/status/:fileLogId',
        description: 'Statut d\'un traitement (permission read)'
      }
    ],
    cardObject: {
      pan: 'string (13-19 chiffres, cle de Luhn verifiee) - requis',
      phone: 'string (avec indicatif +216...) - requis',
      expiry: 'string (MM/YY, non expiree) - requis',
      firstName: 'string (max 255)',
      lastName: 'string (max 255)',
      language: 'string fr|en|ar (default: fr)',
      behaviour: 'string otp|sms|email (default: otp)',
      action: 'string update|create|delete (default: update)'
    }
  });
});

module.exports = router;
module.exports.maskCardData = maskCardData;
