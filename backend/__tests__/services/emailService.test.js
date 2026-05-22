jest.mock('nodemailer');
jest.mock('../../config/database');

const nodemailer = require('nodemailer');
const db = require('../../config/database');
const EmailService = require('../../services/emailService');

describe('EmailService', () => {
  let emailService;

  beforeEach(() => {
    jest.clearAllMocks();
    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
      verify: jest.fn().mockResolvedValue(true),
    });
    emailService = new EmailService.EmailService();
  });

  describe('loadConfig()', () => {
    it('returns smtp config when found', async () => {
      const mockConfig = { host: 'smtp.test.com', port: 587, secure: false, username: 'user', password: 'pass', from_email: 'a@b.com', from_name: 'Test', enabled: true };
      db.query.mockResolvedValue({ rows: [mockConfig] });
      const config = await emailService.loadConfig();
      expect(config).toEqual(mockConfig);
    });

    it('returns null when no config', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const config = await emailService.loadConfig();
      expect(config).toBeNull();
    });

    it('returns null on db error', async () => {
      db.query.mockRejectedValue(new Error('DB fail'));
      const config = await emailService.loadConfig();
      expect(config).toBeNull();
    });
  });

  describe('createTransporter()', () => {
    it('creates nodemailer transporter with config', async () => {
      const mockConfig = { host: 'smtp.test.com', port: 587, secure: false, username: 'user', password: 'pass', from_email: 'a@b.com', from_name: 'Test', enabled: true };
      jest.spyOn(emailService, 'loadConfig').mockResolvedValue(mockConfig);
      const transporter = await emailService.createTransporter();
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com', port: 587, secure: false,
        auth: { user: 'user', pass: 'pass' }
      });
      expect(transporter).toBeDefined();
    });

    it('returns null when smtp not enabled', async () => {
      jest.spyOn(emailService, 'loadConfig').mockResolvedValue({ enabled: false });
      const transporter = await emailService.createTransporter();
      expect(transporter).toBeNull();
    });

    it('returns null when no config', async () => {
      jest.spyOn(emailService, 'loadConfig').mockResolvedValue(null);
      const transporter = await emailService.createTransporter();
      expect(transporter).toBeNull();
    });

    it('creates transporter without auth when no username', async () => {
      const mockConfig = { host: 'smtp.test.com', port: 25, secure: false, username: null, password: null, from_email: 'a@b.com', from_name: 'Test', enabled: true };
      jest.spyOn(emailService, 'loadConfig').mockResolvedValue(mockConfig);
      await emailService.createTransporter();
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com', port: 25, secure: false,
        auth: undefined
      });
    });
  });

  describe('sendEmail()', () => {
    it('sends email successfully', async () => {
      jest.spyOn(emailService, 'loadConfig').mockResolvedValue({
        host: 'smtp.test.com', port: 587, secure: false,
        username: 'user', password: 'pass', from_email: 'a@b.com', from_name: 'Test', enabled: true
      });
      jest.spyOn(emailService, 'createTransporter').mockResolvedValue(nodemailer.createTransport());
      const result = await emailService.sendEmail('to@test.com', 'Subject', '<p>HTML</p>', 'Text');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('test-msg-id');
    });

    it('skips when smtp not configured', async () => {
      jest.spyOn(emailService, 'loadConfig').mockResolvedValue(null);
      const result = await emailService.sendEmail('to@test.com', 'Subject', 'html');
      expect(result.success).toBe(false);
      expect(result.message).toContain('SMTP non configuré');
    });

    it('handles send error gracefully', async () => {
      const mockTransporter = { sendMail: jest.fn().mockRejectedValue(new Error('Connection refused')) };
      jest.spyOn(emailService, 'loadConfig').mockResolvedValue({
        host: 'smtp.test.com', port: 587, secure: false,
        username: 'user', password: 'pass', from_email: 'a@b.com', from_name: 'Test', enabled: true
      });
      jest.spyOn(emailService, 'createTransporter').mockResolvedValue(mockTransporter);
      const result = await emailService.sendEmail('to@test.com', 'Subject', 'html');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection refused');
    });
  });

  describe('testConnection()', () => {
    it('returns success on verify', async () => {
      jest.spyOn(emailService, 'createTransporter').mockResolvedValue({
        verify: jest.fn().mockResolvedValue(true)
      });
      const result = await emailService.testConnection();
      expect(result.success).toBe(true);
    });

    it('fails when no transporter', async () => {
      jest.spyOn(emailService, 'createTransporter').mockResolvedValue(null);
      const result = await emailService.testConnection();
      expect(result.success).toBe(false);
    });

    it('fails on verify error', async () => {
      jest.spyOn(emailService, 'createTransporter').mockResolvedValue({
        verify: jest.fn().mockRejectedValue(new Error('SMTP timeout'))
      });
      const result = await emailService.testConnection();
      expect(result.success).toBe(false);
    });
  });

  describe('getDailyStats()', () => {
    it('returns aggregated stats for a bank', async () => {
      db.query.mockResolvedValue({ rows: [{ total_records: 10, enrollment_success: 8, enrollment_error: 1, enrollment_pending: 1 }] });
      db.query.mockResolvedValueOnce({ rows: [{ total_records: 10, enrollment_success: 8, enrollment_error: 1, enrollment_pending: 1 }] });
      db.query.mockResolvedValueOnce({ rows: [{ total_files: 3, total_lines: 10 }] });
      db.query.mockResolvedValueOnce({ rows: [{ total_xml: 5, total_xml_records: 10 }] });

      const stats = await emailService.getDailyStats(1, new Date('2026-01-15'));
      expect(stats.csv.totalRecords).toBe(10);
      expect(stats.files.totalFiles).toBe(3);
      expect(stats.xml.totalXml).toBe(5);
    });

    it('returns null on db error', async () => {
      db.query.mockRejectedValue(new Error('DB error'));
      const stats = await emailService.getDailyStats(1, new Date());
      expect(stats).toBeNull();
    });
  });

  describe('sendDailyReport()', () => {
    it('sends report to bank notification emails', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Bank' }] });
      db.query.mockResolvedValueOnce({ rows: [{ email: 'admin@bank.com' }, { email: 'ops@bank.com' }] });
      jest.spyOn(emailService, 'getDailyStats').mockResolvedValue({
        csv: { totalRecords: 5, enrollmentSuccess: 3, enrollmentError: 1, enrollmentPending: 1 },
        files: { totalFiles: 2, totalLines: 5 },
        xml: { totalXml: 2, totalRecords: 5 }
      });
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue({ success: true, messageId: 'm1' });
      db.query.mockResolvedValue({ rows: [] });

      const result = await emailService.sendDailyReport(1, new Date('2026-01-15'));
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('fails when bank not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const result = await emailService.sendDailyReport(999);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Banque non trouvée');
    });

    it('fails when no notification emails configured', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Bank' }] });
      db.query.mockResolvedValueOnce({ rows: [] });
      const result = await emailService.sendDailyReport(1);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Aucun email configuré');
    });
  });

  describe('sendAllDailyReports()', () => {
    it('sends reports to all active banks', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1, name: 'Bank A' }, { id: 2, name: 'Bank B' }] });
      jest.spyOn(emailService, 'sendDailyReport').mockResolvedValue({ success: true, results: [] });

      const result = await emailService.sendAllDailyReports(new Date('2026-01-15'));
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('handles errors gracefully', async () => {
      db.query.mockRejectedValue(new Error('DB fail'));
      const result = await emailService.sendAllDailyReports();
      expect(result.success).toBe(false);
    });
  });
});
