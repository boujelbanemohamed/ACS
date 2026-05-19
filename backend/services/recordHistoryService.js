/**
 * Service de gestion de l'historique des enregistrements
 * Traçabilité complète de chaque tentative d'import par PAN
 */
const db = require('../config/database');
const { encrypt, decrypt, hashPan } = require('./encryptionService');

class RecordHistoryService {
  
  /**
   * Enregistre une tentative d'import pour un PAN
   * @param {Object} params - Paramètres de la tentative
   */
  async logAttempt({
    bankId,
    pan,
    attemptNumber: providedAttemptNumber,
    fileLogId,
    fileName,
    sourceType,
    userId,
    username,
    status,
    ipAddress,
    userAgent,
    dataReceived,
    validationResults = [],
    processedRecordId,
    xmlId
  }) {
    if (!bankId || !pan) {
      throw new Error('bankId et pan sont requis');
    }

    const encryptedPan = encrypt(pan);
    const panHash = hashPan(pan);
    
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Calculer le numéro de tentative pour ce PAN
      let attemptNumber = providedAttemptNumber;
      if (!attemptNumber) {
        const attemptResult = await client.query(
          `SELECT COALESCE(MAX(attempt_number), 0) + 1 as next_attempt 
           FROM record_history 
           WHERE bank_id = $1 AND pan_hash = $2`,
          [bankId, panHash]
        );
        attemptNumber = attemptResult.rows[0].next_attempt;
      }
      
      // Compter erreurs et warnings
      const totalErrors = validationResults.filter(v => !v.isValid && v.severity === 'error').length;
      const totalWarnings = validationResults.filter(v => !v.isValid && v.severity === 'warning').length;
      
      // Déterminer le username à afficher
      let displayUsername = username;
      if (sourceType === 'cron') {
        displayUsername = 'SYSTÈME';
      } else if (sourceType === 'api' && !username) {
        displayUsername = 'API';
      }
      
      // Insérer l'entrée principale
      const historyResult = await client.query(
        `INSERT INTO record_history 
         (bank_id, pan, pan_hash, attempt_number, file_log_id, file_name, source_type, 
          user_id, username, status, ip_address, user_agent, data_received,
          total_errors, total_warnings, processed_record_id, xml_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          bankId, encryptedPan, panHash, attemptNumber, fileLogId, fileName, sourceType,
          userId, displayUsername, status, ipAddress, userAgent, 
          JSON.stringify(dataReceived),
          totalErrors, totalWarnings, processedRecordId, xmlId
        ]
      );
      const historyId = historyResult.rows[0].id;
      
      // Récupérer les valeurs précédentes si c'est une correction
      let previousValues = {};
      if (attemptNumber > 1) {
        const prevResult = await client.query(
          `SELECT rhd.field_name, rhd.field_value
           FROM record_history_details rhd
           JOIN record_history rh ON rhd.history_id = rh.id
           WHERE rh.bank_id = $1 AND rh.pan_hash = $2 AND rh.attempt_number = $3`,
          [bankId, panHash, attemptNumber - 1]
        );
        prevResult.rows.forEach(row => {
          previousValues[row.field_name] = row.field_value;
        });
      }
      
      // Insérer les détails de validation pour chaque champ
      for (const validation of validationResults) {
        const previousValue = previousValues[validation.field] || null;
        const isCorrected = previousValue !== null && 
                           previousValue !== validation.value && 
                           validation.isValid;
        
        await client.query(
          `INSERT INTO record_history_details 
           (history_id, field_name, field_value, expected_format, is_valid, 
            error_type, error_message, severity, previous_value, is_corrected)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            historyId, 
            validation.field, 
            validation.value,
            validation.expectedFormat || null,
            validation.isValid,
            validation.errorType || null,
            validation.errorMessage || null,
            validation.severity || 'error',
            previousValue,
            isCorrected
          ]
        );
      }
      
      await client.query('COMMIT');
      
      return {
        historyId,
        attemptNumber,
        totalErrors,
        totalWarnings
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error logging record history:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Récupère l'historique complet d'un PAN
   */
  async getHistoryByPan(bankId, pan) {
    const panHash = hashPan(pan);
    
    // Récupérer toutes les tentatives
    const attemptsResult = await db.query(
      `SELECT 
        rh.*,
        b.code as bank_code,
        b.name as bank_name
       FROM record_history rh
       JOIN banks b ON rh.bank_id = b.id
       WHERE rh.bank_id = $1 AND rh.pan_hash = $2
       ORDER BY rh.attempt_number ASC`,
      [bankId, panHash]
    );
    
    const attempts = attemptsResult.rows;
    
    // Déchiffrer le PAN dans chaque tentative
    for (const attempt of attempts) {
      attempt.pan = decrypt(attempt.pan);
    }
    
    // Pour chaque tentative, récupérer les détails
    for (const attempt of attempts) {
      const detailsResult = await db.query(
        `SELECT * FROM record_history_details 
         WHERE history_id = $1 
         ORDER BY field_name`,
        [attempt.id]
      );
      attempt.details = detailsResult.rows;
      attempt.data_received = typeof attempt.data_received === 'string' 
        ? JSON.parse(attempt.data_received) 
        : attempt.data_received;
    }
    
    // Calculer le résumé
    const summary = {
      pan,
      bankId,
      bankCode: attempts[0]?.bank_code,
      bankName: attempts[0]?.bank_name,
      totalAttempts: attempts.length,
      currentStatus: attempts[attempts.length - 1]?.status || 'UNKNOWN',
      firstAttempt: attempts[0]?.processed_at,
      lastAttempt: attempts[attempts.length - 1]?.processed_at,
      xmlId: attempts.find(a => a.xml_id)?.xml_id || null,
      contributors: [...new Set(attempts.map(a => a.username).filter(Boolean))]
    };
    
    // Calculer le délai de correction si applicable
    if (attempts.length > 1 && summary.currentStatus === 'SUCCESS') {
      const firstDate = new Date(summary.firstAttempt);
      const lastDate = new Date(summary.lastAttempt);
      summary.correctionDelayMinutes = Math.round((lastDate - firstDate) / (1000 * 60));
    }
    
    return {
      summary,
      attempts
    };
  }
  
  /**
   * Recherche dans l'historique
   */
  async searchHistory({
    bankId = null,
    status = null,
    sourceType = null,
    userId = null,
    dateFrom = null,
    dateTo = null,
    hasErrors = null,
    limit = 50,
    offset = 0
  }) {
    let query = `
      SELECT 
        rh.*,
        b.code as bank_code,
        b.name as bank_name,
        (SELECT COUNT(*) FROM record_history rh2 
         WHERE rh2.bank_id = rh.bank_id AND rh2.pan_hash = rh.pan_hash) as total_attempts_for_pan
      FROM record_history rh
      JOIN banks b ON rh.bank_id = b.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (bankId) {
      query += ` AND rh.bank_id = $${paramCount}`;
      params.push(bankId);
      paramCount++;
    }
    
    if (status) {
      query += ` AND rh.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }
    
    if (sourceType) {
      query += ` AND rh.source_type = $${paramCount}`;
      params.push(sourceType);
      paramCount++;
    }
    
    if (userId) {
      query += ` AND rh.user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }
    
    if (dateFrom) {
      query += ` AND rh.processed_at >= $${paramCount}`;
      params.push(dateFrom);
      paramCount++;
    }
    
    if (dateTo) {
      query += ` AND rh.processed_at <= $${paramCount}::date + interval '1 day'`;
      params.push(dateTo);
      paramCount++;
    }
    
    if (hasErrors === true) {
      query += ` AND rh.total_errors > 0`;
    } else if (hasErrors === false) {
      query += ` AND rh.total_errors = 0`;
    }
    
    query += ` ORDER BY rh.processed_at DESC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Déchiffrer le PAN dans chaque résultat
    for (const row of result.rows) {
      row.pan = decrypt(row.pan);
    }
    
    // Count total
    let countQuery = `
      SELECT COUNT(*) FROM record_history rh WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 1;
    
    if (bankId) {
      countQuery += ` AND rh.bank_id = $${countParamCount}`;
      countParams.push(bankId);
      countParamCount++;
    }
    if (status) {
      countQuery += ` AND rh.status = $${countParamCount}`;
      countParams.push(status);
      countParamCount++;
    }
    if (sourceType) {
      countQuery += ` AND rh.source_type = $${countParamCount}`;
      countParams.push(sourceType);
      countParamCount++;
    }
    if (dateFrom) {
      countQuery += ` AND rh.processed_at >= $${countParamCount}`;
      countParams.push(dateFrom);
      countParamCount++;
    }
    if (dateTo) {
      countQuery += ` AND rh.processed_at <= $${countParamCount}::date + interval '1 day'`;
      countParams.push(dateTo);
    }
    
    const countResult = await db.query(countQuery, countParams);
    
    return {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    };
  }
  
  /**
   * Statistiques globales d'historique
   */
  async getStats(bankId = null) {
    let bankFilter = '';
    const params = [];
    
    if (bankId) {
      bankFilter = 'WHERE rh.bank_id = $1';
      params.push(bankId);
    }
    
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(DISTINCT pan_hash) as unique_pans,
        COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_count,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_count,
        COUNT(*) FILTER (WHERE status = 'PARTIAL') as partial_count,
        COUNT(*) FILTER (WHERE source_type = 'cron') as cron_count,
        COUNT(*) FILTER (WHERE source_type = 'upload') as upload_count,
        COUNT(*) FILTER (WHERE source_type = 'manual') as manual_count,
        COUNT(*) FILTER (WHERE source_type = 'correction') as correction_count,
        COUNT(*) FILTER (WHERE source_type = 'api') as api_count,
        SUM(total_errors) as total_errors,
        SUM(total_warnings) as total_warnings,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
      FROM record_history rh
      ${bankFilter}
    `, params);
    
    // PANs avec plusieurs tentatives (nécessitant correction)
    const multiAttemptResult = await db.query(`
      SELECT COUNT(*) as pans_with_corrections
      FROM (
        SELECT pan_hash, bank_id, COUNT(*) as attempts
        FROM record_history rh
        ${bankFilter}
        GROUP BY pan_hash, bank_id
        HAVING COUNT(*) > 1
      ) sub
    `, params);
    
    return {
      ...result.rows[0],
      pans_with_corrections: parseInt(multiAttemptResult.rows[0].pans_with_corrections)
    };
  }
  
  /**
   * Obtenir les erreurs les plus fréquentes
   */
  async getTopErrors(bankId = null, limit = 10) {
    let bankFilter = '';
    const params = [limit];
    
    if (bankId) {
      bankFilter = 'JOIN record_history rh ON rhd.history_id = rh.id WHERE rh.bank_id = $2';
      params.push(bankId);
    }
    
    const result = await db.query(`
      SELECT 
        rhd.field_name,
        rhd.error_type,
        rhd.error_message,
        COUNT(*) as occurrence_count
      FROM record_history_details rhd
      ${bankFilter}
      ${bankFilter ? 'AND' : 'WHERE'} rhd.is_valid = false
      GROUP BY rhd.field_name, rhd.error_type, rhd.error_message
      ORDER BY occurrence_count DESC
      LIMIT $1
    `, params);
    
    return result.rows;
  }
}

module.exports = new RecordHistoryService();
