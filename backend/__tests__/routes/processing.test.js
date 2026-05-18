const express = require('express');
const request = require('supertest');

const mockCsvProcessor = {
  processFileFromURL: jest.fn(),
  saveValidatedRecords: jest.fn(),
  moveFileToDestination: jest.fn(),
  archiveOldFile: jest.fn(),
  parseAndValidateCSV: jest.fn()
};

jest.mock('../../config/database');
jest.mock('../../services/csvProcessor', () => jest.fn(() => mockCsvProcessor));
jest.mock('../../services/recordHistoryService', () => ({
  logAttempt: jest.fn()
}));
jest.mock('../../services/xmlGenerator', () => ({
  processAndGenerateXML: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = req.user || { id: 1, username: 'admin', role: 'admin', bank_id: null };
    next();
  }
}));

const db = require('../../config/database');
const processingRoutes = require('../../routes/processing');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/processing', processingRoutes);
  return app;
}

describe('Processing Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/processing/process-url', () => {
    it('rejects missing required fields (Joi)', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.status).toBe(400);
    });

    it('rejects invalid URL format (Joi)', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 'abc', baseUrl: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('rejects non-existent bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 999, baseUrl: 'http://valid-url.com' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Banque');
    });

    it('processes a valid URL for an active bank', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true, destination_url: '/dest', old_url: '/old' }] })
        .mockResolvedValue({ rows: [] });

      mockCsvProcessor.processFileFromURL.mockResolvedValue({
        success: true,
        fileLogId: 42,
        allRecords: [],
        validationErrors: [],
        validRecords: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' }],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0 }
      });
      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 1, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, baseUrl: 'http://valid-url.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/processing/call-api', () => {
    it('rejects missing fields (Joi)', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.status).toBe(400);
    });

    it('blocks private IP (SSRF protection)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] });

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://localhost:5432' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('non autoris');
    });

    it('blocks 169.254.x.x (link-local)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] });

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://169.254.169.254/latest/meta-data/' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/processing/upload', () => {
    it('rejects upload without file', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1');

      expect(res.status).toBe(400);
    });

    it('rejects upload without bankId', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', Buffer.from('a,b,c\n1,2,3'), 'test.csv');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/processing/template', () => {
    it('returns CSV template', async () => {
      const res = await request(createTestApp())
        .get('/api/processing/template')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('template');
    });
  });

  describe('GET /api/processing/logs', () => {
    it('returns file logs with pagination', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, file_name: 'test.csv', processed_at: new Date(), bank_id: 1, name: 'Bank A', code: 'BA', status: 'success' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const res = await request(createTestApp())
        .get('/api/processing/logs')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination.limit).toBeLessThanOrEqual(500);
    });

    it('caps limit at 500', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const res = await request(createTestApp())
        .get('/api/processing/logs?limit=999999')
        .set('Authorization', 'Bearer test-token');

      expect(res.body.pagination.limit).toBe(500);
    });
  });

  describe('POST /api/processing/process-manual', () => {
    it('rejects empty entries', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/process-manual')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, entries: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/processing/validate-manual', () => {
    it('validates a valid PAN', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/processing/validate-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.entries[0].status).toBe('valid');
    });

    it('detects short PAN', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/validate-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [{ pan: '1234', expiry: '12/28', phone: '21699123456', action: 'create' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.entries[0].status).toBe('error');
    });
  });
});
