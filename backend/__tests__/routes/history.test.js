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
    filterByBank: (req, res, next) => {
      if (req.user && req.user.bank_id) {
        req.bankFilter = req.user.bank_id;
      }
      next();
    }
  };
});

const db = require('../../config/database');
const historyRoutes = require('../../routes/history');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/history', historyRoutes);
  return app;
}

describe('History Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/history', () => {
    it('returns paginated history', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, file_name: 'test.csv', bank_id: 1, bank_name: 'Bank A', bank_code: 'BA', status: 'success', processed_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const res = await request(createTestApp())
        .get('/api/history')
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
        .get('/api/history?bankId=2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('bank_id = $');
    });

    it('filters by bankFilter for bank_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await request(createTestApp())
        .get('/api/history')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain('AND fl.bank_id');
      expect(db.query.mock.calls[0][1]).toContain(3);
    });

    it('filters by status', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await request(createTestApp())
        .get('/api/history?status=success')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain("status = $");
    });

    it('filters by multiple statuses', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await request(createTestApp())
        .get('/api/history?status=success,error')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('ANY');
    });

    it('filters by dateFrom and dateTo', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await request(createTestApp())
        .get('/api/history?dateFrom=2026-05-01&dateTo=2026-05-31')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('processed_at >=');
      expect(db.query.mock.calls[0][0]).toContain("processed_at <=");
    });

    it('filters by sourceType', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await request(createTestApp())
        .get('/api/history?sourceType=upload')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('source_type = $');
    });

    it('caps limit at 500', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await request(createTestApp())
        .get('/api/history?limit=9999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.body.pagination.limit).toBe(500);
    });

    it('handles database error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(createTestApp())
        .get('/api/history')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/history/stats', () => {
    it('returns history stats', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ total: 100, upload_count: 50, url_count: 30, manual_count: 20, success_count: 80, error_count: 20, pending_count: 0, total_rows_processed: 1000, total_valid_rows: 900, total_invalid_rows: 100 }]
      });
      const res = await request(createTestApp())
        .get('/api/history/stats')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(100);
    });

    it('filters stats by bankId', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ total: 50 }] });
      await request(createTestApp())
        .get('/api/history/stats?bankId=3')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(db.query.mock.calls[0][0]).toContain('WHERE bank_id = $1');
    });
  });

  describe('GET /api/history/:id', () => {
    it('returns single history entry with validation errors', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, file_name: 'test.csv', bank_id: 1, bank_name: 'Bank A' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, row_number: 5, error_message: 'Invalid PAN' }] });
      const res = await request(createTestApp())
        .get('/api/history/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.validation_errors).toHaveLength(1);
    });

    it('returns 404 for non-existent entry', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/history/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });
  });
});
