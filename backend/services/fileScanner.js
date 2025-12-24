const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const CSVProcessor = require('./csvProcessor');

/**
 * File Scanner Service
 * Handles automatic detection and processing of new CSV files
 */
class FileScanner {
  constructor() {
    this.csvProcessor = new CSVProcessor();
    this.isScanning = false;
    this.lastScanTime = null;
  }

  /**
   * Main scanning function - checks all active banks for new files
   */
  async scanAllBanks() {
    if (this.isScanning) {
      console.log('⚠️  Scan already in progress, skipping...');
      return;
    }

    this.isScanning = true;
    this.lastScanTime = new Date();

    console.log('🔍 Starting automatic file scan at', this.lastScanTime.toISOString());

    try {
      // Get all active banks
      const banksQuery = 'SELECT * FROM banks WHERE is_active = true';
      const banksResult = await db.query(banksQuery);

      console.log(`📋 Found ${banksResult.rows.length} active banks to check`);

      const results = {
        totalBanks: banksResult.rows.length,
        banksScanned: 0,
        filesFound: 0,
        filesProcessed: 0,
        errors: []
      };

      // Process each bank
      for (const bank of banksResult.rows) {
        try {
          console.log(`\n🏦 Checking bank: ${bank.name} (${bank.code})`);
          const bankResult = await this.scanBank(bank);
          
          results.banksScanned++;
          results.filesFound += bankResult.filesFound;
          results.filesProcessed += bankResult.filesProcessed;
          
          if (bankResult.errors.length > 0) {
            results.errors.push(...bankResult.errors);
          }
        } catch (error) {
          console.error(`❌ Error processing bank ${bank.name}:`, error.message);
          results.errors.push({
            bank: bank.name,
            error: error.message
          });
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('📊 Scan Summary:');
      console.log(`   Banks scanned: ${results.banksScanned}/${results.totalBanks}`);
      console.log(`   Files found: ${results.filesFound}`);
      console.log(`   Files processed: ${results.filesProcessed}`);
      console.log(`   Errors: ${results.errors.length}`);
      console.log('='.repeat(60) + '\n');

      // Log scan results to database
      await this.logScanResults(results);

      return results;
    } catch (error) {
      console.error('❌ Fatal error during scan:', error);
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan a specific bank for new files
   */
  async scanBank(bank) {
    const result = {
      filesFound: 0,
      filesProcessed: 0,
      errors: []
    };

    try {
      // Get list of files in the source directory
      const files = await this.listFilesInDirectory(bank.source_url);
      result.filesFound = files.length;

      if (files.length === 0) {
        console.log(`   ℹ️  No new files found for ${bank.name}`);
        return result;
      }

      console.log(`   📁 Found ${files.length} file(s) for ${bank.name}`);

      // Process each file
      for (const fileName of files) {
        try {
          // Check if file was already processed
          const alreadyProcessed = await this.isFileAlreadyProcessed(
            bank.id,
            fileName
          );

          if (alreadyProcessed) {
            console.log(`   ⏭️  Skipping ${fileName} (already processed)`);
            continue;
          }

          console.log(`   🔄 Processing ${fileName}...`);

          // Process the file
          const fileUrl = `${bank.source_url}/${fileName}`;
          const processResult = await this.csvProcessor.processFileFromURL(
            bank.id,
            fileUrl,
            fileName
          );

          if (processResult.success) {
            console.log(`   ✅ Successfully processed ${fileName}`);
            
            // Save validated records
            if (processResult.validRows.length > 0) {
              await this.csvProcessor.saveValidatedRecords(
                bank.id,
                processResult.validRows,
                fileName
              );
            }

            // Move file to destination
            await this.csvProcessor.moveFileToDestination(
              bank.source_url,
              bank.destination_url,
              fileName
            );

            // Archive original file
            await this.csvProcessor.archiveOldFile(
              bank.source_url,
              bank.old_url,
              fileName
            );

            result.filesProcessed++;
          } else {
            console.log(`   ⚠️  Processed ${fileName} with errors`);
            result.errors.push({
              bank: bank.name,
              file: fileName,
              error: 'Validation errors detected',
              details: processResult.errors
            });
          }
        } catch (error) {
          console.error(`   ❌ Error processing ${fileName}:`, error.message);
          result.errors.push({
            bank: bank.name,
            file: fileName,
            error: error.message
          });
        }
      }
    } catch (error) {
      throw new Error(`Failed to scan bank ${bank.name}: ${error.message}`);
    }

    return result;
  }

  /**
   * List files in a directory
   * Supports multiple protocols: HTTP, file system, FTP (to be implemented)
   */
  async listFilesInDirectory(sourceUrl) {
    try {
      // Determine the protocol
      if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
        return await this.listFilesHTTP(sourceUrl);
      } else if (sourceUrl.startsWith('file://') || path.isAbsolute(sourceUrl)) {
        return await this.listFilesFileSystem(sourceUrl);
      } else if (sourceUrl.startsWith('ftp://') || sourceUrl.startsWith('sftp://')) {
        return await this.listFilesFTP(sourceUrl);
      } else {
        throw new Error(`Unsupported protocol in URL: ${sourceUrl}`);
      }
    } catch (error) {
      console.error(`Error listing files at ${sourceUrl}:`, error.message);
      return [];
    }
  }

  /**
   * List files via HTTP
   * Supports:
   * - REST API endpoints that return file lists
   * - HTML directory listings (basic parsing)
   */
  async listFilesHTTP(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'Accept': 'application/json, text/html'
        }
      });

      // If response is JSON with files array
      if (response.headers['content-type']?.includes('application/json')) {
        if (Array.isArray(response.data)) {
          return response.data.filter(f => f.endsWith('.csv'));
        }
        if (response.data.files && Array.isArray(response.data.files)) {
          return response.data.files.filter(f => f.endsWith('.csv'));
        }
      }

      // If response is HTML, try to parse directory listing
      if (response.headers['content-type']?.includes('text/html')) {
        return this.parseHTMLDirectoryListing(response.data);
      }

      return [];
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`   ℹ️  Directory not found: ${url}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Parse HTML directory listing to extract CSV files
   */
  parseHTMLDirectoryListing(html) {
    const files = [];
    // Basic regex to find .csv files in href attributes
    const csvRegex = /href=["']([^"']*\.csv)["']/gi;
    let match;

    while ((match = csvRegex.exec(html)) !== null) {
      const fileName = match[1].split('/').pop();
      if (fileName && !files.includes(fileName)) {
        files.push(fileName);
      }
    }

    return files;
  }

  /**
   * List files in local file system
   */
  async listFilesFileSystem(dirPath) {
    try {
      // Remove file:// prefix if present
      const cleanPath = dirPath.replace('file://', '');

      if (!fs.existsSync(cleanPath)) {
        console.log(`   ℹ️  Directory not found: ${cleanPath}`);
        return [];
      }

      const files = fs.readdirSync(cleanPath);
      return files.filter(f => f.endsWith('.csv'));
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error.message);
      return [];
    }
  }

  /**
   * List files via FTP/SFTP
   * Note: Requires FTP client library (not included by default)
   */
  async listFilesFTP(url) {
    // TODO: Implement FTP/SFTP file listing
    // You would need to install and use libraries like:
    // - 'ftp' for FTP
    // - 'ssh2-sftp-client' for SFTP
    
    console.warn('⚠️  FTP/SFTP support not yet implemented');
    console.warn('   Install required libraries: npm install ssh2-sftp-client');
    
    return [];
  }

  /**
   * Check if a file has already been processed
   */
  async isFileAlreadyProcessed(bankId, fileName) {
    const query = `
      SELECT id, status FROM file_logs 
      WHERE bank_id = $1 
        AND file_name = $2 
      ORDER BY processed_at DESC
      LIMIT 1
    `;
    
    const result = await db.query(query, [bankId, fileName]);
    
    if (result.rows.length === 0) {
      return false;
    }

    // Consider file as processed if it was successful or is currently processing
    const status = result.rows[0].status;
    return status === 'success' || status === 'processing';
  }

  /**
   * Log scan results to database
   */
  async logScanResults(results) {
    try {
      const query = `
        INSERT INTO scan_logs 
          (scan_time, banks_scanned, files_found, files_processed, errors_count, error_details)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;

      await db.query(query, [
        this.lastScanTime,
        results.banksScanned,
        results.filesFound,
        results.filesProcessed,
        results.errors.length,
        JSON.stringify(results.errors)
      ]);
    } catch (error) {
      // Table might not exist, create it
      if (error.code === '42P01') {
        await this.createScanLogsTable();
        // Retry
        await this.logScanResults(results);
      } else {
        console.error('Error logging scan results:', error);
      }
    }
  }

  /**
   * Create scan_logs table if it doesn't exist
   */
  async createScanLogsTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS scan_logs (
        id SERIAL PRIMARY KEY,
        scan_time TIMESTAMP NOT NULL,
        banks_scanned INTEGER DEFAULT 0,
        files_found INTEGER DEFAULT 0,
        files_processed INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0,
        error_details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_scan_logs_time ON scan_logs(scan_time);
    `;

    await db.query(query);
    console.log('✅ Created scan_logs table');
  }

  /**
   * Get scanning statistics
   */
  async getStats() {
    return {
      isScanning: this.isScanning,
      lastScanTime: this.lastScanTime,
      nextScanEstimate: this.estimateNextScan()
    };
  }

  /**
   * Estimate next scan time based on cron schedule
   */
  estimateNextScan() {
    if (!this.lastScanTime) return null;

    // Get cron interval from environment (default: 5 minutes)
    const schedule = process.env.CRON_SCHEDULE || '*/5 * * * *';
    
    // Parse interval from schedule (simplified for */X pattern)
    const match = schedule.match(/\*\/(\d+)/);
    if (match) {
      const intervalMinutes = parseInt(match[1]);
      const nextScan = new Date(this.lastScanTime);
      nextScan.setMinutes(nextScan.getMinutes() + intervalMinutes);
      return nextScan;
    }

    return null;
  }
}

module.exports = FileScanner;
