const express = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const csvProcessor = require('../services/csvProcessor');

const router = express.Router();

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
    const result = await db.query(
      'SELECT ak.*, b.code as bank_code FROM api_keys ak LEFT JOIN banks b ON ak.bank_id = b.id WHERE ak.api_key = $1 AND ak.is_active = true',
      [apiKey]
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

// Logger les appels API
const logApiCall = async (req, res, startTime, responseBody) => {
  try {
    const processingTime = Date.now() - startTime;
    await db.query(
      'INSERT INTO api_logs (api_key_id, endpoint, method, request_body, response_status, response_body, ip_address, user_agent, processing_time_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        req.apiKey?.id,
        req.originalUrl,
        req.method,
        JSON.stringify(req.body).substring(0, 10000),
        res.statusCode,
        JSON.stringify(responseBody).substring(0, 10000),
        req.ip || req.connection?.remoteAddress,
        req.headers['user-agent'],
        processingTime
      ]
    );
  } catch (error) {
    console.error('API Log error:', error);
  }
};

// GET /api/v1/banks - Liste des banques
router.get('/banks', apiAuthMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const result = await db.query('SELECT id, name, code FROM banks WHERE is_active = true ORDER BY name');
    const response = {
      success: true,
      data: result.rows
    };
    await logApiCall(req, res, startTime, response);
    res.json(response);
  } catch (error) {
    const response = { success: false, error: 'SERVER_ERROR', message: error.message };
    await logApiCall(req, res, startTime, response);
    res.status(500).json(response);
  }
});

// POST /api/v1/cards/validate - Valider des cartes sans enregistrer
router.post('/cards/validate', apiAuthMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const { bankCode, cards } = req.body;

    if (!bankCode || !cards || !Array.isArray(cards)) {
      const response = {
        success: false,
        error: 'INVALID_REQUEST',
        message: 'bankCode et cards (array) sont requis'
      };
      await logApiCall(req, res, startTime, response);
      return res.status(400).json(response);
    }

    // Trouver la banque
    const bankResult = await db.query('SELECT id, code FROM banks WHERE code = $1 AND is_active = true', [bankCode]);
    if (bankResult.rows.length === 0) {
      const response = {
        success: false,
        error: 'BANK_NOT_FOUND',
        message: 'Banque non trouvee: ' + bankCode
      };
      await logApiCall(req, res, startTime, response);
      return res.status(404).json(response);
    }

    // Valider les cartes
    const validCards = [];
    const invalidCards = [];

    cards.forEach((card, index) => {
      const errors = [];
      
      // Validation PAN
      if (!card.pan || card.pan.length < 13 || card.pan.length > 19 || !/^\d+$/.test(card.pan)) {
        errors.push({ field: 'pan', message: 'PAN invalide (13-19 chiffres requis)' });
      }
      
      // Validation telephone
      if (!card.phone) {
        errors.push({ field: 'phone', message: 'Telephone requis' });
      }
      
      // Validation expiry
      if (!card.expiry || !/^\d{2}\/\d{2}$/.test(card.expiry)) {
        errors.push({ field: 'expiry', message: 'Format expiry invalide (MM/YY)' });
      }

      if (errors.length > 0) {
        invalidCards.push({ index, card, errors });
      } else {
        validCards.push({
          language: card.language || 'fr',
          firstName: card.firstName || card.first_name || '',
          lastName: card.lastName || card.last_name || '',
          pan: card.pan,
          expiry: card.expiry,
          phone: card.phone,
          behaviour: card.behaviour || 'otp',
          action: card.action || 'update'
        });
      }
    });

    const response = {
      success: true,
      data: {
        totalReceived: cards.length,
        validCount: validCards.length,
        invalidCount: invalidCards.length,
        validCards,
        invalidCards
      }
    };
    await logApiCall(req, res, startTime, response);
    res.json(response);
  } catch (error) {
    console.error('Validate error:', error);
    const response = { success: false, error: 'SERVER_ERROR', message: error.message };
    await logApiCall(req, res, startTime, response);
    res.status(500).json(response);
  }
});

