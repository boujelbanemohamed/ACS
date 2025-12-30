const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');

class XMLGenerator {
  // Convertir le PAN en format requis
  convertPAN(pan) {
    if (!pan) return null;
    const cleanPan = pan.toString().replace(/[^0-9]/g, '');
    return cleanPan.length >= 13 && cleanPan.length <= 19 ? cleanPan : null;
  }

  // Formater le numero de telephone
  formatPhone(phone) {
    if (!phone) return null;
    let cleanPhone = phone.toString().replace(/[^0-9+]/g, '');
    
    if (cleanPhone.startsWith('00216')) {
      cleanPhone = '+216' + cleanPhone.substring(5);
    } else if (cleanPhone.startsWith('216')) {
      cleanPhone = '+' + cleanPhone;
    } else if (!cleanPhone.startsWith('+')) {
      if (cleanPhone.length === 8) {
        cleanPhone = '+216' + cleanPhone;
      }
    }
    
    return cleanPhone;
  }

  // Obtenir le prochain ID unique depuis la base de donnees
  async getNextId(count) {
    try {
      const result = await db.query(
        'UPDATE xml_id_sequence SET last_id = last_id + $1, updated_at = CURRENT_TIMESTAMP RETURNING last_id',
        [count]
      );
      const lastId = parseInt(result.rows[0].last_id);
      return lastId - count + 1;
    } catch (error) {
      console.error('Error getting next XML ID:', error);
      return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    }
  }

  // Generer le XML a partir des enregistrements
  async generateXML(records, bankCode) {
    // Calculer le nombre total d IDs necessaires (2 par record: add + setAuthMethod)
    const totalIdsNeeded = records.length * 2;
    
    // Obtenir le prochain ID unique depuis la base de donnees
    let id = await this.getNextId(totalIdsNeeded);
    
    let xmlContent = '<?xml version="1.0" encoding="ISO-8859-15"?>\n';
    xmlContent += '<cardRegistryRecords xmlns="http://cardRegistry.acs.bpcbt.com/v2/types">\n';
    
    const idMappings = []; // Pour stocker les mappings record_id -> xml_id
    
    for (const record of records) {
      const cardNumber = this.convertPAN(record.pan);
      const phoneNumber = this.formatPhone(record.phone);
      const profileId = bankCode;
      
      if (!cardNumber || !phoneNumber) {
        console.warn('Skipping record with missing data:', record);
        continue;
      }
      
      // Sauvegarder le mapping (on utilise l ID du add)
      idMappings.push({
        recordId: record.id,
        xmlId: id
      });
      
      // Balise <add>
      xmlContent += '  <add id="' + id + '" cardNumber="' + cardNumber + '" profileId="' + profileId + '" cardStatus="ACTIVE">\n';
      xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phoneNumber + '"></oneTimePasswordSMS>\n';
      xmlContent += '  </add>\n';
      id++;
      
      // Balise <setAuthMethod>
      xmlContent += '  <setAuthMethod id="' + id + '" cardNumber="' + cardNumber + '" profileId="' + profileId + '">\n';
      xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phoneNumber + '"></oneTimePasswordSMS>\n';
      xmlContent += '  </setAuthMethod>\n';
      id++;
    }
    
    xmlContent += '</cardRegistryRecords>\n';
    
    // Mettre a jour les enrollment_xml_id dans la base de donnees
    for (const mapping of idMappings) {
      try {
        await db.query(
          'UPDATE processed_records SET enrollment_xml_id = $1 WHERE id = $2',
          [mapping.xmlId, mapping.recordId]
        );
      } catch (error) {
        console.error('Error updating enrollment_xml_id:', error);
      }
    }
    
    return xmlContent;
  }

  // Generer le nom du fichier XML
  generateFileName(bankCode) {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    
    return 'ACS_CARDS_' + bankCode + '_' + timestamp + '.xml';
  }

  // Sauvegarder le fichier XML
  async saveXML(xmlContent, outputPath, fileName) {
    try {
      await fs.mkdir(outputPath, { recursive: true });
      
      const filePath = path.join(outputPath, fileName);
      await fs.writeFile(filePath, xmlContent, 'utf8');
      
      console.log('XML file saved: ' + filePath);
      return filePath;
    } catch (error) {
      console.error('Error saving XML file:', error);
      throw error;
    }
  }

  async processAndGenerateXML(records, bank) {
    try {
      const xmlContent = await this.generateXML(records, bank.code);
      const fileName = this.generateFileName(bank.code);
      
      const xmlOutputPath = bank.xml_output_url || 
        path.join(path.dirname(bank.destination_url || '/tmp'), 'xml_output');
      
      const filePath = await this.saveXML(xmlContent, xmlOutputPath, fileName);
      
      return {
        success: true,
        filePath,
        fileName,
        xmlEntriesCount: records.length * 2
      };
    } catch (error) {
      console.error('Error processing XML:', error);
      throw error;
    }
  }
}

module.exports = new XMLGenerator();
