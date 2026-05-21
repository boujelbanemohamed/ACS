const express = require('express');
const request = require('supertest');

const mockCronService = {
  getStatus: jest.fn(),
  scanTask: { task: 'scan' }
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

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/monitoring/health')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });
});