// POST /api/v1/cards/register - Enregistrer des cartes
router.post('/cards/register', apiAuthMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const { bankCode, cards, generateXml = true } = req.body;

    if (!bankCode || !cards || !Array.isArray(cards) || cards.length === 0) {
      const response = {
        success: false,
        error: 'INVALID_REQUEST',
        message: 'bankCode et cards (array non vide) sont requis'
      };
      await logApiCall(req, res, startTime, response);
      return res.status(400).json(response);
    }

    // Trouver la banque
    const bankResult = await db.query('SELECT * FROM banks WHERE code = $1 AND is_active = true', [bankCode]);
    if (bankResult.rows.length === 0) {
      const response = {
        success: false,
        error: 'BANK_NOT_FOUND',
        message: 'Banque non trouvee: ' + bankCode
      };
      await logApiCall(req, res, startTime, response);
      return res.status(404).json(response);
    }

    const bank = bankResult.rows[0];

    // Valider et mapper les cartes
    const validCards = [];
    const invalidCards = [];

    cards.forEach((card, index) => {
      const errors = [];
      
      if (!card.pan || card.pan.length < 13 || card.pan.length > 19 || !/^\d+$/.test(card.pan)) {
        errors.push({ field: 'pan', message: 'PAN invalide' });
      }
      if (!card.phone) {
        errors.push({ field: 'phone', message: 'Telephone requis' });
      }
      if (!card.expiry || !/^\d{2}\/\d{2}$/.test(card.expiry)) {
        errors.push({ field: 'expiry', message: 'Format expiry invalide (MM/YY)' });
      }

      if (errors.length > 0) {
        invalidCards.push({ index, errors });
      } else {
        validCards.push({
          language: card.language || 'fr',
          firstName: card.firstName || card.first_name || '',
          lastName: card.lastName || card.last_name || '',
          pan: card.pan,
          expiry: card.expiry,
          phone: card.phone.startsWith('+') ? card.phone : '+' + card.phone,
          behaviour: card.behaviour || 'otp',
          action: card.action || 'update'
        });
      }
    });

    if (validCards.length === 0) {
      const response = {
        success: false,
        error: 'NO_VALID_CARDS',
        message: 'Aucune carte valide',
        data: { invalidCards }
      };
      await logApiCall(req, res, startTime, response);
      return res.status(400).json(response);
    }

    // Créer file_log
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = 'API_' + bankCode + '_' + timestamp + '.csv';
    
    const fileLogResult = await db.query(
      'INSERT INTO file_logs (bank_id, file_name, original_path, status, source_type, total_rows, valid_rows, invalid_rows) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [bank.id, fileName, 'API', 'success', 'api', cards.length, validCards.length, invalidCards.length]
    );
    const fileLogId = fileLogResult.rows[0].id;

    // Sauvegarder les enregistrements
    await csvProcessor.saveValidatedRecords(bank.id, validCards, fileName);

    let xmlFileName = null;
    let xmlEntriesCount = 0;

    // Générer XML si demandé
    if (generateXml) {
      xmlFileName = 'ACS_CARDS_' + bankCode + '_' + timestamp + '.xml';
      xmlEntriesCount = validCards.length * 2;

      await db.query(
        'INSERT INTO xml_logs (bank_id, file_log_id, xml_file_name, xml_file_path, records_count, xml_entries_count, status, processed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)',
        [bank.id, fileLogId, xmlFileName, bank.xml_output_url || '/data/xml', validCards.length, xmlEntriesCount, 'success']
      );
    }

    const response = {
      success: true,
      message: validCards.length + ' carte(s) enregistree(s) avec succes',
      data: {
        fileLogId,
        fileName,
        xmlFileName,
        totalReceived: cards.length,
        registered: validCards.length,
        rejected: invalidCards.length,
        xmlEntriesGenerated: xmlEntriesCount,
        invalidCards: invalidCards.length > 0 ? invalidCards : undefined
      }
    };
    await logApiCall(req, res, startTime, response);
    res.json(response);
  } catch (error) {
    console.error('Register error:', error);
    const response = { success: false, error: 'SERVER_ERROR', message: error.message };
    await logApiCall(req, res, startTime, response);
    res.status(500).json(response);
  }
});

// GET /api/v1/status/:fileLogId - Statut d'un traitement
router.get('/status/:fileLogId', apiAuthMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const result = await db.query(
      `SELECT fl.*, b.name as bank_name, b.code as bank_code,
        xl.xml_file_name, xl.status as xml_status, xl.xml_entries_count
       FROM file_logs fl
       JOIN banks b ON fl.bank_id = b.id
       LEFT JOIN xml_logs xl ON xl.file_log_id = fl.id
       WHERE fl.id = $1`,
      [req.params.fileLogId]
    );

    if (result.rows.length === 0) {
      const response = {
        success: false,
        error: 'NOT_FOUND',
        message: 'Traitement non trouve'
      };
      await logApiCall(req, res, startTime, response);
      return res.status(404).json(response);
    }

    const response = {
      success: true,
      data: result.rows[0]
    };
    await logApiCall(req, res, startTime, response);
    res.json(response);
  } catch (error) {
    const response = { success: false, error: 'SERVER_ERROR', message: error.message };
    await logApiCall(req, res, startTime, response);
    res.status(500).json(response);
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
        description: 'Liste des banques disponibles'
      },
      {
        method: 'POST',
        path: '/cards/validate',
        description: 'Valider des cartes sans les enregistrer',
        body: {
          bankCode: 'string (code de la banque)',
          cards: 'array of card objects'
        }
      },
      {
        method: 'POST',
        path: '/cards/register',
        description: 'Enregistrer des cartes et generer XML',
        body: {
          bankCode: 'string',
          cards: 'array',
          generateXml: 'boolean (default: true)'
        }
      },
      {
        method: 'GET',
        path: '/status/:fileLogId',
        description: 'Statut d\'un traitement'
      }
    ],
    cardObject: {
      pan: 'string (13-19 chiffres) - requis',
      phone: 'string (avec indicatif +216...) - requis',
      expiry: 'string (MM/YY) - requis',
      firstName: 'string',
      lastName: 'string',
      language: 'string (default: fr)',
      behaviour: 'string (default: otp)',
      action: 'string (default: update)'
    }
  });
});

module.exports = router;
