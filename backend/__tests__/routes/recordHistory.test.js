const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
jest.mock('../../services/recordHistoryService');
jest.mock('../../services/encryptionService');
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
jest.mock('../../middleware/roleMiddleware', () => ({
  filterByBank: (req, res, next) => {
    if (req.user && req.user.bank_id) {
      req.bankFilter = req.user.bank_id;
    }
    next();
  }
}));

const db = require('../../config/database');
const recordHistoryService = require('../../services/recordHistoryService');
const { hashPan } = require('../../services/encryptionService');
const recordHistoryRoutes = require('../../routes/recordHistory');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/record-history', recordHistoryRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });
  return app;
}

describe('Record History Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/record-history/search', () => {
    it('returns paginated history with success:true, data and pagination', async () => {
      recordHistoryService.searchHistory.mockResolvedValueOnce({
        data: [{ id: 1, pan_hash: 'abc123' }],
        total: 1,
        limit: 50,
        offset: 0
      });

      const res = await request(createTestApp())
        .get('/api/record-history/search');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toEqual({ total: 1, limit: 50, offset: 0 });
    });

    it('passes bankId, status, sourceType, dateFrom, dateTo, hasErrors params', async () => {
      recordHistoryService.searchHistory.mockResolvedValueOnce({
        data: [], total: 0, limit: 50, offset: 0
      });

      await request(createTestApp())
        .get('/api/record-history/search?bankId=2&status=SUCCESS&sourceType=upload&dateFrom=2026-01-01&dateTo=2026-05-01&hasErrors=false');

      expect(recordHistoryService.searchHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          bankId: 2,
          status: 'SUCCESS',
          sourceType: 'upload',
          dateFrom: '2026-01-01',
          dateTo: '2026-05-01',
          hasErrors: false
        })
      );
    });

    it('forces their bank_id for bank role user', async () => {
      recordHistoryService.searchHistory.mockResolvedValueOnce({
        data: [], total: 0, limit: 50, offset: 0
      });

      const res = await request(createTestApp())
        .get('/api/record-history/search?bankId=999')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '5');

      expect(recordHistoryService.searchHistory).toHaveBeenCalledWith(
        expect.objectContaining({ bankId: 5 })
      );
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/record-history/stats', () => {
    it('returns stats from recordHistoryService.getStats', async () => {
      recordHistoryService.getStats.mockResolvedValueOnce({
        total_attempts: 100, unique_pans: 50, success_count: 80
      });

      const res = await request(createTestApp())
        .get('/api/record-history/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total_attempts).toBe(100);
    });

    it('forces bankId for bank role', async () => {
      recordHistoryService.getStats.mockResolvedValueOnce({ total_attempts: 50 });

      await request(createTestApp())
        .get('/api/record-history/stats')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');

      expect(recordHistoryService.getStats).toHaveBeenCalledWith(3);
    });
  });

  describe('GET /api/record-history/top-errors', () => {
    it('returns top errors from getTopErrors', async () => {
      recordHistoryService.getTopErrors.mockResolvedValueOnce([
        { field_name: 'pan', error_type: 'INVALID', occurrence_count: 10 }
      ]);

      const res = await request(createTestApp())
        .get('/api/record-history/top-errors');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('passes limit param', async () => {
      recordHistoryService.getTopErrors.mockResolvedValueOnce([]);

      await request(createTestApp())
        .get('/api/record-history/top-errors?limit=5');

      expect(recordHistoryService.getTopErrors).toHaveBeenCalledWith(null, 5);
    });

    it('forces bank_id for bank role', async () => {
      recordHistoryService.getTopErrors.mockResolvedValueOnce([]);
      await request(createTestApp())
        .get('/api/record-history/top-errors')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');
      expect(recordHistoryService.getTopErrors).toHaveBeenCalledWith(3, 10);
    });
  });

  describe('GET /api/record-history/pan/:bankId/:pan', () => {
    it('returns full PAN history from getHistoryByPan', async () => {
      recordHistoryService.getHistoryByPan.mockResolvedValueOnce({
        summary: { pan: '1234567890123456', totalAttempts: 1, currentStatus: 'SUCCESS' },
        attempts: [{ id: 1, status: 'SUCCESS' }]
      });

      const res = await request(createTestApp())
        .get('/api/record-history/pan/1/1234567890123456');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.currentStatus).toBe('SUCCESS');
      expect(res.body.data.attempts).toHaveLength(1);
    });

    it('returns 404 if no history found', async () => {
      recordHistoryService.getHistoryByPan.mockResolvedValueOnce({
        summary: {}, attempts: []
      });

      const res = await request(createTestApp())
        .get('/api/record-history/pan/1/0000000000000000');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 if bank user tries to access another bank\'s PAN', async () => {
      const res = await request(createTestApp())
        .get('/api/record-history/pan/5/1234567890123456')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/record-history/pan-lookup', () => {
    it('requires at least 4 chars (returns 400 otherwise)', async () => {
      const res = await request(createTestApp())
        .get('/api/record-history/pan-lookup?pan=abc');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns matched records', async () => {
      hashPan.mockReturnValueOnce('hashed_value');
      db.query.mockResolvedValueOnce({ rows: [{ pan_hash: 'hashed_value', bank_id: 1 }] });

      const res = await request(createTestApp())
        .get('/api/record-history/pan-lookup?pan=1234567890123456');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('forces bank_id for bank role', async () => {
      hashPan.mockReturnValueOnce('hashed_bank');
      db.query.mockResolvedValueOnce({ rows: [] });

      await request(createTestApp())
        .get('/api/record-history/pan-lookup?pan=1234567890123456')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '7');

      expect(db.query.mock.calls[0][0]).toContain('bank_id = $2');
    });

    it('uses hashPan for lookup', async () => {
      hashPan.mockReturnValueOnce('hashed_pan_value');
      db.query.mockResolvedValueOnce({ rows: [] });

      await request(createTestApp())
        .get('/api/record-history/pan-lookup?pan=1234567890123456');

      expect(hashPan).toHaveBeenCalledWith('1234567890123456');
      expect(db.query.mock.calls[0][1][0]).toBe('hashed_pan_value');
    });

    it('accepts bankId query param for super_admin', async () => {
      hashPan.mockReturnValueOnce('hashed');
      db.query.mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/record-history/pan-lookup?pan=1234567890123456&bankId=2');
      expect(db.query.mock.calls[0][0]).toContain('AND rh.bank_id = $2');
    });
  });

  describe('GET /api/record-history/corrections', () => {
    it('returns corrections data', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ pan_hash: 'abc', bank_id: 1, total_attempts: 2, is_resolved: true }] });

      const res = await request(createTestApp())
        .get('/api/record-history/corrections');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by bankId', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await request(createTestApp())
        .get('/api/record-history/corrections?bankId=3');

      expect(db.query.mock.calls[0][0]).toContain('bank_id = $1');
    });

    it('forces bank_id for bank role', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/record-history/corrections')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');
      expect(db.query.mock.calls[0][0]).toContain('bank_id = $1');
    });

    it('filters by bankId for super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/record-history/corrections?bankId=5');
      expect(db.query.mock.calls[0][1][0]).toBe(5);
    });
  });

  describe('GET /api/record-history/timeline/:days', () => {
    it('returns timeline data grouped by date', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ date: '2026-05-01', total_attempts: 10, success_count: 8 }] });

      const res = await request(createTestApp())
        .get('/api/record-history/timeline/30');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].total_attempts).toBe(10);
    });

    it('applies interval from params', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await request(createTestApp())
        .get('/api/record-history/timeline/7');

      expect(db.query.mock.calls[0][1][0]).toBe('7 days');
    });

    it('forces bank_id for bank role', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/record-history/timeline/30')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');
      expect(db.query.mock.calls[0][1]).toContain(3);
    });

    it('filters by bankId for super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await request(createTestApp())
        .get('/api/record-history/timeline/30?bankId=5');
      expect(db.query.mock.calls[0][1]).toContain(5);
    });
  });

  describe('Error handling', () => {
    it('search - service error returns 500 with success:false', async () => {
      recordHistoryService.searchHistory.mockRejectedValueOnce(new Error('DB down'));

      const res = await request(createTestApp())
        .get('/api/record-history/search');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('stats - service error returns 500', async () => {
      recordHistoryService.getStats.mockRejectedValueOnce(new Error('Stats error'));

      const res = await request(createTestApp())
        .get('/api/record-history/stats');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('top-errors - service error returns 500', async () => {
      recordHistoryService.getTopErrors.mockRejectedValueOnce(new Error('Error fetching'));

      const res = await request(createTestApp())
        .get('/api/record-history/top-errors');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('pan/:bankId/:pan - service error returns 500', async () => {
      recordHistoryService.getHistoryByPan.mockRejectedValueOnce(new Error('History error'));

      const res = await request(createTestApp())
        .get('/api/record-history/pan/1/1234567890123456');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('pan-lookup - db error returns 500', async () => {
      hashPan.mockReturnValueOnce('hash');
      db.query.mockRejectedValueOnce(new Error('Query failed'));

      const res = await request(createTestApp())
        .get('/api/record-history/pan-lookup?pan=1234567890123456');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('corrections - db error returns 500', async () => {
      db.query.mockRejectedValueOnce(new Error('Corrections error'));

      const res = await request(createTestApp())
        .get('/api/record-history/corrections');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('timeline - db error returns 500', async () => {
      db.query.mockRejectedValueOnce(new Error('Timeline error'));

      const res = await request(createTestApp())
        .get('/api/record-history/timeline/30');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
