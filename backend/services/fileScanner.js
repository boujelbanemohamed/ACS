const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const CSVProcessor = require('./csvProcessor');
const { commitValidRecords } = require('./pipelineService');
const remoteFileService = require('../utils/remoteFileService');

class FileScanner {
  constructor() {
    this.csvProcessor = new CSVProcessor();
  }

  async scanBank(bank) {
    const result = { filesFound: 0, filesProcessed: 0, xmlGenerated: false, errors: [] };

    try {
      const files = (await this.listFiles(bank.source_url))
        // Un nom de fichier ne doit jamais permettre de sortir du dossier source
        .filter(name => typeof name === 'string' && !name.includes('/') && !name.includes('\\') && !name.startsWith('.'));
      result.filesFound = files.length;

      if (files.length === 0) {
        console.log(`   ℹ️  No new files found for ${bank.name}`);
        return result;
      }

      console.log(`   📁 Found ${files.length} file(s) for ${bank.name}`);

      for (const fileName of files) {
        try {
          const alreadyProcessed = await this.isFileProcessed(bank.id, fileName);
          if (alreadyProcessed) {
            console.log(`   ⏭️  Skipping ${fileName} (already processed)`);
            continue;
          }

          console.log(`   🔄 Processing ${fileName}...`);
          const sourceDir = bank.source_url.replace(/\/+$/, '');
          const fileUrl = `${sourceDir}/${fileName}`;
          const processResult = await this.csvProcessor.processFileFromURL(bank.id, fileUrl, fileName, {
            sourceType: 'cron',
            trustedUrl: true,
            // Un fichier rejeté n'est retraité que si son contenu a changé
            skipIfUnchanged: true
          });

          if (processResult.skipped) {
            console.log(`   ⏭️  Skipping ${fileName} (unchanged since last validation error)`);
            continue;
          }

          await this.csvProcessor.processRowsWithHistory(
            bank.id, processResult.allRows || [], processResult.validRecords || [],
            processResult.errors || [], processResult.fileLogId, fileName, 'cron'
          );

          if (processResult.success) {
            console.log(`   ✅ Successfully validated ${fileName}`);

            if (processResult.validRecords && processResult.validRecords.length > 0) {
              // Enregistrement + XML atomiques : en cas d'échec le fichier reste dans le dossier source
              const { xmlResult } = await commitValidRecords({
                bank,
                fileLogId: processResult.fileLogId,
                fileName,
                rows: processResult.validRecords
              });
              if (xmlResult && xmlResult.success) {
                result.xmlGenerated = true;
                console.log(`   📄 XML generated: ${xmlResult.fileName}`);
              }
            } else {
              await this.csvProcessor.updateFileLog(processResult.fileLogId, { status: 'success' });
            }

            // Archivage AVANT déplacement : le déplacement supprime le fichier source
            const archive = await this.csvProcessor.archiveOldFile(bank.source_url, bank.old_url, fileName);
            const move = await this.csvProcessor.moveFileToDestination(bank.source_url, bank.destination_url, fileName);
            await this.csvProcessor.updateFileLog(processResult.fileLogId, {
              archive_status: archive.success ? 'success' : 'error',
              destination_path: move.success ? move.destinationPath : null
            });
            if (!archive.success || !move.success) {
              result.errors.push({ bank: bank.name, file: fileName, error: `Archivage/deplacement: ${archive.error || move.error}` });
            }
            result.filesProcessed++;
          } else {
            console.log(`   ⚠️  Processed ${fileName} with errors`);
            const blocking = (processResult.errors || []).filter(e => (e.severity || 'error') === 'error');
            // Pas de détail des lignes (données de cartes) dans les journaux de scan
            result.errors.push({ bank: bank.name, file: fileName, error: 'Validation errors detected', errorCount: blocking.length, fileLogId: processResult.fileLogId });
          }
        } catch (error) {
          console.error(`   ❌ Error processing ${fileName}:`, error.message);
          result.errors.push({ bank: bank.name, file: fileName, error: error.message });
        }
      }
    } catch (error) {
      throw new Error(`Failed to scan bank ${bank.name}: ${error.message}`);
    }

    return result;
  }

  async listFiles(sourceUrl) {
    try {
      if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
        return await this.listFilesHTTP(sourceUrl);
      } else if (remoteFileService.isRemote(sourceUrl)) {
        return await remoteFileService.listFiles(sourceUrl, '.csv');
      } else if (sourceUrl.startsWith('file://') || path.isAbsolute(sourceUrl)) {
        return await this.listFilesLocal(sourceUrl);
      } else {
        console.error(`Unsupported protocol: ${sourceUrl}`);
        return [];
      }
    } catch (error) {
      console.error(`Error listing files at ${sourceUrl}:`, error.message);
      return [];
    }
  }

  async listFilesHTTP(url) {
    try {
      const response = await axios.get(url, {
        timeout: parseInt(process.env.HTTP_TIMEOUT) || 15000,
        headers: { 'Accept': 'application/json, text/html' }
      });

      if (response.headers['content-type']?.includes('application/json')) {
        const data = response.data;
        const files = Array.isArray(data) ? data : (data.files || []);
        return files.filter(f => f.endsWith('.csv'));
      }

      if (response.headers['content-type']?.includes('text/html')) {
        const csvRegex = /href=["']([^"']*\.csv)["']/gi;
        const files = [];
        let match;
        while ((match = csvRegex.exec(response.data)) !== null) {
          const fileName = match[1].split('/').pop();
          if (fileName && !files.includes(fileName)) files.push(fileName);
        }
        return files;
      }

      return [];
    } catch (error) {
      if (error.response?.status === 404) return [];
      throw error;
    }
  }

  async listFilesLocal(dirPath) {
    const cleanPath = dirPath.replace('file://', '');
    if (!fs.existsSync(cleanPath)) return [];
    return fs.readdirSync(cleanPath).filter(f => f.endsWith('.csv'));
  }

  async isFileProcessed(bankId, fileName) {
    const result = await db.query(
      `SELECT status, processed_at FROM file_logs WHERE bank_id = $1 AND file_name = $2
       ORDER BY processed_at DESC, id DESC LIMIT 1`,
      [bankId, fileName]
    );
    if (result.rows.length === 0) return false;
    const { status, processed_at: processedAt } = result.rows[0];
    if (status === 'success') return true;
    // Un traitement "processing" interrompu (plantage) redevient éligible après 1 heure
    if (status === 'processing') {
      return !processedAt || Date.now() - new Date(processedAt).getTime() < 60 * 60 * 1000;
    }
    return false;
  }
}

module.exports = FileScanner;
