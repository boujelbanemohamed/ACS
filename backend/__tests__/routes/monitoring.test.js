const express = require('express');
const request = require('supertest');

const mockCronService = {
  getStatus: jest.fn(),
  scanTask: null
};

const mockEmailService = {
  loadConfig: jest.fn(),
  testConnection: jest.fn()
};

jest.mock('../../config/database');
jest.mock('../../services/cronService', () => mockCronService);
jest.mock('../../services/emailService', () => mockEmailService);

jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    if (req.headers['x-test-role']) {
      req.user = {
        id: parseInt(req.headers['x-test-id'] || '1'),
        username: req.headers['x-test-username'] || 'admin',
        role: req.headers['x-test-role'],
        bank_id: parseInt(req.headers['x-test-bank-id'] || '0') || null
      };
    } else {
      req.user = { id: 1, username: 'admin', role: 'super_admin', bank_id: null };
    }
    next();
  }
}));

const db = require('../../config/database');
const monitoringRoutes = require('../../routes/monitoring');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/monitoring', monitoringRoutes);
  return app;
}

describe('Monitoring Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/monitoring/health', () => {
    it('returns health status for super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockResolvedValue({ host: 'smtp.test.com', enabled: true, from_email: 'noreply@test.com' });
      mockEmailService.testConnection.mockResolvedValue({ success: true });
      mockCronService.getStatus.mockReturnValue({
        enabled: true,
        schedule: '*/5 * * * *',
        description: 'Every 5 minutes',
        isScanning: false,
        lastScan: new Date(),
        nextScan: new Date(Date.now() + 300000)
      });

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.globalStatus).toBe('healthy');
      expect(res.body.data.components.database.status).toBe('up');
      expect(res.body.data).toHaveProperty('system');
    });

    it('reports degraded when database is down', async () => {
      db.query.mockRejectedValueOnce(new Error('Connection refused'));
      mockEmailService.loadConfig.mockResolvedValue(null);
      mockCronService.getStatus.mockReturnValue({ enabled: false });
      mockCronService.scanTask = null;

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.globalStatus).toBe('degraded');
      expect(res.body.data.components.database.status).toBe('down');
    });

    it('reports SMTP as not_configured when no config', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockResolvedValue(null);
      mockCronService.getStatus.mockReturnValue({ enabled: true, schedule: '*/5 * * * *', description: 'test', isScanning: false, lastScan: new Date(), nextScan: new Date() });

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.components.smtp.status).toBe('not_configured');
    });

    it('reports SMTP as disabled', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockResolvedValue({ host: 'smtp.test.com', enabled: false, from_email: 'noreply@test.com' });
      mockCronService.getStatus.mockReturnValue({ enabled: true, schedule: '*/5 * * * *', description: 'test', isScanning: false, lastScan: new Date(), nextScan: new Date() });

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.components.smtp.status).toBe('disabled');
    });

    it('returns simplified health for non-super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.globalStatus).toBe('up');
      expect(res.body.data.components.database.status).toBe('up');
      expect(res.body.data.components.smtp.status).toBe('not_configured');
      expect(res.body.data.components.cron.status).toBe('up');
      expect(res.body.data.system.role).toBe('bank');
    });

    it('cron stopped returns stopped status', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockResolvedValue({ host: 'smtp.test.com', enabled: true, from_email: 'noreply@test.com' });
      mockEmailService.testConnection.mockResolvedValue({ success: true });
      mockCronService.getStatus.mockReturnValue({ enabled: false });
      mockCronService.scanTask = null;

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.components.cron.status).toBe('stopped');
    });

    it('cron disabled but task exists shows disabled', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockResolvedValue({ host: 'smtp.test.com', enabled: true, from_email: 'noreply@test.com' });
      mockEmailService.testConnection.mockResolvedValue({ success: true });
      mockCronService.getStatus.mockReturnValue({ enabled: false });
      mockCronService.scanTask = { task: 'scan' };

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.components.cron.status).toBe('disabled');
    });

    it('SMTP error during test reports error', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockResolvedValue({ host: 'smtp.test.com', enabled: true, from_email: 'noreply@test.com' });
      mockEmailService.testConnection.mockResolvedValue({ success: false, message: 'Connection timeout' });
      mockCronService.getStatus.mockReturnValue({ enabled: true, schedule: '*/5 * * * *', description: 'test', isScanning: false, lastScan: new Date(), nextScan: new Date() });

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.components.smtp.status).toBe('error');
    });

    it('SMTP loadConfig throws returns error', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockRejectedValue(new Error('Config error'));
      mockCronService.getStatus.mockReturnValue({ enabled: true, schedule: '*/5 * * * *', description: 'test', isScanning: false, lastScan: new Date(), nextScan: new Date() });

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.components.smtp.status).toBe('error');
    });

    it('triggers health endpoint catch block on cron crash', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockResolvedValue({ host: 'smtp.test.com', enabled: true, from_email: 'noreply@test.com' });
      mockEmailService.testConnection.mockResolvedValue({ success: true });
      mockCronService.getStatus.mockImplementation(() => { throw new Error('Cron panic'); });

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('health endpoint rejects when checkSmtp throws non-standard error', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      mockEmailService.loadConfig.mockImplementation(() => { throw new Error('Fatal SMTP crash'); });
      mockCronService.getStatus.mockReturnValue({ enabled: true, schedule: '*/5 * * * *', description: 'test', isScanning: false, lastScan: new Date(), nextScan: new Date() });

      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.components.smtp.status).toBe('error');
    });
  });

  describe('GET /api/monitoring/debug', () => {
    beforeEach(() => {
      mockCronService.scanTask = null;
      mockCronService.getStatus.mockReturnValue({ enabled: true });
    });

    it('returns debug data with all sections for super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: 3 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'error', count: 2, invalid_rows: 5, duplicate_rows: 1 }, { status: 'validation_error', count: 1, invalid_rows: 3, duplicate_rows: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 1, endpoints: 1 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 1, scan_errors: 3 }] })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [{ total: 4 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ error_type: 'format', error_message: 'PAN invalide', field_name: 'pan', count: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, file_name: 'test.csv', status: 'error', bank_id: 1, error_details: 'Format error', invalid_rows: 2, processed_at: new Date(), bank_code: 'B001', validation_errors: [], record_history_errors: [] }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/monitoring/debug')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.unresolved_validation_errors).toBe(3);
      expect(res.body.data.summary.file_processing_errors).toBe(3);
      expect(res.body.data.summary.api_call_errors).toBe(1);
      expect(res.body.data.file_errors_by_status).toHaveLength(2);
      expect(res.body.data.top_field_validation_errors).toHaveLength(1);
      expect(res.body.data.recent_file_errors).toHaveLength(1);
      expect(res.body.data.recent_scan_errors).toHaveLength(0);
    });

    it('returns empty defaults when no rows are returned', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0, endpoints: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0, scan_errors: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/monitoring/debug')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.summary.unresolved_validation_errors).toBe(0);
      expect(res.body.data.summary.file_processing_errors).toBe(0);
      expect(res.body.data.file_errors_by_status).toEqual([]);
    });

    it('returns 500 on database error', async () => {
      db.query.mockRejectedValue(new Error('DB down'));

      const res = await request(createTestApp())
        .get('/api/monitoring/debug')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('returns debug data for bank_admin with bank_id', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [{ status: 'error', count: 1, invalid_rows: 2, duplicate_rows: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0, endpoints: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0, scan_errors: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/monitoring/debug')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '5');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
    });

    it('returns debug data filtered by bankId query param', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0, endpoints: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0, scan_errors: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/monitoring/debug?bankId=3')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
