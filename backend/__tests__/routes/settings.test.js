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
    isSuperAdmin: (req, res, next) => {
      if (req.user.role === 'super_admin') return next();
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
  };
});

const db = require('../../config/database');
const auditService = require('../../services/auditService');
const settingsRoutes = require('../../routes/settings');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRoutes);
  return app;
}

describe('Settings Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/settings', () => {
    it('returns settings as object', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [{ key: 'cron_schedule', value: '*/5 * * * *' }, { key: 'cron_enabled', value: 'true' }] });
      const res = await request(createTestApp())
        .get('/api/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.cron_schedule).toBe('*/5 * * * *');
      expect(res.body.data.cron_enabled).toBe('true');
    });

    it('creates settings table with defaults if not exists', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ exists: false }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });

    it('handles database error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(createTestApp())
        .get('/api/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/settings/:key', () => {
    it('updates a setting', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, key: 'cron_schedule', value: '0 * * * *' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/settings/cron_schedule')
        .send({ value: '0 * * * *' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.value).toBe('0 * * * *');
    });
  });

  describe('POST /api/settings/bulk', () => {
    it('updates multiple settings', async () => {
      db.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/settings/bulk')
        .send({ settings: { cron_schedule: '0 * * * *', cron_enabled: 'false' } })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(db.query).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Permissions par rôle', () => {
  describe('GET /api/settings', () => {
    it('permet à super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [{ key: 'cron_schedule', value: '*/5 * * * *' }] });
      const res = await request(createTestApp())
        .get('/api/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('bloque bank_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(403);
    });

    it('bloque bank', async () => {
      const res = await request(createTestApp())
        .get('/api/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });
});
