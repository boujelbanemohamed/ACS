const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');

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
    isSuperAdmin: (req, res, next) => {
      if (req.user.role === 'super_admin') return next();
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
  };
});

const db = require('../../config/database');
const auditRoutes = require('../../routes/audit');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/audit-logs', auditRoutes);
  return app;
}

describe('Audit Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/audit-logs', () => {
    it('super_admin sees all logs', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, action: 'LOGIN', username: 'admin', created_at: new Date() }, { id: 2, action: 'LOGOUT', username: 'admin', created_at: new Date() }] });
      const res = await request(createTestApp())
        .get('/api/audit-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('bank_admin sees logs for their bank', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, action: 'UPLOAD', bank_id: 3 }] });
      const res = await request(createTestApp())
        .get('/api/audit-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain('al.bank_id');
    });

    it('bank user sees only their own logs', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, action: 'VIEW', user_id: 5 }] });
      const res = await request(createTestApp())
        .get('/api/audit-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3')
        .set('x-test-id', '5');
      expect(res.status).toBe(200);
    });

    it('filters by action', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, action: 'LOGIN' }] });
      await request(createTestApp())
        .get('/api/audit-logs?action=LOGIN')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('al.action = $1');
    });

    it('filters by userId', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/audit-logs?userId=2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('al.user_id = $1');
      expect(db.query.mock.calls[0][1]).toContain(2);
    });

    it('filters by date range', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/audit-logs?dateFrom=2026-05-01&dateTo=2026-05-31')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('al.created_at >=');
      expect(db.query.mock.calls[0][0]).toContain('al.created_at <=');
    });

    it('caps limit at 500', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/audit-logs?limit=9999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.body.limit).toBe(500);
    });

    it('handles database error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(createTestApp())
        .get('/api/audit-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/audit-logs/actions', () => {
    it('returns distinct actions for super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ action: 'LOGIN' }, { action: 'LOGOUT' }, { action: 'UPLOAD' }] });
      const res = await request(createTestApp())
        .get('/api/audit-logs/actions')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toContain('LOGIN');
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/audit-logs/actions')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });
});
