const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');

jest.mock('../../middleware/roleMiddleware', () => ({
  filterByBank: (req, res, next) => {
    if (req.user.role === 'super_admin') return next();
    if ((req.user.role === 'bank' || req.user.role === 'bank_admin') && req.user.bank_id) {
      req.query.bankId = req.user.bank_id;
      req.bankFilter = req.user.bank_id;
    }
    next();
  }
}));

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
const xmlLogsRoutes = require('../../routes/xmlLogs');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/xml-logs', xmlLogsRoutes);
  return app;
}

describe('XML Logs Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/xml-logs', () => {
    it('returns paginated XML logs', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, xml_file_name: 'test.xml', bank_id: 1, bank_name: 'Bank A', status: 'success', created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const res = await request(createTestApp())
        .get('/api/xml-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body).toHaveProperty('pagination');
    });

    it('filters by bankId', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await request(createTestApp())
        .get('/api/xml-logs?bankId=2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('bank_id = $1');
    });

    it('filters by status', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await request(createTestApp())
        .get('/api/xml-logs?status=success')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('status = $1');
    });

    it('handles database error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(createTestApp())
        .get('/api/xml-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/xml-logs/stats/summary', () => {
    it('returns XML statistics', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total_xml: 10, success_count: 8, error_count: 2, pending_count: 0, total_records: 100, total_entries: 500 }] });
      const res = await request(createTestApp())
        .get('/api/xml-logs/stats/summary')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.total_xml).toBe(10);
    });

    it('filters stats by bankId', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total_xml: 5 }] });
      await request(createTestApp())
        .get('/api/xml-logs/stats/summary?bankId=3')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][1]).toEqual([3]);
    });
  });

  describe('GET /api/xml-logs/:id', () => {
    it('returns a single XML log', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, xml_file_name: 'test.xml', bank_name: 'Bank A', bank_code: 'BA' }] });
      const res = await request(createTestApp())
        .get('/api/xml-logs/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.xml_file_name).toBe('test.xml');
    });

    it('returns 404 for non-existent log', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/xml-logs/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });

  describe('Permissions par rôle', () => {
    for (const role of ['super_admin', 'bank_admin', 'bank']) {
      describe(`GET /api/xml-logs en tant que ${role}`, () => {
        it('peut accéder à la liste', async () => {
          db.query
            .mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ count: '1' }] });
          const headers = { 'Authorization': 'Bearer token', 'x-test-role': role };
          if (role !== 'super_admin') headers['x-test-bank-id'] = '1';
          const res = await request(createTestApp()).get('/api/xml-logs').set(headers);
          expect(res.status).toBe(200);
        });

        it('peut accéder aux stats', async () => {
          db.query.mockResolvedValueOnce({ rows: [{ total_xml: 5 }] });
          const headers = { 'Authorization': 'Bearer token', 'x-test-role': role };
          if (role !== 'super_admin') headers['x-test-bank-id'] = '2';
          const res = await request(createTestApp()).get('/api/xml-logs/stats/summary').set(headers);
          expect(res.status).toBe(200);
        });

        it('peut accéder à un log par ID', async () => {
          db.query.mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 1 }] });
          const headers = { 'Authorization': 'Bearer token', 'x-test-role': role };
          if (role !== 'super_admin') headers['x-test-bank-id'] = '1';
          const res = await request(createTestApp()).get('/api/xml-logs/1').set(headers);
          expect(res.status).toBe(200);
        });
      });
    }

    it('filterByBank injecte bank_id pour bank', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 3 }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      await request(createTestApp())
        .get('/api/xml-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');
      expect(db.query.mock.calls[0][1]).toContain(3);
    });

    it('filterByBank injecte bank_id pour bank_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 5 }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      await request(createTestApp())
        .get('/api/xml-logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '5');
      expect(db.query.mock.calls[0][1]).toContain(5);
    });
  });
});
