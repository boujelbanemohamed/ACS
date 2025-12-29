const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { filterByBank } = require('../middleware/roleMiddleware');

const router = express.Router();

// Get processing history with all details
router.get('/', authMiddleware, filterByBank, async (req, res) => {
  try {
    const { bankId, sourceType, status, dateFrom, dateTo, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        fl.id,
        fl.file_name,
        fl.original_path,
        fl.destination_path,
        fl.archive_path,
        fl.output_path,
        fl.status,
        fl.source_type,
        fl.validation_status,
        fl.archive_status,
        fl.output_status,
        fl.total_rows,
        fl.valid_rows,
        fl.invalid_rows,
        fl.duplicate_rows,
        fl.error_details,
        fl.processed_at,
        b.id as bank_id,
        b.name as bank_name,
        b.code as bank_code,
        xl.id as xml_log_id,
        xl.xml_file_name,
        xl.xml_file_path,
        xl.status as xml_status,
        xl.records_count as xml_records_count,
        xl.xml_entries_count,
        xl.error_message as xml_error,
        (SELECT COUNT(*) FROM validation_errors ve WHERE ve.file_log_id = fl.id AND ve.is_resolved = false) as pending_errors,
        (SELECT COUNT(*) FROM validation_errors ve WHERE ve.file_log_id = fl.id AND ve.is_resolved = true) as resolved_errors
      FROM file_logs fl
      JOIN banks b ON fl.bank_id = b.id
      LEFT JOIN xml_logs xl ON xl.file_log_id = fl.id
      WHERE 1=1
    `;
    
    // Filtrer par banque si utilisateur de type bank
    if (req.bankFilter) {
      query += ' AND fl.bank_id = ' + req.bankFilter;
    }

    const params = [];
    let paramCount = 1;

    if (bankId) {
      query += ' AND fl.bank_id = $' + paramCount;
      params.push(bankId);
      paramCount++;
    }

    if (sourceType) {
      query += ' AND fl.source_type = $' + paramCount;
      params.push(sourceType);
      paramCount++;
    }

    if (status) {
      query += ' AND fl.status = $' + paramCount;
      params.push(status);
      paramCount++;
    }

    if (dateFrom) {
      query += ' AND fl.processed_at >= $' + paramCount;
      params.push(dateFrom);
      paramCount++;
    }

    if (dateTo) {
      query += ' AND fl.processed_at <= $' + paramCount + '::date + interval \'1 day\'';
      params.push(dateTo);
      paramCount++;
    }

    query += ' ORDER BY fl.processed_at DESC LIMIT $' + paramCount + ' OFFSET $' + (paramCount + 1);
    params.push(limit, offset);

    const result = await db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM file_logs fl WHERE 1=1';
    const countParams = [];
    let countParamCount = 1;

    if (bankId) {
      countQuery += ' AND fl.bank_id = $' + countParamCount;
      countParams.push(bankId);
      countParamCount++;
    }

    if (sourceType) {
      countQuery += ' AND fl.source_type = $' + countParamCount;
      countParams.push(sourceType);
      countParamCount++;
    }

    if (status) {
      countQuery += ' AND fl.status = $' + countParamCount;
      countParams.push(status);
      countParamCount++;
    }

    if (dateFrom) {
      countQuery += ' AND fl.processed_at >= $' + countParamCount;
      countParams.push(dateFrom);
      countParamCount++;
    }

    if (dateTo) {
      countQuery += ' AND fl.processed_at <= $' + countParamCount + '::date + interval \'1 day\'';
      countParams.push(dateTo);
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
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation de l historique',
      error: error.message
    });
  }
});

// Get history stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    
    let statsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE source_type = 'upload') as upload_count,
        COUNT(*) FILTER (WHERE source_type = 'url') as url_count,
        COUNT(*) FILTER (WHERE source_type = 'manual') as manual_count,
        COUNT(*) FILTER (WHERE file_logs.status = 'success') as success_count,
        COUNT(*) FILTER (WHERE file_logs.status = 'error' OR file_logs.status = 'validation_error') as error_count,
        COUNT(*) FILTER (WHERE file_logs.status = 'pending') as pending_count,
        SUM(total_rows) as total_rows_processed,
        SUM(valid_rows) as total_valid_rows,
        SUM(invalid_rows) as total_invalid_rows
      FROM file_logs
    `;
    
    // Filtrer par banque si bankId fourni
    if (bankId) {
      statsQuery += ' WHERE bank_id = ' + parseInt(bankId);
    }
    
    const result = await db.query(statsQuery);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get history stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des statistiques',
      error: error.message
    });
  }
});

// Get single history entry details
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT 
        fl.*,
        b.name as bank_name,
        b.code as bank_code,
        b.source_url,
        b.destination_url,
        b.old_url,
        b.xml_output_url,
        xl.id as xml_log_id,
        xl.xml_file_name,
        xl.xml_file_path,
        xl.status as xml_status,
        xl.records_count as xml_records_count,
        xl.xml_entries_count,
        xl.error_message as xml_error,
        xl.processed_at as xml_processed_at
      FROM file_logs fl
      JOIN banks b ON fl.bank_id = b.id
      LEFT JOIN xml_logs xl ON xl.file_log_id = fl.id
      WHERE fl.id = $1
    `;

    const result = await db.query(query, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Enregistrement non trouve'
      });
    }

    const errorsQuery = `
      SELECT * FROM validation_errors 
      WHERE file_log_id = $1 
      ORDER BY row_number
    `;
    const errorsResult = await db.query(errorsQuery, [req.params.id]);

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        validation_errors: errorsResult.rows
      }
    });
  } catch (error) {
    console.error('Get history detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des details',
      error: error.message
    });
  }
});

module.exports = router;
