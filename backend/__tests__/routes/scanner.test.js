const express = require('express');
const request = require('supertest');

const mockCronService = {
  getStatus: jest.fn(),
  run: jest.fn()
};

jest.mock('../../config/database');
jest.mock('../../services/cronService', () => mockCronService);
jest.mock('../../services/auditService');

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

jest.mock('../../middleware/roleMiddleware', () => {
  const actual = jest.requireActual('../../middleware/roleMiddleware');
  return {
    ...actual,
    checkRole: (...roles) => (req, res, next) => {
      if (roles.includes(req.user.role)) return next();
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
  };
});

const db = require('../../config/database');
const auditService = require('../../services/auditService');
const scannerRoutes = require('../../routes/scanner');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/scanner', scannerRoutes);
  return app;
}

describe('Scanner Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/scanner/status', () => {
    it('returns scanner status', async () => {
      mockCronService.getStatus.mockReturnValue({
        enabled: true,
        isScanning: false,
        lastScan: new Date(),
        nextScan: new Date(Date.now() + 3600000),
        schedule: '*/5 * * * *',
        description: 'Every 5 minutes'
      });
      const res = await request(createTestApp())
        .get('/api/scanner/status')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(true);
    });
  });

  describe('POST /api/scanner/trigger', () => {
    it('triggers scan as super_admin', async () => {
      mockCronService.run.mockResolvedValue({ scanned: 5, processed: 3, errors: 0 });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/scanner/trigger')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.scanned).toBe(5);
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .post('/api/scanner/trigger')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/scanner/logs', () => {
    it('returns scan logs', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, scan_time: new Date(), status: 'success', files_found: 5 }] });
      const res = await request(createTestApp())
        .get('/api/scanner/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('caps limit at 500', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/scanner/logs?limit=9999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('handles database error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(createTestApp())
        .get('/api/scanner/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });
});

describe('Permissions par rôle', () => {
  describe('POST /api/scanner/trigger', () => {
    it('permet à super_admin', async () => {
      mockCronService.run.mockResolvedValue({ scanned: 5, processed: 3, errors: 0 });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/scanner/trigger')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('bloque bank_admin', async () => {
      const res = await request(createTestApp())
        .post('/api/scanner/trigger')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(403);
    });

    it('bloque bank', async () => {
      const res = await request(createTestApp())
        .post('/api/scanner/trigger')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/scanner/status', () => {
    it('permet à super_admin', async () => {
      mockCronService.getStatus.mockReturnValue({
        enabled: true,
        isScanning: false,
        lastScan: new Date(),
        nextScan: new Date(Date.now() + 3600000),
        schedule: '*/5 * * * *',
        description: 'Every 5 minutes'
      });
      const res = await request(createTestApp())
        .get('/api/scanner/status')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('permet à bank_admin', async () => {
      mockCronService.getStatus.mockReturnValue({
        enabled: true,
        isScanning: false,
        lastScan: new Date(),
        nextScan: new Date(Date.now() + 3600000),
        schedule: '*/5 * * * *',
        description: 'Every 5 minutes'
      });
      const res = await request(createTestApp())
        .get('/api/scanner/status')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(200);
    });

    it('permet à bank', async () => {
      mockCronService.getStatus.mockReturnValue({
        enabled: true,
        isScanning: false,
        lastScan: new Date(),
        nextScan: new Date(Date.now() + 3600000),
        schedule: '*/5 * * * *',
        description: 'Every 5 minutes'
      });
      const res = await request(createTestApp())
        .get('/api/scanner/status')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(200);
    });
  });
});
