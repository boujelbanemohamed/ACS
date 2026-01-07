const express = require('express');
const db = require('../config/database');
const connectionService = require('../services/connectionService');
const { authMiddleware } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleMiddleware');

const router = express.Router();

// Get all banks
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    
    let query = `
      SELECT 
        b.*,
        COUNT(DISTINCT pr.id) as total_records,
        COUNT(DISTINCT fl.id) as total_files_processed
      FROM banks b
      LEFT JOIN processed_records pr ON b.id = pr.bank_id
      LEFT JOIN file_logs fl ON b.id = fl.bank_id
    `;
    
    // Filtrer par bankId si fourni
    if (bankId) {
      query += ' WHERE b.id = ' + parseInt(bankId);
    }
    
    query += ' GROUP BY b.id ORDER BY b.name';
    
    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get banks error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des banques',
      error: error.message
    });
  }
});

// Get single bank
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const query = 'SELECT * FROM banks WHERE id = $1';
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvee'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get bank error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation de la banque',
      error: error.message
    });
  }
});

// Create bank (admin only)
router.post('/', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { code, name, source_url, destination_url, old_url, xml_output_url, enrollment_report_url, is_active } = req.body;

    // Validate required fields including xml_output_url
    if (!code || !name || !source_url || !destination_url || !old_url || !xml_output_url) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs requis doivent etre fournis (code, name, source_url, destination_url, old_url, xml_output_url)'
      });
    }

    const query = `
      INSERT INTO banks (code, name, source_url, destination_url, old_url, xml_output_url, enrollment_report_url, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await db.query(query, [
      code.toUpperCase(),
      name,
      source_url,
      destination_url,
      old_url,
      xml_output_url,
      enrollment_report_url || null,
      is_active !== undefined ? is_active : true
    ]);

    res.status(201).json({
      success: true,
      message: 'Banque creee avec succes',
      data: result.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        message: 'Une banque avec ce code existe deja'
      });
    }
    
    console.error('Create bank error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la creation de la banque',
      error: error.message
    });
  }
});

// Update bank (admin only)
router.put('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      code, 
      name, 
      source_url, 
      destination_url, 
      old_url, 
      xml_output_url, 
      enrollment_report_url, 
      is_active,
      connection_type,
      sftp_host,
      sftp_port,
      sftp_username,
      sftp_password,
      sftp_private_key,
      sftp_passphrase
    } = req.body;

    // Verifier si la banque existe
    const existingBank = await db.query('SELECT * FROM banks WHERE id = $1', [id]);
    if (existingBank.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvee'
      });
    }

    // Verifier si le nouveau code n'est pas deja utilise par une autre banque
    if (code) {
      const codeCheck = await db.query(
        'SELECT id FROM banks WHERE code = $1 AND id != $2',
        [code, id]
      );
      if (codeCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ce code banque est deja utilise'
        });
      }
    }

    const result = await db.query(
      `UPDATE banks SET 
        code = COALESCE($1, code),
        name = COALESCE($2, name),
        source_url = COALESCE($3, source_url),
        destination_url = COALESCE($4, destination_url),
        old_url = COALESCE($5, old_url),
        xml_output_url = COALESCE($6, xml_output_url),
        enrollment_report_url = COALESCE($7, enrollment_report_url),
        is_active = COALESCE($8, is_active),
        connection_type = COALESCE($9, connection_type),
        sftp_host = $10,
        sftp_port = COALESCE($11, sftp_port),
        sftp_username = $12,
        sftp_password = CASE WHEN $13::text = '' THEN sftp_password ELSE $13 END,
        sftp_private_key = CASE WHEN $14::text = '' THEN sftp_private_key ELSE $14 END,
        sftp_passphrase = CASE WHEN $15::text = '' THEN sftp_passphrase ELSE $15 END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING id, code, name, source_url, destination_url, old_url, xml_output_url, 
                enrollment_report_url, is_active, connection_type, sftp_host, sftp_port, 
                sftp_username, created_at, updated_at`,
      [
        code, name, source_url, destination_url, old_url, xml_output_url,
        enrollment_report_url, is_active, connection_type, sftp_host,
        sftp_port || 22, sftp_username, sftp_password || '', 
        sftp_private_key || '', sftp_passphrase || '', id
      ]
    );

    res.json({
      success: true,
      message: 'Banque mise a jour avec succes',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update bank error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise a jour de la banque'
    });
  }
});

/**
 * POST /api/banks/:id/test-connection
 * Tester la connexion d'une banque
 */
router.post('/:id/test-connection', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [id]);
    
    if (bankResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvee'
      });
    }
    
    const bank = bankResult.rows[0];
    const result = await connectionService.testConnection(bank);
    
    res.json({
      success: result.success,
      message: result.message,
      data: {
        connectionType: result.type,
        sourceUrl: bank.source_url
      }
    });
  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du test de connexion: ' + error.message
    });
  }
});

module.exports = router;
