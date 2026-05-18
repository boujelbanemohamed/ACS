const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const CSVProcessor = require('./csvProcessor');
const xmlGenerator = require('./xmlGenerator');
const remoteFileService = require('../utils/remoteFileService');

class FileScanner {
  constructor() {
    this.csvProcessor = new CSVProcessor();
  }

  async scanBank(bank) {
    const result = { filesFound: 0, filesProcessed: 0, xmlGenerated: false, errors: [] };

    try {
      const files = await this.listFiles(bank.source_url);
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
          const fileUrl = `${bank.source_url}/${fileName}`;
          const processResult = await this.csvProcessor.processFileFromURL(bank.id, fileUrl, fileName);

          if (processResult.success) {
            console.log(`   ✅ Successfully processed ${fileName}`);

            await this.csvProcessor.processRowsWithHistory(
              bank.id, processResult.allRows || [], processResult.validRecords || [],
              processResult.errors || [], processResult.fileLogId, fileName, 'cron'
            );

            if (processResult.validRecords && processResult.validRecords.length > 0) {
              const savedRecords = await this.csvProcessor.saveValidatedRecords(bank.id, processResult.validRecords, fileName);
              for (let i = 0; i < processResult.validRecords.length; i++) {
                if (savedRecords[i]) {
                  processResult.validRecords[i].id = savedRecords[i].id;
                }
              }

              try {
                const xmlResult = await xmlGenerator.processAndGenerateXML(processResult.validRecords, bank);
                await db.query(
                  `INSERT INTO xml_logs (bank_id, file_log_id, xml_file_name, xml_file_path, records_count, xml_entries_count, status, processed_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
                  [bank.id, processResult.fileLogId, xmlResult.fileName, xmlResult.filePath, processResult.validRecords.length, xmlResult.xmlEntriesCount, 'success']
                );
                result.xmlGenerated = true;
                console.log(`   📄 XML generated: ${xmlResult.fileName}`);
              } catch (xmlError) {
                console.error(`   ❌ XML generation failed: ${xmlError.message}`);
                result.errors.push({ bank: bank.name, file: fileName, error: `XML generation failed: ${xmlError.message}` });
              }
            }

            await this.csvProcessor.archiveOldFile(bank.source_url, bank.old_url, fileName);
            await this.csvProcessor.moveFileToDestination(bank.source_url, bank.destination_url, fileName);
            result.filesProcessed++;
          } else {
            console.log(`   ⚠️  Processed ${fileName} with errors`);
            result.errors.push({ bank: bank.name, file: fileName, error: 'Validation errors detected', details: processResult.errors });
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
      'SELECT status FROM file_logs WHERE bank_id = $1 AND file_name = $2 ORDER BY processed_at DESC LIMIT 1',
      [bankId, fileName]
    );
    if (result.rows.length === 0) return false;
    return result.rows[0].status === 'success' || result.rows[0].status === 'processing';
  }
}

module.exports = FileScanner;
