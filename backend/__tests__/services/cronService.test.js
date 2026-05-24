jest.mock('node-cron');
jest.mock('../../config/database');
jest.mock('../../services/fileScanner');
jest.mock('../../services/enrollmentService');
jest.mock('../../services/emailService');
jest.mock('../../utils/remoteFileService');
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      access: jest.fn(),
      readdir: jest.fn(),
      mkdir: jest.fn(),
      rename: jest.fn(),
    }
  };
});

const cron = require('node-cron');
const db = require('../../config/database');
const FileScanner = require('../../services/fileScanner');
const enrollmentService = require('../../services/enrollmentService');
const emailService = require('../../services/emailService');
const remoteFileService = require('../../utils/remoteFileService');
const fs = require('fs').promises;

const CronService = require('../../services/cronService');

describe('CronService', () => {
  let cronService;

  beforeEach(() => {
    jest.clearAllMocks();
    cron.schedule.mockReturnValue({ stop: jest.fn() });
    cron.validate.mockReturnValue(true);
    db.query.mockResolvedValue({ rows: [] });
    FileScanner.mockClear();
    cronService = new CronService.CronService();
  });

  describe('constructor', () => {
    it('sets default values', () => {
      expect(cronService.schedule).toBe('*/5 * * * *');
      expect(cronService.enabled).toBe(true);
      expect(cronService.isScanning).toBe(false);
      expect(cronService.lastScanTime).toBeNull();
    });

    it('reads env overrides', () => {
      const oldSchedule = process.env.CRON_SCHEDULE;
      const oldReport = process.env.REPORT_CRON;
      process.env.CRON_SCHEDULE = '0 * * * *';
      process.env.REPORT_CRON = '0 9 * * *';
      const svc = new CronService.CronService();
      expect(svc.schedule).toBe('0 * * * *');
      expect(svc.dailyReportSchedule).toBe('0 9 * * *');
      if (oldSchedule === undefined) delete process.env.CRON_SCHEDULE; else process.env.CRON_SCHEDULE = oldSchedule;
      if (oldReport === undefined) delete process.env.REPORT_CRON; else process.env.REPORT_CRON = oldReport;
    });
  });

  describe('init()', () => {
    it('starts scan and report tasks with default settings', async () => {
      const scanSpy = jest.spyOn(cronService, 'startScanTask').mockImplementation(() => {});
      const reportSpy = jest.spyOn(cronService, 'startReportTask').mockImplementation(() => {});
      await cronService.init();
      expect(scanSpy).toHaveBeenCalled();
      expect(reportSpy).toHaveBeenCalled();
    });

    it('loads cron settings from database if available', async () => {
      db.query.mockResolvedValue({
        rows: [
          { key: 'cron_schedule', value: '0 */2 * * *' },
          { key: 'cron_enabled', value: 'false' }
        ]
      });
      await cronService.init();
      expect(cronService.schedule).toBe('0 */2 * * *');
      expect(cronService.enabled).toBe(false);
    });

    it('uses defaults when db query fails', async () => {
      db.query.mockRejectedValue(new Error('DB error'));
      const scanSpy = jest.spyOn(cronService, 'startScanTask').mockImplementation(() => {});
      const reportSpy = jest.spyOn(cronService, 'startReportTask').mockImplementation(() => {});
      await cronService.init();
      expect(scanSpy).toHaveBeenCalled();
      expect(reportSpy).toHaveBeenCalled();
    });
  });

  describe('startScanTask()', () => {
    it('stops existing task before creating new one', () => {
      const stopMock = jest.fn();
      cronService.scanTask = { stop: stopMock };
      cronService.startScanTask();
      expect(stopMock).toHaveBeenCalled();
      expect(cron.schedule).toHaveBeenCalled();
    });

    it('does not start if disabled', () => {
      cronService.enabled = false;
      cronService.startScanTask();
      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('does not start if cron schedule is invalid', () => {
      cron.validate.mockReturnValue(false);
      cronService.startScanTask();
      expect(cron.schedule).not.toHaveBeenCalled();
    });
  });

  describe('updateSchedule()', () => {
    it('updates schedule and restarts task', () => {
      const spy = jest.spyOn(cronService, 'startScanTask').mockImplementation(() => {});
      cronService.updateSchedule('0 * * * *');
      expect(cronService.schedule).toBe('0 * * * *');
      expect(spy).toHaveBeenCalled();
    });

    it('throws on invalid schedule', async () => {
      cron.validate.mockReturnValue(false);
      await expect(cronService.updateSchedule('invalid')).rejects.toThrow('Invalid cron schedule');
    });
  });

  describe('setEnabled()', () => {
    it('sets enabled and updates database', async () => {
      cronService.startScanTask = jest.fn();
      cronService.scanTask = { stop: jest.fn() };
      await cronService.setEnabled(true);
      expect(cronService.enabled).toBe(true);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO settings'), ['true']);
    });

    it('stops scan task when disabled', async () => {
      const stopMock = jest.fn();
      cronService.scanTask = { stop: stopMock };
      await cronService.setEnabled(false);
      expect(stopMock).toHaveBeenCalled();
      expect(cronService.scanTask).toBeNull();
    });
  });

  describe('run()', () => {
    it('returns null if already scanning', async () => {
      cronService.isScanning = true;
      const result = await cronService.run();
      expect(result).toBeNull();
    });

    it('scans active banks and processes files', async () => {
      const mockBank = { id: 1, name: 'Test Bank', is_active: true, enrollment_report_url: null, source_url: '/test' };
      cronService.scanner.scanBank.mockResolvedValue({ filesFound: 3, filesProcessed: 2, errors: [] });
      db.query.mockResolvedValue({ rows: [mockBank] });
      cronService.logResult = jest.fn();

      const result = await cronService.run();
      expect(result.banksScanned).toBe(1);
      expect(result.filesFound).toBe(3);
      expect(result.filesProcessed).toBe(2);
      expect(cronService.isScanning).toBe(false);
    });

    it('handles scan errors gracefully', async () => {
      cronService.scanner.scanBank.mockRejectedValue(new Error('Scan failed'));
      db.query.mockResolvedValue({ rows: [{ id: 1, name: 'Bad Bank', is_active: true, enrollment_report_url: null }] });
      cronService.logResult = jest.fn();

      const result = await cronService.run();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(cronService.isScanning).toBe(false);
    });

    it('handles enrollment scan failure gracefully', async () => {
      const bank = { id: 1, name: 'Enroll Bank', is_active: true, enrollment_report_url: 'file:///reports' };
      db.query.mockResolvedValue({ rows: [bank] });
      jest.spyOn(cronService, 'scanEnrollmentReports').mockRejectedValue(new Error('Enroll fail'));
      cronService.logResult = jest.fn();

      const result = await cronService.run();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Enrollment scan');
    });

    it('handles outer catch on db query failure', async () => {
      db.query.mockRejectedValue(new Error('DB fail'));
      cronService.logResult = jest.fn();

      const result = await cronService.run();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(cronService.isScanning).toBe(false);
    });
  });

  describe('scanEnrollmentReports()', () => {
    it('returns empty result if no enrollment_report_url', async () => {
      const result = await cronService.scanEnrollmentReports({ enrollment_report_url: null });
      expect(result.filesFound).toBe(0);
    });

    it('scans local directory for XML files', async () => {
      const bank = { id: 1, name: 'Test', enrollment_report_url: 'file:///reports' };
      remoteFileService.isRemote.mockReturnValue(false);
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue(['report1.xml', 'report2.xml', 'notes.txt']);
      db.query.mockResolvedValue({ rows: [] });
      enrollmentService.processEnrollmentReport.mockResolvedValue({ success: true, successCount: 2, errorCount: 0 });

      const result = await cronService.scanEnrollmentReports(bank);
      expect(result.filesFound).toBe(2);
      expect(result.filesProcessed).toBe(2);
    });

    it('skips already processed enrollment files', async () => {
      const bank = { id: 1, name: 'Test', enrollment_report_url: 'file:///reports' };
      remoteFileService.isRemote.mockReturnValue(false);
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue(['report1.xml']);
      db.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await cronService.scanEnrollmentReports(bank);
      expect(result.filesFound).toBe(1);
      expect(result.filesProcessed).toBe(0);
    });

    it('creates directory if it does not exist', async () => {
      const bank = { id: 1, name: 'Test', enrollment_report_url: 'file:///newreports' };
      remoteFileService.isRemote.mockReturnValue(false);
      fs.access.mockRejectedValue(new Error('ENOENT'));
      fs.mkdir.mockResolvedValue();

      const result = await cronService.scanEnrollmentReports(bank);
      expect(fs.mkdir).toHaveBeenCalled();
      expect(result.filesFound).toBe(0);
    });

    it('handles SFTP remote enrollment', async () => {
      const bank = { id: 1, name: 'SFTP Bank', enrollment_report_url: 'sftp://server/reports' };
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.listFiles.mockResolvedValue(['r1.xml', 'r2.xml']);
      remoteFileService.readFile.mockResolvedValue('<xml>data</xml>');
      db.query.mockResolvedValue({ rows: [] });
      enrollmentService.processEnrollmentReportFromContent.mockResolvedValue({ success: true, successCount: 1, errorCount: 0 });

      const result = await cronService.scanEnrollmentReports(bank);
      expect(result.filesFound).toBe(2);
      expect(result.filesProcessed).toBe(2);
      expect(remoteFileService.moveFile).toHaveBeenCalled();
    });

    it('handles processResult success=false', async () => {
      const bank = { id: 1, name: 'Test', enrollment_report_url: 'file:///reports' };
      remoteFileService.isRemote.mockReturnValue(false);
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue(['report1.xml']);
      db.query.mockResolvedValue({ rows: [] });
      enrollmentService.processEnrollmentReport.mockResolvedValue({ success: false, message: 'Invalid data' });

      const result = await cronService.scanEnrollmentReports(bank);
      expect(result.filesFound).toBe(1);
      expect(result.filesProcessed).toBe(0);
      expect(result.errors.length).toBe(1);
    });

    it('handles inner file processing error', async () => {
      const bank = { id: 1, name: 'Test', enrollment_report_url: 'file:///reports' };
      remoteFileService.isRemote.mockReturnValue(false);
      fs.access.mockResolvedValue();
      fs.readdir.mockResolvedValue(['report1.xml']);
      db.query.mockResolvedValue({ rows: [] });
      enrollmentService.processEnrollmentReport.mockRejectedValue(new Error('Processing error'));

      const result = await cronService.scanEnrollmentReports(bank);
      expect(result.filesFound).toBe(1);
      expect(result.filesProcessed).toBe(0);
      expect(result.errors.length).toBe(1);
    });

    it('handles outer catch on directory listing failure', async () => {
      const bank = { id: 1, name: 'Test', enrollment_report_url: 'file:///reports' };
      remoteFileService.isRemote.mockReturnValue(false);
      fs.access.mockResolvedValue();
      fs.readdir.mockRejectedValue(new Error('Permission denied'));

      const result = await cronService.scanEnrollmentReports(bank);
      expect(result.filesFound).toBe(0);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('logBankResult()', () => {
    it('inserts scan log entry', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const bank = { id: 1, name: 'Test Bank' };
      const startTime = new Date();
      const bankResult = { filesFound: 5, filesProcessed: 4, enrollmentProcessed: 1, errors: ['err1'] };
      await cronService.logBankResult(bank, startTime, bankResult);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO scan_logs'), expect.any(Array));
    });

    it('creates table on 42P01 error and retries', async () => {
      const bank = { id: 1, name: 'Test Bank' };
      const startTime = new Date();
      const bankResult = { filesFound: 0, filesProcessed: 0, enrollmentProcessed: 0, errors: [] };
      db.query
        .mockRejectedValueOnce({ code: '42P01' })
        .mockResolvedValueOnce({ rows: [] });
      cronService.createTable = jest.fn().mockResolvedValue();
      await cronService.logBankResult(bank, startTime, bankResult);
      expect(cronService.createTable).toHaveBeenCalled();
    });

    it('logs other db errors to console', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const dbError = new Error('Some error');
      Object.defineProperty(dbError, 'code', { value: null });
      db.query.mockReset();
      db.query.mockImplementation(() => Promise.reject(dbError));
      const bank = { id: 1, name: 'Test Bank' };
      const startTime = new Date();
      const bankResult = { filesFound: 0, filesProcessed: 0, enrollmentProcessed: 0, errors: [] };
      await cronService.logBankResult(bank, startTime, bankResult);
      expect(consoleSpy).toHaveBeenCalledWith('Log error:', dbError);
    });
  });

  describe('startReportTask()', () => {
    it('schedules daily report cron', () => {
      cronService.startReportTask();
      expect(cron.schedule).toHaveBeenCalledWith(
        '0 8 * * *',
        expect.any(Function),
        expect.objectContaining({ scheduled: true })
      );
    });

    it('does not start if daily reports disabled', () => {
      cronService.dailyReportEnabled = false;
      cronService.startReportTask();
      expect(cron.schedule).not.toHaveBeenCalled();
    });

    it('does not start if report schedule is invalid', () => {
      cron.validate.mockReturnValue(false);
      cronService.startReportTask();
      expect(cron.schedule).not.toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('returns current status object', () => {
      cronService.isScanning = true;
      cronService.enabled = true;
      cronService.schedule = '*/5 * * * *';
      cronService.lastScanTime = new Date('2026-01-01T00:00:00Z');
      const status = cronService.getStatus();
      expect(status.isScanning).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.schedule).toBe('*/5 * * * *');
      expect(status.lastScan).toEqual(new Date('2026-01-01T00:00:00Z'));
    });
  });

  describe('describeCron()', () => {
    it('returns human readable labels', () => {
      expect(cronService.describeCron('*/1 * * * *')).toBe('Every minute');
      expect(cronService.describeCron('*/5 * * * *')).toBe('Every 5 min');
      expect(cronService.describeCron('0 8 * * 1-5')).toBe('Weekdays at 8h');
    });

    it('returns raw string for unknown schedules', () => {
      expect(cronService.describeCron('custom_schedule')).toBe('custom_schedule');
    });
  });

  describe('estimateNextScan()', () => {
    it('returns null if disabled or no last scan', () => {
      cronService.enabled = false;
      expect(cronService.estimateNextScan()).toBeNull();
      cronService.enabled = true;
      cronService.lastScanTime = null;
      expect(cronService.estimateNextScan()).toBeNull();
    });

    it('calculates next scan time from interval', () => {
      cronService.enabled = true;
      cronService.lastScanTime = new Date('2026-01-01T00:00:00Z');
      cronService.schedule = '*/10 * * * *';
      const next = cronService.estimateNextScan();
      expect(next.getMinutes()).toBe(10);
    });

    it('returns null for non-interval schedules', () => {
      cronService.enabled = true;
      cronService.lastScanTime = new Date();
      cronService.schedule = '0 8 * * *';
      expect(cronService.estimateNextScan()).toBeNull();
    });
  });
});
