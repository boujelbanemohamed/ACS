const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
jest.mock('../../services/auditService');
jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 1, username: 'admin', role: 'super_admin', bank_id: null };
    next();
  }
}));
jest.mock('../../middleware/roleMiddleware', () => ({
  filterByBank: (req, res, next) => next(),
  checkRole: (roles) => (req, res, next) => next()
}));
jest.mock('../../services/encryptionService', () => ({
  decrypt: jest.fn(pan => `decrypted:${pan}`),
  hashPan: jest.fn(pan => `hash:${pan}`),
  maskPan: jest.fn(pan => `****${pan.slice(-4)}`)
}));

const db = require('../../config/database');
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
        .mockResolvedValueOnce({ rows: [{ id: 1, pan: 'enc:1234', first_name: 'John', bank_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(createTestApp())
        .get('/api/records')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('filters by bankId', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(createTestApp())
        .get('/api/records?bankId=1')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
    });

    it('searches by first/last name or phone', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 2, pan: 'enc:5678', first_name: 'Jane', bank_id: 2 }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(createTestApp())
        .get('/api/records?search=Jane')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body.data[0].first_name).toBe('Jane');
    });

    it('uses safe defaults for sort/limit/offset', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(createTestApp())
        .get('/api/records?sortBy=invalid&sortOrder=invalid&limit=999999&offset=-1')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
    });

    it('returns 500 on database error', async () => {
      db.query.mockRejectedValue(new Error('DB error'));

      const res = await request(createTestApp())
        .get('/api/records')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });

  });

  describe('DELETE /api/records/:id', () => {
    it('deletes a record and returns decrypted PAN', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ pan: 'encrypted_pan_value', bank_id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .delete('/api/records/1')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.decrypted_pan).toContain('decrypted:');
      expect(res.body.data.masked_pan).toBeDefined();
    });

    it('returns 404 for non-existent record', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .delete('/api/records/999')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(404);
    });

    it('returns 500 on database error', async () => {
      db.query.mockRejectedValue(new Error('DB error'));

      const res = await request(createTestApp())
        .delete('/api/records/1')
        .set('Authorization', 'Bearer token');
      expect(res.status).toBe(500);
    });

  });
});
