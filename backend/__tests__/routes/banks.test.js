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
    }
  };
});

const db = require('../../config/database');
const auditService = require('../../services/auditService');
const banksRoutes = require('../../routes/banks');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/banks', banksRoutes);
  return app;
}

describe('Banks Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/banks', () => {
    it('returns all banks', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Bank A', code: 'BA', total_records: 10, total_files_processed: 5 }]
      });
      const res = await request(createTestApp())
        .get('/api/banks')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by bankId query param', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 2, name: 'Bank B' }] });
      const res = await request(createTestApp())
        .get('/api/banks?bankId=2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][1]).toEqual([2]);
    });

    it('handles database error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB down'));
      const res = await request(createTestApp())
        .get('/api/banks')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/banks/:id', () => {
    it('returns a single bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });
      const res = await request(createTestApp())
        .get('/api/banks/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Bank A');
    });

    it('returns 404 for non-existent bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/banks/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/banks', () => {
    const validBank = {
      code: 'NB',
      name: 'New Bank',
      source_url: 'http://source.com',
      destination_url: 'http://dest.com',
      old_url: 'http://old.com',
      xml_output_url: 'http://xml.com'
    };

    it('creates a bank as super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 10, ...validBank, code: 'NB' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/banks')
        .send(validBank)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('rejects missing required fields', async () => {
      const res = await request(createTestApp())
        .post('/api/banks')
        .send({ code: 'NB' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .post('/api/banks')
        .send(validBank)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });

    it('returns 409 on duplicate code', async () => {
      const error = new Error('duplicate');
      error.code = '23505';
      db.query.mockRejectedValueOnce(error);
      const res = await request(createTestApp())
        .post('/api/banks')
        .send(validBank)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(409);
    });
  });

  describe('PUT /api/banks/:id', () => {
    it('updates a bank as super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated', code: 'UP' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Old' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/banks/1')
        .send({ name: 'Updated' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .put('/api/banks/999')
        .send({ name: 'Ghost' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/banks/:id', () => {
    it('deletes a bank as super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Delete Me' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .delete('/api/banks/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .delete('/api/banks/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/banks/:id/stats', () => {
    it('returns bank statistics', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total_records: 50, successful_files: 10, failed_files: 2 }] });
      const res = await request(createTestApp())
        .get('/api/banks/1/stats')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.total_records).toBe(50);
    });

    it('returns defaults when no stats row', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/banks/999/stats')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.total_records).toBe(0);
    });
  });
});

describe('Permissions par rôle', () => {
  describe('GET /api/banks', () => {
    it('permet à super_admin', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Bank A', code: 'BA', total_records: 10, total_files_processed: 5 }]
      });
      const res = await request(createTestApp())
        .get('/api/banks')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('permet à bank_admin', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'Bank A', code: 'BA', total_records: 10, total_files_processed: 5 }]
      });
      const res = await request(createTestApp())
        .get('/api/banks')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(200);
    });

    it('permet à bank (filtré)', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 2, name: 'Bank B', code: 'BB', total_records: 3, total_files_processed: 1 }]
      });
      const res = await request(createTestApp())
        .get('/api/banks')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '2');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/banks', () => {
    it('permet à super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 10, code: 'NB', name: 'New Bank' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/banks')
        .send({ code: 'NB', name: 'New Bank', source_url: 'http://s.com', destination_url: 'http://d.com', old_url: 'http://o.com', xml_output_url: 'http://x.com' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(201);
    });

    it('bloque bank_admin', async () => {
      const res = await request(createTestApp())
        .post('/api/banks')
        .send({ code: 'NB', name: 'New Bank' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(403);
    });

    it('bloque bank', async () => {
      const res = await request(createTestApp())
        .post('/api/banks')
        .send({ code: 'NB', name: 'New Bank' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/banks/:id', () => {
    it('permet à super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Updated', code: 'UP' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Old' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/banks/1')
        .send({ name: 'Updated' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('bloque bank_admin', async () => {
      const res = await request(createTestApp())
        .put('/api/banks/1')
        .send({ name: 'Updated' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(403);
    });

    it('bloque bank', async () => {
      const res = await request(createTestApp())
        .put('/api/banks/1')
        .send({ name: 'Updated' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/banks/:id', () => {
    it('permet à super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Delete Me' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .delete('/api/banks/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('bloque bank_admin', async () => {
      const res = await request(createTestApp())
        .delete('/api/banks/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(403);
    });

    it('bloque bank', async () => {
      const res = await request(createTestApp())
        .delete('/api/banks/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });
});
