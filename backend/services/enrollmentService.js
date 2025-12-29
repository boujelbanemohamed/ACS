const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');

class EnrollmentService {
  
  // Parser le fichier XML de rapport d'enrolement
  parseEnrollmentXML(xmlContent) {
    const results = [];
    
    // Format: <cardRegistryRecordProcessingResult id="1" status="OK"/>
    // ou: <cardRegistryRecordProcessingResult id="1" status="BAD_DATA" description="Card is already in registry"/>
    const recordRegex = /<cardRegistryRecordProcessingResult\s+id="(\d+)"\s+status="([^"]+)"(?:\s+description="([^"]*)")?\s*\/>/g;
    
    let match;
    while ((match = recordRegex.exec(xmlContent)) !== null) {
      const xmlId = parseInt(match[1]);
      const status = match[2]; // "OK" ou "BAD_DATA"
      const description = match[3] || null;
      
      results.push({
        xmlId: xmlId,
        status: status === 'OK' ? 'success' : 'error',
        errorCode: status !== 'OK' ? status : null,
        errorDescription: description
      });
    }
    
    return results;
  }
  
  // Traiter un fichier uploade (contenu en memoire)
  async processEnrollmentReportFromContent(xmlContent, bankId, fileName) {
    try {
      const results = this.parseEnrollmentXML(xmlContent);
      
      if (results.length === 0) {
        return {
          success: false,
          message: 'Aucun enregistrement trouve dans le fichier XML'
        };
      }
      
      let successCount = 0;
      let errorCount = 0;
      let updatedRecords = 0;
      const details = [];
      
      for (const result of results) {
        if (result.status === 'success') {
          successCount++;
        } else {
          errorCount++;
        }
        
        // Mettre a jour par enrollment_xml_id
        const updateQuery = `
          UPDATE processed_records 
          SET 
            enrollment_status = $1,
            enrollment_error_code = $2,
            enrollment_error_description = $3,
            enrollment_date = CURRENT_TIMESTAMP
          WHERE enrollment_xml_id = $4
          AND ($5::integer IS NULL OR bank_id = $5)
          AND enrollment_status = 'pending'
          RETURNING id, pan
        `;
        
        const updateResult = await db.query(updateQuery, [
          result.status,
          result.errorCode,
          result.errorDescription,
          result.xmlId,
          bankId
        ]);
        
        updatedRecords += updateResult.rowCount;
        
        details.push({
          xmlId: result.xmlId,
          status: result.status,
          errorCode: result.errorCode,
          errorDescription: result.errorDescription,
          updated: updateResult.rowCount > 0
        });
      }
      
      // Enregistrer le log d enrolement
      await db.query(`
        INSERT INTO enrollment_logs (bank_id, file_name, file_path, total_records, success_count, error_count, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'processed')
      `, [bankId, fileName, 'upload', results.length, successCount, errorCount]);
      
      return {
        success: true,
        totalRecords: results.length,
        successCount,
        errorCount,
        updatedRecords,
        details,
        message: 'Rapport traite: ' + results.length + ' enregistrements (' + successCount + ' succes, ' + errorCount + ' erreurs), ' + updatedRecords + ' lignes mises a jour'
      };
      
    } catch (error) {
      console.error('Error processing enrollment report:', error);
      return {
        success: false,
        message: 'Erreur lors du traitement: ' + error.message
      };
    }
  }
  
  // Traiter un fichier depuis le disque
  async processEnrollmentReport(filePath, bankId, fileName) {
    try {
      const xmlContent = await fs.readFile(filePath, 'utf8');
      return await this.processEnrollmentReportFromContent(xmlContent, bankId, fileName);
    } catch (error) {
      console.error('Error reading enrollment file:', error);
      return {
        success: false,
        message: 'Erreur lecture fichier: ' + error.message
      };
    }
  }
  
  // Obtenir les statistiques d enrolement
  async getEnrollmentStats(bankId = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(*) FILTER (WHERE enrollment_status = 'success') as enrolled_success,
          COUNT(*) FILTER (WHERE enrollment_status = 'error') as enrolled_error,
          COUNT(*) FILTER (WHERE enrollment_status = 'pending') as pending
        FROM processed_records
      `;
      
      if (bankId) {
        query += ' WHERE bank_id = $1';
        const result = await db.query(query, [bankId]);
        return result.rows[0];
      } else {
        const result = await db.query(query);
        return result.rows[0];
      }
    } catch (error) {
      console.error('Error getting enrollment stats:', error);
      return null;
    }
  }
  
  // Obtenir les logs d enrolement
  async getEnrollmentLogs(bankId = null, limit = 50, offset = 0) {
    try {
      let query = `
        SELECT el.*, b.name as bank_name, b.code as bank_code
        FROM enrollment_logs el
        LEFT JOIN banks b ON el.bank_id = b.id
      `;
      
      const params = [];
      if (bankId) {
        query += ' WHERE el.bank_id = $1';
        params.push(bankId);
      }
      
      query += ' ORDER BY el.processed_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error getting enrollment logs:', error);
      return [];
    }
  }
}

module.exports = new EnrollmentService();
