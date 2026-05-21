const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
jest.mock('../../services/auditService');
jest.mock('../../services/xmlGenerator');
jest.mock('../../services/recordHistoryService');
jest.mock('../../services/encryptionService', () => ({
  decrypt: jest.fn().mockReturnValue('4000056655665556'),
  hashPan: jest.fn().mockReturnValue('hashed-pan'),
  maskPan: jest.fn().mockReturnValue('400005******5556')
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
const auditService = require('../../services/auditService');
const { decrypt } = require('../../services/encryptionService');
const recordsRoutes = require('../../routes/records');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/records', recordsRoutes);
  return app;
}

describe('Records Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/records', () => {
    it('returns paginated records', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, pan: 'encrypted-pan', bank_id: 1, processed_at: new Date(), bank_name: 'Bank A', bank_code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const res = await request(createTestApp())
        .get('/api/records')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(decrypt).toHaveBeenCalledWith('encrypted-pan');
    });

    it('accepts bankId filter', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await request(createTestApp())
        .get('/api/records?bankId=2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain('bank_id = $1');
    });

    it('accepts search filter', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await request(createTestApp())
        .get('/api/records?search=John')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain('ILIKE');
    });

    it('caps limit at 500', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const res = await request(createTestApp())
        .get('/api/records?limit=9999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(500);
    });

    it('handles database error', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(createTestApp())
        .get('/api/records')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });
});
