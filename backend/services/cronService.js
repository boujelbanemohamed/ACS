const cron = require('node-cron');
const db = require('../config/database');
const fileScanner = require('./fileScanner');
const enrollmentService = require('./enrollmentService');
const emailService = require('./emailService');
const fs = require('fs').promises;
const path = require('path');

class CronService {
  constructor() {
    this.currentTask = null;
    this.dailyReportTask = null;
    this.isScanning = false;
    this.lastScanTime = null;
    this.currentSchedule = process.env.CRON_SCHEDULE || '*/5 * * * *';
    this.dailyReportSchedule = '0 8 * * *'; // Tous les jours a 8h
    this.enabled = true;
    this.dailyReportEnabled = true;
  }

  async init() {
    // Load settings from database
    try {
      const result = await db.query("SELECT * FROM settings WHERE key IN ('cron_schedule', 'cron_enabled')");
      result.rows.forEach(row => {
        if (row.key === 'cron_schedule' && row.value) {
          this.currentSchedule = row.value;
        }
        if (row.key === 'cron_enabled') {
          this.enabled = row.value === 'true';
        }
      });
    } catch (error) {
      console.log('Settings table not ready, using defaults');
    }

    this.startScheduledTask();
    this.startDailyReportTask();
  }

  startScheduledTask() {
    // Stop existing task if any
    if (this.currentTask) {
      this.currentTask.stop();
      this.currentTask = null;
    }

    if (!this.enabled) {
      console.log('🔴 Cron scanner is disabled');
      return;
    }

    if (!cron.validate(this.currentSchedule)) {
      console.error('Invalid cron schedule:', this.currentSchedule);
      return;
    }

    console.log(`🕐 Starting cron scheduler with schedule: ${this.currentSchedule}`);
    
    this.currentTask = cron.schedule(this.currentSchedule, async () => {
      await this.runScan();
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Africa/Tunis'
    });

    console.log('✅ Cron scheduler started successfully');
  }

