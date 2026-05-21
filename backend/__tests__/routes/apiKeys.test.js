const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
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
    filterByBank: (req, res, next) => {
      if (req.user && req.user.bank_id) {
        req.bankFilter = req.user.bank_id;
      }
      next();
    },
    checkRole: (...roles) => (req, res, next) => {
      if (roles.includes(req.user.role)) return next();
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    },
    isSuperAdmin: (req, res, next) => {
      if (req.user.role === 'super_admin') return next();
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
  };
});

const db = require('../../config/database');
const auditService = require('../../services/auditService');
const apiKeysRoutes = require('../../routes/apiKeys');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/api-keys', apiKeysRoutes);
  return app;
}

describe('API Keys Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/api-keys', () => {
    it('returns all API keys', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Key', api_key: 'acs_...', bank_name: 'Bank A' }] });
      const res = await request(createTestApp())
        .get('/api/api-keys')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by bankId', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/api-keys?bankId=2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('bank_id = $1');
      expect(db.query.mock.calls[0][1]).toEqual([2]);
    });
  });

  describe('GET /api/api-keys/stats', () => {
    it('returns API key stats for super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total_keys: 5, active_keys: 3, inactive_keys: 2, total_api_calls: 1000, calls_today: 50, error_calls: 10 }] });
      const res = await request(createTestApp())
        .get('/api/api-keys/stats')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.total_keys).toBe(5);
    });

    it('blocks non-super_admin from stats', async () => {
      const res = await request(createTestApp())
        .get('/api/api-keys/stats')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/api-keys/:id/logs', () => {
    it('returns logs for an API key', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, endpoint: '/api/test', response_status: 200, created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const res = await request(createTestApp())
        .get('/api/api-keys/1/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/api-keys/1/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/api-keys', () => {
    it('creates an API key as super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'New Key', api_key: 'acs_' + 'a'.repeat(64), bank_id: null }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/api-keys')
        .send({ name: 'New Key' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.api_key).toContain('acs_');
    });

    it('rejects missing name', async () => {
      const res = await request(createTestApp())
        .post('/api/api-keys')
        .send({})
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .post('/api/api-keys')
        .send({ name: 'Key' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/api-keys/:id', () => {
    it('updates an API key', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated Key' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/api-keys/1')
        .send({ name: 'Updated Key' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent key', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .put('/api/api-keys/999')
        .send({ name: 'Ghost' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/api-keys/:id', () => {
    it('deletes an API key', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Delete Me' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .delete('/api/api-keys/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent key', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .delete('/api/api-keys/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/api-keys/:id/regenerate', () => {
    it('regenerates an API key', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Regenerated' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/api-keys/1/regenerate')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.api_key).toContain('acs_');
    });
  });
});
