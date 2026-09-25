const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');
const FileScanner = require('./fileScanner');
const enrollmentService = require('./enrollmentService');
const emailService = require('./emailService');
const remoteFileService = require('../utils/remoteFileService');

// Identifiants de verrous PostgreSQL (un seul processus du cluster exécute la tâche)
const SCAN_LOCK_ID = 7340001;
const REPORT_LOCK_ID = 7340002;
const SETTINGS_SYNC_INTERVAL_MS = parseInt(process.env.CRON_SETTINGS_SYNC_MS, 10) || 60000;

class CronService {
  constructor() {
    this.scanner = new FileScanner();
    this.scanTask = null;
    this.reportTask = null;
    this.isScanning = false;
    this.lastScanTime = null;
    this.schedule = process.env.CRON_SCHEDULE || '*/5 * * * *';
    this.enabled = true;
    this.dailyReportSchedule = process.env.REPORT_CRON || '0 8 * * *';
    this.dailyReportEnabled = process.env.REPORT_ENABLED !== 'false';
    this.settingsTimer = null;
  }

  // Lit la configuration partagée (table settings) ; retourne true si elle a changé
  async loadSettings() {
    const before = JSON.stringify([this.schedule, this.enabled, this.dailyReportSchedule, this.dailyReportEnabled]);
    const result = await db.query(
      "SELECT key, value FROM settings WHERE key IN ('cron_schedule', 'cron_enabled', 'report_schedule', 'report_enabled')"
    );
    (result.rows || []).forEach(row => {
      if (row.key === 'cron_schedule' && row.value && cron.validate(row.value)) this.schedule = row.value;
      if (row.key === 'cron_enabled') this.enabled = row.value === 'true';
      if (row.key === 'report_schedule' && row.value && cron.validate(row.value)) this.dailyReportSchedule = row.value;
      if (row.key === 'report_enabled') this.dailyReportEnabled = row.value === 'true';
    });
    return before !== JSON.stringify([this.schedule, this.enabled, this.dailyReportSchedule, this.dailyReportEnabled]);
  }

  async init() {
    try {
      await this.loadSettings();
    } catch {
      console.log('Using default cron settings');
    }

    this.startScanTask();
    this.startReportTask();
    this.startSettingsSync();
  }

  // Chaque instance (cluster PM2) se resynchronise sur la configuration enregistrée
  startSettingsSync() {
    if (this.settingsTimer) clearInterval(this.settingsTimer);
    this.settingsTimer = setInterval(async () => {
      try {
        const scanBefore = `${this.schedule}|${this.enabled}`;
        const reportBefore = `${this.dailyReportSchedule}|${this.dailyReportEnabled}`;
        if (await this.loadSettings()) {
          if (scanBefore !== `${this.schedule}|${this.enabled}`) this.startScanTask();
          if (reportBefore !== `${this.dailyReportSchedule}|${this.dailyReportEnabled}`) this.startReportTask();
        }
      } catch (error) {
        console.error('Cron settings sync error:', error.message);
      }
    }, SETTINGS_SYNC_INTERVAL_MS);
    if (this.settingsTimer.unref) this.settingsTimer.unref();
  }

  stop() {
    if (this.scanTask) { this.scanTask.stop(); this.scanTask = null; }
    if (this.reportTask) { this.reportTask.stop(); this.reportTask = null; }
    if (this.settingsTimer) { clearInterval(this.settingsTimer); this.settingsTimer = null; }
  }

