const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const remoteFileService = require('../utils/remoteFileService');

// Échappement des valeurs placées dans un attribut XML
const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

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

    return cleanPhone || null;
  }

  // Réserve `count` identifiants consécutifs dans la séquence (aucun identifiant de secours hors séquence)
  async getNextId(count, client = db) {
    const result = await client.query(
      'UPDATE xml_id_sequence SET last_id = last_id + $1, updated_at = CURRENT_TIMESTAMP RETURNING last_id',
      [count]
    );
    if (!result.rows || result.rows.length === 0) {
      throw new Error('Sequence XML (xml_id_sequence) non initialisee');
    }
    const lastId = parseInt(result.rows[0].last_id, 10);
    return lastId - count + 1;
  }

  /**
   * Génère le document XML.
   * @returns {Promise<{xmlContent: string, entriesCount: number, recordsCount: number, skipped: object[]}>}
   */
  async generateXMLDocument(records, bankCode, client = db) {
    const profileId = escapeXml(bankCode);
    const prepared = [];
    const skipped = [];

    for (const record of records) {
      const cardNumber = this.convertPAN(record.pan);
      const phoneNumber = this.formatPhone(record.phone);
      if (!cardNumber || !phoneNumber) {
        skipped.push({ recordId: record.id || null, reason: !cardNumber ? 'PAN invalide' : 'Telephone invalide' });
        continue;
      }
      prepared.push({ record, cardNumber, phoneNumber: escapeXml(phoneNumber) });
    }

    let xmlContent = '<?xml version="1.0" encoding="ISO-8859-15"?>\n';
    xmlContent += '<cardRegistryRecords xmlns="http://cardRegistry.acs.bpcbt.com/v2/types">\n';

    if (prepared.length === 0) {
      xmlContent += '</cardRegistryRecords>\n';
      return { xmlContent, entriesCount: 0, recordsCount: 0, skipped };
    }

    // 2 identifiants par carte : add + setAuthMethod (réservés uniquement pour les cartes retenues)
    let id = await this.getNextId(prepared.length * 2, client);
    const idMappings = [];

    for (const { record, cardNumber, phoneNumber } of prepared) {
      idMappings.push({ recordId: record.id, xmlId: id });

      xmlContent += '  <add id="' + id + '" cardNumber="' + cardNumber + '" profileId="' + profileId + '" cardStatus="ACTIVE">\n';
      xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phoneNumber + '"></oneTimePasswordSMS>\n';
      xmlContent += '  </add>\n';
      id++;

      xmlContent += '  <setAuthMethod id="' + id + '" cardNumber="' + cardNumber + '" profileId="' + profileId + '">\n';
      xmlContent += '    <oneTimePasswordSMS phoneNumber="' + phoneNumber + '"></oneTimePasswordSMS>\n';
      xmlContent += '  </setAuthMethod>\n';
      id++;
    }

    xmlContent += '</cardRegistryRecords>\n';

    // Lien enregistrement -> identifiant XML (utilisé pour rapprocher le rapport de l'ACS)
    for (const mapping of idMappings) {
      if (!mapping.recordId) continue;
      await client.query(
        'UPDATE processed_records SET enrollment_xml_id = $1 WHERE id = $2',
        [mapping.xmlId, mapping.recordId]
      );
    }

    return { xmlContent, entriesCount: prepared.length * 2, recordsCount: prepared.length, skipped };
  }

  // Generer le XML a partir des enregistrements
  async generateXML(records, bankCode, client = db) {
    const { xmlContent } = await this.generateXMLDocument(records, bankCode, client);
    return xmlContent;
  }

  // Generer le nom du fichier XML
  generateFileName(bankCode, suffix = '') {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');

    return 'ACS_CARDS_' + bankCode + '_' + timestamp + suffix + '.xml';
  }

  /**
   * Sauvegarde le fichier XML sans jamais écraser un fichier existant.
   * L'écriture passe par un fichier temporaire renommé : l'ACS ne voit jamais un fichier partiel.
   * @returns {Promise<{filePath: string, fileName: string}>}
   */
  async saveXMLFile(xmlContent, outputPath, fileName) {
    const base = fileName.replace(/\.xml$/, '');

    if (remoteFileService.isRemote(outputPath)) {
      const dir = outputPath.endsWith('/') ? outputPath : outputPath + '/';
      for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = attempt === 0 ? fileName : `${base}_${attempt}.xml`;
        const finalUrl = dir + candidate;
        if (await remoteFileService.exists(finalUrl)) continue;
        const tmpUrl = finalUrl + '.tmp';
        await remoteFileService.writeFile(tmpUrl, xmlContent);
        await remoteFileService.moveFile(tmpUrl, finalUrl);
        console.log('XML file saved to remote: ' + candidate);
        return { filePath: finalUrl, fileName: candidate };
      }
      throw new Error('Impossible de determiner un nom de fichier XML unique');
    }

    const localPath = outputPath.replace('file://', '');
    await fs.mkdir(localPath, { recursive: true });

    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = attempt === 0 ? fileName : `${base}_${attempt}.xml`;
      const filePath = path.join(localPath, candidate);
      const tmpPath = filePath + '.tmp';
      try {
        // "wx" : échoue si un autre traitement a déjà réservé ce nom
        await fs.writeFile(tmpPath, xmlContent, { encoding: 'latin1', flag: 'wx' });
      } catch (error) {
        if (error.code === 'EEXIST') continue;
        throw error;
      }
      try {
        await fs.access(filePath);
        await fs.unlink(tmpPath);
        continue;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          await fs.unlink(tmpPath).catch(() => {});
          throw error;
        }
      }
      await fs.rename(tmpPath, filePath);
      console.log('XML file saved: ' + filePath);
      return { filePath, fileName: candidate };
    }
    throw new Error('Impossible de determiner un nom de fichier XML unique');
  }

  // Sauvegarder le fichier XML (compatibilité : retourne le chemin)
  async saveXML(xmlContent, outputPath, fileName) {
    const { filePath } = await this.saveXMLFile(xmlContent, outputPath, fileName);
    return filePath;
  }

  // Supprime un fichier XML (annulation d'un traitement)
  async deleteXML(filePath) {
    if (!filePath) return;
    try {
      if (remoteFileService.isRemote(filePath)) {
        await remoteFileService.deleteFile(filePath);
      } else {
        await fs.unlink(filePath.replace('file://', ''));
      }
    } catch (error) {
      console.error('Error deleting XML file:', error.message);
    }
  }

  getOutputPath(bank) {
    return bank.xml_output_url ||
      path.join(path.dirname(bank.destination_url || '/tmp'), 'xml_output');
  }

  async processAndGenerateXML(records, bank, { client = db } = {}) {
    try {
      const { xmlContent, entriesCount, recordsCount, skipped } = await this.generateXMLDocument(records, bank.code, client);

      if (recordsCount === 0) {
        return {
          success: false,
          filePath: null,
          fileName: null,
          xmlEntriesCount: 0,
          recordsCount: 0,
          skipped,
          message: 'Aucune carte exploitable pour le XML'
        };
      }

      const { filePath, fileName } = await this.saveXMLFile(xmlContent, this.getOutputPath(bank), this.generateFileName(bank.code));

      return {
        success: true,
        filePath,
        fileName,
        xmlEntriesCount: entriesCount,
        recordsCount,
        skipped
      };
    } catch (error) {
      console.error('Error processing XML:', error);
      throw error;
    }
  }
}

module.exports = new XMLGenerator();
module.exports.escapeXml = escapeXml;
