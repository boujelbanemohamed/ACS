const express = require('express');
const request = require('supertest');
const path = require('path');

jest.mock('../../config/database');
jest.mock('../../services/enrollmentService');
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
const enrollmentService = require('../../services/enrollmentService');
const auditService = require('../../services/auditService');
const enrollmentRoutes = require('../../routes/enrollment');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/enrollment', enrollmentRoutes);
  return app;
}

describe('Enrollment Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/enrollment/upload', () => {
    it('rejects upload without file', async () => {
      const res = await request(createTestApp())
        .post('/api/enrollment/upload')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('fichier');
    });

    it('processes XML upload as super_admin', async () => {
      enrollmentService.processEnrollmentReportFromContent.mockResolvedValue({
        success: true,
        records: [{ id: 1, status: 'matched' }]
      });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/enrollment/upload')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin')
        .attach('file', Buffer.from('<xml>test</xml>'), 'report.xml')
        .field('bankId', '1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(enrollmentService.processEnrollmentReportFromContent).toHaveBeenCalled();
    });

    it('rejects non-XML file', async () => {
      const res = await request(createTestApp())
        .post('/api/enrollment/upload')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin')
        .attach('file', Buffer.from('not xml'), 'test.txt');
      expect(res.status).toBe(500);
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .post('/api/enrollment/upload')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/enrollment/stats', () => {
    it('returns enrollment stats', async () => {
      enrollmentService.getEnrollmentStats.mockResolvedValue({
        total_records: 100,
        matched: 80,
        unmatched: 20
      });
      const res = await request(createTestApp())
        .get('/api/enrollment/stats')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.total_records).toBe(100);
    });

    it('forces bank_id for bank user', async () => {
      enrollmentService.getEnrollmentStats.mockResolvedValue({ total_records: 50 });
      const res = await request(createTestApp())
        .get('/api/enrollment/stats')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
      expect(enrollmentService.getEnrollmentStats).toHaveBeenCalledWith(3);
    });
  });

  describe('GET /api/enrollment/logs', () => {
    it('returns enrollment logs', async () => {
      enrollmentService.getEnrollmentLogs.mockResolvedValue([{ id: 1, bank_id: 1, status: 'success' }]);
      db.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const res = await request(createTestApp())
        .get('/api/enrollment/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('forces bank_id for bank user', async () => {
      enrollmentService.getEnrollmentLogs.mockResolvedValue([]);
      db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await request(createTestApp())
        .get('/api/enrollment/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
      expect(enrollmentService.getEnrollmentLogs).toHaveBeenCalledWith(3, 50, 0);
    });

    it('handles database error', async () => {
      enrollmentService.getEnrollmentLogs.mockRejectedValue(new Error('DB error'));
      const res = await request(createTestApp())
        .get('/api/enrollment/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/enrollment/logs/:id', () => {
    it('returns a single enrollment log', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 1, bank_name: 'Bank A', bank_code: 'BA', status: 'success' }] });
      const res = await request(createTestApp())
        .get('/api/enrollment/logs/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(1);
    });

    it('returns 404 for non-existent log', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/enrollment/logs/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });
});
