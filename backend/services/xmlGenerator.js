const fs = require('fs').promises;
const path = require('path');

class XMLGenerator {
  
  // Convertir le PAN du format scientifique vers le format complet
  convertPAN(pan) {
    if (!pan) return '';
    
    // Si c'est déjà un nombre complet
    if (typeof pan === 'string' && !pan.includes('E') && !pan.includes(',')) {
      return pan.replace(/\D/g, '');
    }
    
    // Convertir la notation scientifique (format français avec virgule)
    let panStr = String(pan).replace(',', '.');
    
    if (panStr.includes('E') || panStr.includes('e')) {
      const num = parseFloat(panStr);
      return Math.round(num).toString();
    }
    
    return panStr.replace(/\D/g, '');
  }
  
  // Formater le numéro de téléphone
  formatPhone(phone) {
    if (!phone) return '';
    
    let phoneStr = String(phone).replace(/\D/g, '');
    
    // Ajouter le + si pas présent
    if (!phoneStr.startsWith('+')) {
      phoneStr = '+' + phoneStr;
    }
    
    return phoneStr;
  }
  
  // Générer le XML à partir des enregistrements
  generateXML(records, bankCode) {
    let id = 1;
    let xmlContent = '<?xml version="1.0" encoding="ISO-8859-15"?>\n';
    xmlContent += '<cardRegistryRecords xmlns="http://cardRegistry.acs.bpcbt.com/v2/types">\n';
    
    for (const record of records) {
      const cardNumber = this.convertPAN(record.pan);
      const phoneNumber = this.formatPhone(record.phone);
      const profileId = bankCode;
      
      if (!cardNumber || !phoneNumber) {
        console.warn('Skipping record with missing data:', record);
        continue;
      }
      
      // Balise <add>
      xmlContent += `  <add id="${id}" cardNumber="${cardNumber}" profileId="${profileId}" cardStatus="ACTIVE">\n`;
      xmlContent += `    <oneTimePasswordSMS phoneNumber="${phoneNumber}"></oneTimePasswordSMS>\n`;
      xmlContent += `  </add>\n`;
      id++;
      
      // Balise <setAuthMethod>
      xmlContent += `  <setAuthMethod id="${id}" cardNumber="${cardNumber}" profileId="${profileId}">\n`;
      xmlContent += `    <oneTimePasswordSMS phoneNumber="${phoneNumber}"></oneTimePasswordSMS>\n`;
      xmlContent += `  </setAuthMethod>\n`;
      id++;
    }
    
    xmlContent += '</cardRegistryRecords>\n';
    
    return xmlContent;
  }
  
  // Générer le nom du fichier XML
  generateFileName(bankCode) {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0') +
      String(now.getMilliseconds()).padStart(3, '0');
    
    return `ACS_CARDS_${bankCode}_${timestamp}.xml`;
  }
  
  // Sauvegarder le fichier XML
  async saveXML(xmlContent, outputPath, fileName) {
    try {
      // Créer le dossier si nécessaire
      await fs.mkdir(outputPath, { recursive: true });
      
      const filePath = path.join(outputPath, fileName);
      await fs.writeFile(filePath, xmlContent, 'utf8');
      
      console.log(`XML file saved: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Error saving XML file:', error);
      throw error;
    }
  }
  
  // Processus complet de génération
  async processAndGenerateXML(records, bank) {
    try {
      const xmlContent = this.generateXML(records, bank.code);
      const fileName = this.generateFileName(bank.code);
      
      // Utiliser xml_output_url ou créer un sous-dossier xml_output
      const xmlOutputPath = bank.xml_output_url || 
        path.join(path.dirname(bank.destination_url), 'xml_output');
      
      const filePath = await this.saveXML(xmlContent, xmlOutputPath, fileName);
      
      return {
        success: true,
        fileName,
        filePath,
        recordsCount: records.length,
        xmlEntriesCount: records.length * 2 // add + setAuthMethod pour chaque enregistrement
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new XMLGenerator();
