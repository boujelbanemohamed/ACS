jest.mock('../../config/database');

const db = require('../../config/database');
const { CronService } = require('../../services/cronService');

describe('CronService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates default schedules from env', () => {
      process.env.CRON_SCHEDULE = '*/10 * * * *';
      process.env.REPORT_CRON = '0 9 * * *';
      const service = new CronService();
      expect(service.schedule).toBe('*/10 * * * *');
      expect(service.dailyReportSchedule).toBe('0 9 * * *');
    });

    it('defaults to 5-minute scan when no env', () => {
      delete process.env.CRON_SCHEDULE;
      delete process.env.REPORT_CRON;
      const service = new CronService();
      expect(service.schedule).toBe('*/5 * * * *');
      expect(service.dailyReportSchedule).toBe('0 8 * * *');
    });
  });

  describe('describeCron', () => {
    it('describes every 5 minutes', () => {
      const service = new CronService();
      expect(service.describeCron('*/5 * * * *')).toContain('5');
    });

    it('describes daily at 8 AM', () => {
      const service = new CronService();
      expect(service.describeCron('0 8 * * *')).toContain('8h');
    });

    it('returns the expression for unrecognized pattern', () => {
      const service = new CronService();
      expect(service.describeCron('* * * * *')).toContain('*');
    });
  });

  describe('getStatus', () => {
    it('returns default status before init', () => {
      const service = new CronService();
      const status = service.getStatus();
      expect(status).toHaveProperty('isScanning');
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('schedule');
      expect(status).toHaveProperty('lastScan');
    });
  });

  describe('logResult', () => {
    it('inserts scan result into DB', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const service = new CronService();
      const result = { banksScanned: 2, filesFound: 5, filesProcessed: 3, enrollmentFilesFound: 1, enrollmentFilesProcessed: 1, errors: [] };
      await service.logResult(result);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scan_logs'),
        expect.arrayContaining([2, 5, 3])
      );
    });

    it('creates scan_logs table on 42P01 error', async () => {
      const pgError = new Error('relation does not exist');
      pgError.code = '42P01';
      db.query
        .mockRejectedValueOnce(pgError)
        .mockResolvedValue({ rows: [] });

      const service = new CronService();
      await service.logResult({ banksScanned: 1, filesFound: 0, filesProcessed: 0, enrollmentFilesFound: 0, enrollmentFilesProcessed: 0, errors: [] });

      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('handles unknown DB error', async () => {
      db.query.mockRejectedValueOnce(new Error('connection refused'));

      const service = new CronService();
      await expect(service.logResult({ banksScanned: 1, filesFound: 0, filesProcessed: 0, enrollmentFilesFound: 0, enrollmentFilesProcessed: 0, errors: [] }))
        .resolves.not.toThrow();
    });
  });

  describe('setEnabled', () => {
    it('enables and starts scan', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const service = new CronService();
      service.startScanTask = jest.fn();

      await service.setEnabled(true);

      expect(service.enabled).toBe(true);
      expect(service.startScanTask).toHaveBeenCalled();
    });

    it('disables and stops scan', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const service = new CronService();
      const stopMock = jest.fn();
      service.scanTask = { stop: stopMock };

      await service.setEnabled(false);

      expect(service.enabled).toBe(false);
      expect(stopMock).toHaveBeenCalled();
      expect(service.scanTask).toBeNull();
    });

    it('upserts into settings table', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const service = new CronService();
      service.startScanTask = jest.fn();

      await service.setEnabled(true);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        ['true']
      );
    });
  });

  describe('updateSchedule', () => {
    it('updates and restarts scan task', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const service = new CronService();
      service.startScanTask = jest.fn();

      await service.updateSchedule('0 */2 * * *');

      expect(service.schedule).toBe('0 */2 * * *');
      expect(service.startScanTask).toHaveBeenCalled();
    });

    it('rejects invalid cron expression', async () => {
      const service = new CronService();
      await expect(service.updateSchedule('invalid')).rejects.toThrow();
    });
  });

  describe('run', () => {
    it('guards against concurrent runs', async () => {
      const service = new CronService();
      service.isScanning = true;
      await service.run();
      expect(db.query).not.toHaveBeenCalled();
    });
  });
});
