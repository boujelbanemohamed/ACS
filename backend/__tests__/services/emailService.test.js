jest.mock('../../config/database');

const db = require('../../config/database');
const emailServiceSingleton = require('../../services/emailService');
const { EmailService } = require('../../services/emailService');

describe('EmailService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailService();
  });

  describe('loadConfig', () => {
    it('returns null when no config found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const config = await service.loadConfig();
      expect(config).toBeNull();
    });

    it('returns config when found', async () => {
      const mockConfig = { host: 'smtp.test.com', port: 587, secure: false, user: 'u', pass: 'p', from_email: 'a@b.com', from_name: 'Test', enabled: true };
      db.query.mockResolvedValueOnce({ rows: [mockConfig] });
      const config = await service.loadConfig();
      expect(config.host).toBe('smtp.test.com');
    });
  });

  describe('sendEmail', () => {
    it('returns error when no SMTP config', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.sendEmail('test@test.com', 'Subject', '<p>Body</p>');
      expect(result.success).toBe(false);
    });

    it('returns error when SMTP disabled', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ host: 'smtp.test.com', port: 587, secure: false, user: 'u', pass: 'p', from_email: 'a@b.com', from_name: 'Test', enabled: false }] });
      const result = await service.sendEmail('test@test.com', 'Subject', '<p>Body</p>');
      expect(result.success).toBe(false);
    });
  });

  describe('generateReportHtml', () => {
    it('returns HTML string with stats', () => {
      const stats = {
        csv: { totalRecords: 10, enrollmentSuccess: 5, enrollmentError: 2, enrollmentPending: 3 },
        files: { totalFiles: 3, successfulFiles: 2, failedFiles: 1 },
        xml: { totalXml: 5, successXml: 4, failedXml: 1 }
      };
      const html = service.generateReportHtml('Bank A', stats);
      expect(html).toContain('10');
      expect(html).toContain('Bank A');
      expect(html).toContain('3');
    });

    it('returns HTML even with empty stats', () => {
      const stats = {
        csv: { totalRecords: 0, enrollmentSuccess: 0, enrollmentError: 0, enrollmentPending: 0 },
        files: { totalFiles: 0, successfulFiles: 0, failedFiles: 0 },
        xml: { totalXml: 0, successXml: 0, failedXml: 0 }
      };
      const html = service.generateReportHtml('Test Bank', stats);
      expect(html).toContain('Test Bank');
      expect(html).toContain('0');
    });
  });

  describe('sendAllDailyReports', () => {
    it('returns results array when banks exist', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }, { id: 2, name: 'Bank B', code: 'BB', is_active: true }] })
        .mockResolvedValue({ rows: [] });

      const result = await service.sendAllDailyReports(new Date());
      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('returns empty results when no banks', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.sendAllDailyReports(new Date());
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });
});