  async updateSchedule(newSchedule) {
    if (!cron.validate(newSchedule)) {
      throw new Error('Invalid cron schedule format');
    }

    this.currentSchedule = newSchedule;
    this.startScheduledTask();
    console.log(`🔄 Cron schedule updated to: ${newSchedule}`);
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    
    // Update in database
    await db.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('cron_enabled', $1, CURRENT_TIMESTAMP)
      ON CONFLICT (key) 
      DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
    `, [enabled.toString()]);

    if (enabled) {
      this.startScheduledTask();
    } else if (this.currentTask) {
      this.currentTask.stop();
      this.currentTask = null;
    }
    
    console.log(`🔄 Cron scanner ${enabled ? 'enabled' : 'disabled'}`);
  }

  async runScan() {
    if (this.isScanning) {
      console.log('⚠️ Scan already in progress, skipping...');
      return null;
    }

    this.isScanning = true;
    this.lastScanTime = new Date();
    
    console.log('🔍 Starting scheduled scan...');
    
    const scanResult = {
      startTime: new Date(),
      banksScanned: 0,
      filesFound: 0,
      filesProcessed: 0,
      enrollmentFilesFound: 0,
      enrollmentFilesProcessed: 0,
      errors: [],
      bankDetails: []
    };

    try {
      // Get all active banks
      const banksResult = await db.query('SELECT * FROM banks WHERE is_active = true');
      const banks = banksResult.rows;
      
      scanResult.banksScanned = banks.length;

      for (const bank of banks) {
        try {
          const result = await fileScanner.scanBankDirectory(bank);
          scanResult.filesFound += result.filesFound;
          scanResult.filesProcessed += result.filesProcessed;
          if (result.errors && result.errors.length > 0) {
            scanResult.errors.push(...result.errors);
          }
        } catch (error) {
          console.error(`Error scanning bank ${bank.name}:`, error);
          scanResult.errors.push({
            bank: bank.name,
            error: error.message
          });
        }
      }

      // Log the scan
      await this.logScan(scanResult);

      console.log(`✅ Scan completed: ${scanResult.filesProcessed}/${scanResult.filesFound} files processed`);
    } catch (error) {
      console.error('Scan error:', error);
      scanResult.errors.push({ error: error.message });
    } finally {
      this.isScanning = false;
    }

    return scanResult;
  }

  async logScan(result) {
    try {
      await db.query(`
        INSERT INTO scan_logs (scan_time, banks_scanned, files_found, files_processed, enrollment_files_found, enrollment_files_processed, errors_count, errors_detail, bank_details)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        result.startTime,
        result.banksScanned,
        result.filesFound,
        result.filesProcessed,
        result.enrollmentFilesFound || 0,
        result.enrollmentFilesProcessed || 0,
        result.errors.length,
        JSON.stringify(result.errors),
        JSON.stringify(result.bankDetails || [])
      ]);
    } catch (error) {
      console.error('Error logging scan:', error);
    }
  }

  async scanEnrollmentReports(bank) {
    const result = {
      filesFound: 0,
      filesProcessed: 0,
      errors: []
    };

    // Vérifier si la banque a une URL de rapport d'enrôlement configurée
    if (!bank.enrollment_report_url) {
      return result;
    }

    try {
      // Vérifier si le dossier existe
      const dirPath = bank.enrollment_report_url;
      
      try {
        await fs.access(dirPath);
      } catch {
        // Le dossier n'existe pas, on le crée
        await fs.mkdir(dirPath, { recursive: true });
        return result;
      }

      // Lire les fichiers du dossier
      const files = await fs.readdir(dirPath);
      const xmlFiles = files.filter(f => f.toLowerCase().endsWith('.xml') && f.includes('_out'));
      
      result.filesFound = xmlFiles.length;

      for (const fileName of xmlFiles) {
        const filePath = path.join(dirPath, fileName);
        
        try {
          // Vérifier si ce fichier a déjà été traité
          const existingLog = await db.query(
            'SELECT id FROM enrollment_logs WHERE file_name = $1 AND bank_id = $2',
            [fileName, bank.id]
          );
          
          if (existingLog.rows.length > 0) {
            // Fichier déjà traité, on passe
            continue;
          }
          
          // Traiter le fichier
          console.log('Processing enrollment report: ' + fileName + ' for bank ' + bank.name);
          
          const processResult = await enrollmentService.processEnrollmentReport(filePath, bank.id, fileName);
          
          if (processResult.success) {
            result.filesProcessed++;
            
            // Déplacer le fichier vers un dossier "processed"
            const processedDir = path.join(dirPath, 'processed');
            await fs.mkdir(processedDir, { recursive: true });
            
            const newPath = path.join(processedDir, fileName);
            await fs.rename(filePath, newPath);
            
            console.log('Enrollment report processed: ' + fileName + ' - ' + processResult.message);
          } else {
            result.errors.push({
              file: fileName,
              error: processResult.message
            });
          }
        } catch (fileError) {
          console.error('Error processing enrollment file ' + fileName + ':', fileError);
          result.errors.push({
            file: fileName,
            error: fileError.message
          });
        }
      }
    } catch (error) {
      console.error('Error scanning enrollment directory for bank ' + bank.name + ':', error);
      result.errors.push({
        error: error.message
      });
    }

    return result;
  }

  startDailyReportTask() {
    if (this.dailyReportTask) {
      this.dailyReportTask.stop();
      this.dailyReportTask = null;
    }

    if (!this.dailyReportEnabled) {
      console.log('Daily report cron is disabled');
      return;
    }

    console.log('Starting daily report cron with schedule: ' + this.dailyReportSchedule);
    
    this.dailyReportTask = cron.schedule(this.dailyReportSchedule, async () => {
      console.log('Sending daily reports to all banks...');
      try {
        const emailService = require('./emailService');
        const result = await emailService.sendAllDailyReports(new Date());
        console.log('Daily reports sent:', result);
      } catch (error) {
        console.error('Error sending daily reports:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TIMEZONE || 'Africa/Tunis'
    });

    console.log('Daily report cron started successfully');
  }

  getStatus() {
    const cronDescription = this.describeCron(this.currentSchedule);
    
    return {
      isScanning: this.isScanning,
      enabled: this.enabled,
      cronSchedule: this.currentSchedule,
      cronDescription: cronDescription,
      lastScanTime: this.lastScanTime,
      nextScanEstimate: this.getNextScanEstimate(),
      timezone: process.env.TIMEZONE || 'Africa/Tunis'
    };
  }

  describeCron(schedule) {
    const descriptions = {
      '*/1 * * * *': 'Toutes les minutes',
      '*/5 * * * *': 'Toutes les 5 minutes',
      '*/10 * * * *': 'Toutes les 10 minutes',
      '*/15 * * * *': 'Toutes les 15 minutes',
      '*/30 * * * *': 'Toutes les 30 minutes',
      '0 * * * *': 'Toutes les heures',
      '0 */2 * * *': 'Toutes les 2 heures',
      '0 */6 * * *': 'Toutes les 6 heures',
      '0 0 * * *': 'Tous les jours à minuit',
      '0 8 * * *': 'Tous les jours à 8h',
      '0 8 * * 1-5': 'Lundi-Vendredi à 8h'
    };

    return descriptions[schedule] || schedule;
  }

  getNextScanEstimate() {
    if (!this.enabled || !this.currentTask) return null;
    
    // Simple estimation based on schedule
    const now = new Date();
    const parts = this.currentSchedule.split(' ');
    
    if (parts[0].startsWith('*/')) {
      const minutes = parseInt(parts[0].substring(2));
      const nextRun = new Date(now);
      nextRun.setMinutes(Math.ceil(now.getMinutes() / minutes) * minutes);
      nextRun.setSeconds(0);
      if (nextRun <= now) {
        nextRun.setMinutes(nextRun.getMinutes() + minutes);
      }
      return nextRun;
    }
    
    return null;
  }
}

module.exports = new CronService();
