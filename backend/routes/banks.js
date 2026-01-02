const express = require('express');
const db = require('../config/database');
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
    const { code, name, source_url, destination_url, old_url, xml_output_url, enrollment_report_url, is_active } = req.body;

    // Validate required fields
    if (!xml_output_url) {
      return res.status(400).json({
        success: false,
        message: 'Le champ xml_output_url est obligatoire'
      });
    }

    const query = `
      UPDATE banks 
      SET 
        code = COALESCE($1, code),
        name = COALESCE($2, name),
        source_url = COALESCE($3, source_url),
        destination_url = COALESCE($4, destination_url),
        old_url = COALESCE($5, old_url),
        xml_output_url = $6,
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;

    const result = await db.query(query, [
      code ? code.toUpperCase() : null,
      name,
      source_url,
      destination_url,
      old_url,
      xml_output_url,
      is_active,
      req.params.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvee'
      });
    }

    res.json({
      success: true,
      message: 'Banque mise a jour avec succes',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update bank error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise a jour de la banque',
      error: error.message
    });
  }
});

// Delete bank (admin only)
router.delete('/:id', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const query = 'DELETE FROM banks WHERE id = $1 RETURNING *';
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banque non trouvee'
      });
    }

    res.json({
      success: true,
      message: 'Banque supprimee avec succes'
    });
  } catch (error) {
    console.error('Delete bank error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression de la banque',
      error: error.message
    });
  }
});

// Get bank statistics
router.get('/:id/stats', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(DISTINCT pr.id) as total_records,
        COUNT(DISTINCT CASE WHEN fl.status = 'success' THEN fl.id END) as successful_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'error' THEN fl.id END) as failed_files,
        COUNT(DISTINCT CASE WHEN fl.status = 'validation_error' THEN fl.id END) as validation_errors,
        COALESCE(SUM(fl.valid_rows), 0) as total_valid_rows,
        COALESCE(SUM(fl.invalid_rows), 0) as total_invalid_rows,
        COALESCE(SUM(fl.duplicate_rows), 0) as total_duplicate_rows
      FROM banks b
      LEFT JOIN processed_records pr ON b.id = pr.bank_id
      LEFT JOIN file_logs fl ON b.id = fl.bank_id
      WHERE b.id = $1
      GROUP BY b.id
    `;

    const result = await db.query(query, [req.params.id]);

    res.json({
      success: true,
      data: result.rows[0] || {
        total_records: 0,
        successful_files: 0,
        failed_files: 0,
        validation_errors: 0,
        total_valid_rows: 0,
        total_invalid_rows: 0,
        total_duplicate_rows: 0
      }
    });
  } catch (error) {
    console.error('Get bank stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des statistiques',
      error: error.message
    });
  }
});

module.exports = router;