  async saveSetting(key, value) {
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      [key, String(value)]
    );
  }

  /**
   * Exécute fn sous verrou PostgreSQL : si une autre instance détient le verrou, retourne null.
   * minIntervalMs : ignore l'exécution si la même tâche a démarré il y a moins longtemps
   * (deux instances déclenchées à la même minute).
   */
  async withClusterLock(lockId, lastRunKey, minIntervalMs, fn) {
    if (!db.pool || typeof db.pool.connect !== 'function') return fn();

    const client = await db.pool.connect();
    let locked = false;
    try {
      const lock = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [lockId]);
      locked = lock.rows[0] && lock.rows[0].locked;
      if (!locked) return null;

      const last = await client.query('SELECT value FROM settings WHERE key = $1', [lastRunKey]);
      const lastRun = last.rows[0] ? Date.parse(last.rows[0].value) : NaN;
      if (!Number.isNaN(lastRun) && Date.now() - lastRun < minIntervalMs) return null;

      await client.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [lastRunKey, new Date().toISOString()]
      );

      return await fn();
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
      client.release();
    }
  }

  startScanTask() {
    if (this.scanTask) { this.scanTask.stop(); this.scanTask = null; }
    if (!this.enabled) { console.log('🔴 Scanner disabled'); return; }
    if (!cron.validate(this.schedule)) { console.error('Invalid cron:', this.schedule); return; }

    console.log(`🕐 Scanner scheduled: ${this.schedule}`);
    this.scanTask = cron.schedule(this.schedule, () => this.run(), {
      scheduled: true,
      timezone: process.env.TZ || 'Africa/Tunis'
    });
  }

  async updateSchedule(newSchedule) {
    if (!cron.validate(newSchedule)) throw new Error('Invalid cron schedule');
    this.schedule = newSchedule;
    await this.saveSetting('cron_schedule', newSchedule);
    this.startScanTask();
  }

  async setReportConfig({ schedule, enabled }) {
    if (schedule) {
      if (!cron.validate(schedule)) throw new Error('Invalid cron schedule');
      this.dailyReportSchedule = schedule;
      await this.saveSetting('report_schedule', schedule);
    }
    if (enabled !== undefined) {
      this.dailyReportEnabled = enabled !== false;
      await this.saveSetting('report_enabled', this.dailyReportEnabled);
    }
    this.startReportTask();
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    await db.query(`INSERT INTO settings (key, value, updated_at) VALUES ('cron_enabled', $1, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`, [enabled.toString()]);
    enabled ? this.startScanTask() : (this.scanTask?.stop(), this.scanTask = null);
  }

  async run() {
    if (this.isScanning) { console.log('⚠️ Scan already in progress'); return null; }

    this.isScanning = true;
    try {
      const result = await this.withClusterLock(SCAN_LOCK_ID, 'scan_last_run', 30000, () => this.runScan());
      if (result === null) console.log('⏭️  Scan ignoré : déjà exécuté par une autre instance');
      return result;
    } finally {
      this.isScanning = false;
    }
  }

  async runScan() {
    this.lastScanTime = new Date();
    console.log('🔍 Starting scan...');

    const result = { startTime: new Date(), banksScanned: 0, filesFound: 0, filesProcessed: 0, enrollmentProcessed: 0, errors: [] };

    try {
      const banks = (await db.query('SELECT * FROM banks WHERE is_active = true')).rows;
      result.banksScanned = banks.length;

      for (const bank of banks) {
        const bankResult = { filesFound: 0, filesProcessed: 0, enrollmentProcessed: 0, errors: [] };

        try {
          const enrollmentResult = await this.scanEnrollmentReports(bank);
          bankResult.enrollmentProcessed = enrollmentResult.filesProcessed;
          if (enrollmentResult.errors.length) bankResult.errors.push(...enrollmentResult.errors);
        } catch (error) {
          bankResult.errors.push({ bank: bank.name, error: `Enrollment scan: ${error.message}` });
        }

        try {
          const scanResult = await this.scanner.scanBank(bank);
          bankResult.filesFound = scanResult.filesFound;
          bankResult.filesProcessed = scanResult.filesProcessed;
          if (scanResult.errors.length) bankResult.errors.push(...scanResult.errors);
        } catch (error) {
          bankResult.errors.push({ bank: bank.name, error: error.message });
        }

        result.filesFound += bankResult.filesFound;
        result.filesProcessed += bankResult.filesProcessed;
        result.enrollmentProcessed += bankResult.enrollmentProcessed;
        if (bankResult.errors.length) result.errors.push(...bankResult.errors);

        await this.logBankResult(bank, result.startTime, bankResult);
      }

      result.banksScanned = banks.length;
      console.log(`✅ Scan done: ${result.filesProcessed}/${result.filesFound} files, ${result.enrollmentProcessed} enrollment reports`);
    } catch (error) {
      console.error('Scan error:', error);
      result.errors.push({ error: error.message });
    }

    return result;
  }

  async scanEnrollmentReports(bank) {
    const result = { filesFound: 0, filesProcessed: 0, errors: [] };

    if (!bank.enrollment_report_url) return result;

    const isSftp = remoteFileService.isRemote(bank.enrollment_report_url);

    try {
      let xmlFiles = [];

      if (isSftp) {
        xmlFiles = await remoteFileService.listFiles(bank.enrollment_report_url, '.xml');
      } else {
        let dirPath = bank.enrollment_report_url.replace('file://', '');
        try {
          await fs.access(dirPath);
        } catch {
          await fs.mkdir(dirPath, { recursive: true });
          return result;
        }
        const files = await fs.readdir(dirPath);
        xmlFiles = files.filter(f => f.toLowerCase().endsWith('.xml'));
      }

      result.filesFound = xmlFiles.length;

      for (const fileName of xmlFiles) {
        try {
          const existing = await db.query(
            'SELECT id FROM enrollment_logs WHERE file_name = $1 AND bank_id = $2',
            [fileName, bank.id]
          );

          if (existing.rows.length > 0) continue;

          console.log(`   📄 Processing enrollment report: ${fileName} for ${bank.name}`);

          let processResult;

          if (isSftp) {
            const fileUrl = `${bank.enrollment_report_url}/${fileName}`;
            const xmlContent = await remoteFileService.readFile(fileUrl);
            processResult = await enrollmentService.processEnrollmentReportFromContent(xmlContent, bank.id, fileName);
          } else {
            const dirPath = bank.enrollment_report_url.replace('file://', '');
            const filePath = path.join(dirPath, fileName);
            processResult = await enrollmentService.processEnrollmentReport(filePath, bank.id, fileName);
          }

          if (processResult.success) {
            result.filesProcessed++;

            if (isSftp) {
              const processedUrl = `${bank.enrollment_report_url}/processed/${fileName}`;
              const fileUrl = `${bank.enrollment_report_url}/${fileName}`;
              await remoteFileService.moveFile(fileUrl, processedUrl);
            } else {
              const dirPath = bank.enrollment_report_url.replace('file://', '');
              const filePath = path.join(dirPath, fileName);
              const processedDir = path.join(dirPath, 'processed');
              await fs.mkdir(processedDir, { recursive: true });
              await fs.rename(filePath, path.join(processedDir, fileName));
            }

            console.log(`   ✅ Enrollment processed: ${fileName} - ${processResult.successCount} success, ${processResult.errorCount} errors`);
          } else {
            result.errors.push({ file: fileName, error: processResult.message });
          }
        } catch (fileError) {
          console.error(`   ❌ Error processing enrollment ${fileName}:`, fileError.message);
          result.errors.push({ file: fileName, error: fileError.message });
        }
      }
    } catch (error) {
      console.error(`   ❌ Error scanning enrollment dir for ${bank.name}:`, error.message);
      result.errors.push({ error: error.message });
    }

    return result;
  }

  async logBankResult(bank, startTime, bankResult) {
    try {
      const errorsDetail = bankResult.errors.length > 0 ? JSON.stringify(bankResult.errors.slice(0, 50)) : null;
      await db.query(
        `INSERT INTO scan_logs (scan_time, bank_id, files_found, files_processed, enrollment_files_found, enrollment_files_processed, errors_count, errors_detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [startTime, bank.id, bankResult.filesFound, bankResult.filesProcessed, bankResult.enrollmentProcessed, 0, bankResult.errors.length, errorsDetail]
      );
    } catch (error) {
      if (error.code === '42P01') {
        await this.createTable();
        await this.logBankResult(bank, startTime, bankResult);
      } else {
        console.error('Log error:', error);
      }
    }
  }

  async createTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id SERIAL PRIMARY KEY, scan_time TIMESTAMP NOT NULL,
        bank_id INTEGER, banks_scanned INTEGER DEFAULT 0,
        files_found INTEGER DEFAULT 0, files_processed INTEGER DEFAULT 0,
        enrollment_files_found INTEGER DEFAULT 0, enrollment_files_processed INTEGER DEFAULT 0,
        errors_count INTEGER DEFAULT 0, errors_detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_scan_logs_bank_id ON scan_logs(bank_id);
    `);
    console.log('✅ Created scan_logs table');
  }

  startReportTask() {
    if (this.reportTask) { this.reportTask.stop(); this.reportTask = null; }
    if (!this.dailyReportEnabled) { console.log('🔴 Daily reports disabled'); return; }
    if (!cron.validate(this.dailyReportSchedule)) { console.error('Invalid report cron:', this.dailyReportSchedule); return; }
    this.reportTask = cron.schedule(this.dailyReportSchedule, async () => {
      try {
        // Une seule instance envoie les rapports (pas de doublons en cluster)
        const sent = await this.withClusterLock(REPORT_LOCK_ID, 'report_last_run', 10 * 60 * 1000, async () => {
          console.log('Sending daily reports...');
          await emailService.sendAllDailyReports(new Date());
          return true;
        });
        if (sent === null) console.log('⏭️  Rapports déjà envoyés par une autre instance');
      } catch (e) { console.error('Report error:', e); }
    }, { scheduled: true, timezone: process.env.TZ || 'Africa/Tunis' });
    console.log(`✅ Daily report cron started: ${this.dailyReportSchedule}`);
  }

  startDailyReportTask() {
    this.startReportTask();
  }

  getStatus() {
    return {
      isScanning: this.isScanning,
      enabled: this.enabled,
      schedule: this.schedule,
      description: this.describeCron(this.schedule),
      lastScan: this.lastScanTime,
      nextScan: this.estimateNextScan(),
      timezone: process.env.TZ || 'Africa/Tunis'
    };
  }

  describeCron(s) {
    const labels = {
      '*/1 * * * *': 'Every minute', '*/5 * * * *': 'Every 5 min',
      '*/10 * * * *': 'Every 10 min', '*/15 * * * *': 'Every 15 min',
      '*/30 * * * *': 'Every 30 min', '0 * * * *': 'Every hour',
      '0 */2 * * *': 'Every 2 hours', '0 */6 * * *': 'Every 6 hours',
      '0 0 * * *': 'Every midnight', '0 8 * * *': 'Every day at 8h',
      '0 8 * * 1-5': 'Weekdays at 8h'
    };
    return labels[s] || s;
  }

  estimateNextScan() {
    if (!this.enabled || !this.lastScanTime) return null;
    const match = this.schedule.match(/\*\/(\d+)/);
    if (match) {
      const next = new Date(this.lastScanTime);
      next.setMinutes(next.getMinutes() + parseInt(match[1]));
      return next;
    }
    return null;
  }
}

module.exports = new CronService();
module.exports.CronService = CronService;
