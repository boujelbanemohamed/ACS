const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { filterByBank } = require('../middleware/roleMiddleware');

const router = express.Router();

// Get all processed records with pagination and filters
router.get('/', authMiddleware, filterByBank, async (req, res) => {
  try {
    const { 
      bankId, 
      search, 
      limit = 50, 
      offset = 0,
      sortBy = 'processed_at',
      sortOrder = 'DESC'
    } = req.query;

    let query = `
      SELECT 
        pr.*,
        b.name as bank_name,
        b.code as bank_code
      FROM processed_records pr
      JOIN banks b ON pr.bank_id = b.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (bankId) {
      query += ` AND pr.bank_id = $${paramCount}`;
      params.push(bankId);
      paramCount++;
    }

    if (search) {
      query += ` AND (
        pr.first_name ILIKE $${paramCount} OR 
        pr.last_name ILIKE $${paramCount} OR 
        pr.pan ILIKE $${paramCount} OR 
        pr.phone ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY pr.${sortBy} ${sortOrder} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    let countQuery = `SELECT COUNT(*) FROM processed_records pr JOIN banks b ON pr.bank_id = b.id WHERE 1=1`;
    const countParams = [];
    let countParamCount = 1;

    if (bankId) {
      countQuery += ` AND pr.bank_id = $${countParamCount}`;
      countParams.push(bankId);
      countParamCount++;
    }

    if (search) {
      countQuery += ` AND (pr.first_name ILIKE $${countParamCount} OR pr.last_name ILIKE $${countParamCount} OR pr.pan ILIKE $${countParamCount} OR pr.phone ILIKE $${countParamCount})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Get records error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des enregistrements',
      error: error.message
    });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const query = 'DELETE FROM processed_records WHERE id = $1 RETURNING *';
    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enregistrement non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Enregistrement supprimé avec succès'
    });
  } catch (error) {
    console.error('Delete record error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression',
      error: error.message
    });
  }
});

router.get('/export/csv', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    
    let query = `SELECT b.code as bank_code, pr.* FROM processed_records pr JOIN banks b ON pr.bank_id = b.id WHERE 1=1`;
    const params = [];
    
    if (bankId) {
      query += ` AND pr.bank_id = $1`;
      params.push(bankId);
    }
    
    query += ` ORDER BY pr.processed_at DESC`;
    const result = await db.query(query, params);

    const headers = ['Bank', 'Language', 'First Name', 'Last Name', 'PAN', 'Expiry', 'Phone', 'Behaviour', 'Action', 'File', 'Processed At'];
    let csv = headers.join(';') + '\n';
    
    result.rows.forEach(row => {
      csv += [
        row.bank_code,
        row.language,
        row.first_name,
        row.last_name,
        row.pan,
        row.expiry,
        row.phone,
        row.behaviour,
        row.action,
        row.file_name,
        new Date(row.processed_at).toISOString()
      ].join(';') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=records_${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export',
      error: error.message
    });
  }
});

// Get file content by file name
router.get('/file-content/byname', authMiddleware, async (req, res) => {
  try {
    const { type, fileName } = req.query;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'Nom de fichier requis'
      });
    }

    // Pour les fichiers XML, chercher le CSV correspondant
    let searchFileName = fileName;
    if (fileName.endsWith('.xml')) {
      searchFileName = fileName.replace('.xml', '.csv');
    }

    const recordsQuery = `
      SELECT 
        pr.language, pr.first_name as "firstName", pr.last_name as "lastName",
        pr.pan, pr.expiry, pr.phone, pr.behaviour, pr.action,
        b.code as bank_code
      FROM processed_records pr
      JOIN banks b ON pr.bank_id = b.id
      WHERE pr.file_name = $1
      ORDER BY pr.id
    `;
    
    const result = await db.query(recordsQuery, [searchFileName]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucun enregistrement trouve pour ce fichier'
      });
    }

    const bankCode = result.rows[0].bank_code || 'UNKNOWN';

    if (type === 'xml') {
      let xmlContent = '<?xml version="1.0" encoding="ISO-8859-15"?>\n';
      xmlContent += '<cardRegistryRecords xmlns="http://cardRegistry.acs.bpcbt.com/v2/types">\n';
      
      let idCounter = 1;
      result.rows.forEach(row => {
        const phone = row.phone && row.phone.startsWith('+') ? row.phone : '+' + (row.phone || '');
        xmlContent += '  <add id="' + idCounter + '" cardNumber="' + row.pan + '" profileId="' + bankCode + '" cardStatus="ACTIVE">\n';
        xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phone + '"></oneTimePasswordSMS>\n';
        xmlContent += '  </add>\n';
        idCounter++;
        xmlContent += '  <setAuthMethod id="' + idCounter + '" cardNumber="' + row.pan + '" profileId="' + bankCode + '">\n';
        xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phone + '"></oneTimePasswordSMS>\n';
        xmlContent += '  </setAuthMethod>\n';
        idCounter++;
      });
      xmlContent += '</cardRegistryRecords>';

      res.json({ success: true, data: xmlContent });
    } else {
      const csvData = result.rows.map(row => ({
        language: row.language,
        firstName: row.firstName,
        lastName: row.lastName,
        pan: row.pan,
        expiry: row.expiry,
        phone: row.phone,
        behaviour: row.behaviour,
        action: row.action
      }));

      res.json({ success: true, data: csvData });
    }
  } catch (error) {
    console.error('Get file content error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation du contenu',
      error: error.message
    });
  }
});

// Get file content by file_log_id
router.get('/file-content/:fileLogId', authMiddleware, async (req, res) => {
  try {
    const { fileLogId } = req.params;
    const { type } = req.query;

    // Get records for this file
    const recordsQuery = `
      SELECT 
        pr.language, pr.first_name as "firstName", pr.last_name as "lastName",
        pr.pan, pr.expiry, pr.phone, pr.behaviour, pr.action
      FROM processed_records pr
      WHERE pr.file_log_id = $1 OR pr.file_name = (
        SELECT file_name FROM file_logs WHERE id = $1
      )
      ORDER BY pr.id
    `;
    
    const result = await db.query(recordsQuery, [fileLogId]);

    if (type === 'xml') {
      // Get bank info
      const bankQuery = `
        SELECT b.code FROM file_logs fl
        JOIN banks b ON fl.bank_id = b.id
        WHERE fl.id = $1
      `;
      const bankResult = await db.query(bankQuery, [fileLogId]);
      const bankCode = bankResult.rows[0]?.code || 'UNKNOWN';

      // Generate XML content
      let xmlContent = '<?xml version="1.0" encoding="ISO-8859-15"?>\n';
      xmlContent += '<cardRegistryRecords xmlns="http://cardRegistry.acs.bpcbt.com/v2/types">\n';
      
      let idCounter = 1;
      result.rows.forEach(row => {
        const phone = row.phone && row.phone.startsWith('+') ? row.phone : '+' + row.phone;
        xmlContent += '  <add id="' + idCounter + '" cardNumber="' + row.pan + '" profileId="' + bankCode + '" cardStatus="ACTIVE">\n';
        xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phone + '"></oneTimePasswordSMS>\n';
        xmlContent += '  </add>\n';
        idCounter++;
        xmlContent += '  <setAuthMethod id="' + idCounter + '" cardNumber="' + row.pan + '" profileId="' + bankCode + '">\n';
        xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phone + '"></oneTimePasswordSMS>\n';
        xmlContent += '  </setAuthMethod>\n';
        idCounter++;
      });
      xmlContent += '</cardRegistryRecords>';

      res.json({
        success: true,
        data: xmlContent
      });
    } else {
      res.json({
        success: true,
        data: result.rows
      });
    }
  } catch (error) {
    console.error('Get file content error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation du contenu',
      error: error.message
    });
  }
});

module.exports = router;
