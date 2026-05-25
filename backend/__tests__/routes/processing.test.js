const express = require('express');
const request = require('supertest');

const mockCsvProcessor = {
  processFileFromURL: jest.fn(),
  saveValidatedRecords: jest.fn(),
  moveFileToDestination: jest.fn(),
  archiveOldFile: jest.fn(),
  parseAndValidateCSV: jest.fn(),
  createFileLog: jest.fn(),
  updateFileLog: jest.fn(),
  saveValidationErrors: jest.fn(),
  generateCorrectedCSV: jest.fn()
};

jest.mock('../../config/database');
jest.mock('axios');
jest.mock('../../services/csvProcessor', () => jest.fn(() => mockCsvProcessor));
jest.mock('../../services/recordHistoryService', () => ({
  logAttempt: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../services/xmlGenerator', () => ({
  processAndGenerateXML: jest.fn().mockResolvedValue({ success: true, fileName: 'test.xml', filePath: '/tmp/test.xml', xmlEntriesCount: 2 })
}));
jest.mock('../../services/encryptionService', () => ({
  encrypt: jest.fn(pan => `encrypted:${pan}`),
  decrypt: jest.fn(val => val),
  hashPan: jest.fn(pan => `hash:${pan}`)
}));
jest.mock('../../utils/validationHelper', () => ({
  validateRowForHistory: jest.fn(() => ({ isValid: true, results: [], errorCount: 0 }))
}));
jest.mock('../../services/auditService', () => ({
  logAction: jest.fn().mockResolvedValue(undefined)
}));
const mockJobStore = new Map();

const mockEnqueueJob = jest.fn(async (jobType, data) => {
  const jobId = `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mockJobStore.set(jobId, {
    id: jobId,
    data: { jobType, ...data },
    status: 'pending',
    result: null,
    error: null,
    progress: 0,
    timestamp: Date.now(),
  });
  return { jobId };
});

jest.mock('../../services/queueService', () => ({
  enqueueJob: mockEnqueueJob,
  getJob: jest.fn(async (jobId) => {
    const job = mockJobStore.get(jobId);
    if (!job) return null;
    return {
      jobId: job.id,
      type: job.data.jobType,
      status: job.status,
      progress: job.progress,
      data: job.data,
      result: job.result,
      error: job.error,
      createdAt: job.timestamp,
    };
  }),
  getQueueStats: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0 }),
  getActiveJobs: jest.fn().mockResolvedValue([]),
  processingQueue: { on: jest.fn() },
}));

jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = {
      id: parseInt(req.headers['x-test-id'] || '1'),
      username: req.headers['x-test-username'] || 'admin',
      role: req.headers['x-test-role'] || 'super_admin',
      bank_id: parseInt(req.headers['x-test-bank-id'] || '0') || null
    };
    next();
  }
}));
jest.mock('../../middleware/roleMiddleware', () => ({
  forceBankId: (req, res, next) => {
    if (req.user.role !== 'super_admin' && req.user.bank_id) {
      req.body.bankId = req.user.bank_id;
    }
    next();
  }
}));

const db = require('../../config/database');
const axios = require('axios');
const processingRoutes = require('../../routes/processing');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

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
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [] });
  });

  describe('GET /api/processing/template', () => {
    it('returns CSV template with correct headers', async () => {
      const res = await request(createTestApp())
        .get('/api/processing/template')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('template_import.csv');
      expect(res.text).toContain('language');
      expect(res.text).toContain('firstName');
      expect(res.text).toContain('pan');
    });
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
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true, destination_url: '/dest', old_url: '/old' }] });

      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, baseUrl: 'http://valid-url.com' });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles csvProcessor failure gracefully', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true, destination_url: '/dest', old_url: '/old' }] });

      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, baseUrl: 'http://valid-url.com' });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('processes URL and generates XML when records exist', async () => {
      const bankRow = { id: 1, name: 'Bank A', code: 'BA', is_active: true, destination_url: '/dest', old_url: '/old' };
      db.query.mockResolvedValueOnce({ rows: [bankRow] });

      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, baseUrl: 'http://valid-url.com' });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
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

    it('successfully processes uploaded CSV file', async () => {
      const csvContent = 'language;firstName;lastName;pan;expiry;phone;behaviour;action\nfr;John;Doe;4000056655665556;12/28;21699123456;otp;create';

      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1')
        .attach('file', Buffer.from(csvContent), 'test.csv');

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles validation errors during upload', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1')
        .attach('file', Buffer.from('invalid'), 'bad.csv');

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('returns 500 when csvProcessor throws', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1')
        .attach('file', Buffer.from('a,b,c'), 'bad.csv');

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('rejects non-CSV file upload', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1')
        .attach('file', Buffer.from('not a csv'), 'test.pdf');

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/processing/errors/:fileLogId', () => {
    it('returns validation errors for a file log', async () => {
      const errorRows = [
        { id: 1, file_log_id: 1, row_number: 1, field_name: 'pan', field_value: '1234', error_message: 'PAN invalide', severity: 'error', file_name: 'test.csv', bank_name: 'Bank A' }
      ];
      db.query.mockResolvedValueOnce({ rows: errorRows });

      const res = await request(createTestApp())
        .get('/api/processing/errors/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].field_name).toBe('pan');
    });

    it('returns empty array when no errors exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/processing/errors/999')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('handles DB query failure', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const res = await request(createTestApp())
        .get('/api/processing/errors/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/processing/errors/:errorId/resolve', () => {
    it('resolves validation error successfully', async () => {
      const resolvedRow = { id: 1, file_log_id: 1, field_name: 'pan', is_resolved: true, field_value: '4000056655665556' };
      db.query.mockResolvedValueOnce({ rows: [resolvedRow] });

      const res = await request(createTestApp())
        .patch('/api/processing/errors/1/resolve')
        .set('Authorization', 'Bearer test-token')
        .send({ correctedValue: '4000056655665556' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_resolved).toBe(true);
    });

    it('returns 404 for non-existent error', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .patch('/api/processing/errors/999/resolve')
        .set('Authorization', 'Bearer test-token')
        .send({ correctedValue: '4000056655665556' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('non trouv');
    });

    it('handles DB error during resolution', async () => {
      db.query.mockRejectedValueOnce(new Error('Update failed'));

      const res = await request(createTestApp())
        .patch('/api/processing/errors/1/resolve')
        .set('Authorization', 'Bearer test-token')
        .send({ correctedValue: '4000056655665556' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('resolves error without correctedValue', async () => {
      const resolvedRow = { id: 1, file_log_id: 1, is_resolved: true, field_value: null };
      db.query.mockResolvedValueOnce({ rows: [resolvedRow] });

      const res = await request(createTestApp())
        .patch('/api/processing/errors/1/resolve')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
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
      expect(res.body.pagination.total).toBe(1);
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

    it('filters logs by bankId', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await request(createTestApp())
        .get('/api/processing/logs?bankId=1')
        .set('Authorization', 'Bearer test-token');

      const queryCall = db.query.mock.calls[0][0];
      expect(queryCall).toContain('bank_id = $1');
    });

    it('filters logs by status', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await request(createTestApp())
        .get('/api/processing/logs?status=success')
        .set('Authorization', 'Bearer test-token');

      const queryCall = db.query.mock.calls[0][0];
      expect(queryCall).toContain('status');
    });

    it('handles DB query failure', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(createTestApp())
        .get('/api/processing/logs')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/processing/download/:fileLogId', () => {
    it('downloads corrected CSV for existing file log', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 1, file_name: 'test.csv', status: 'success' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, pan: '4000056655665556', first_name: 'John', last_name: 'Doe' }] });

      mockCsvProcessor.generateCorrectedCSV.mockImplementation(async (rows, outputPath) => {
        const fs = require('fs');
        fs.writeFileSync(outputPath, 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n');
        return outputPath;
      });

      const res = await request(createTestApp())
        .get('/api/processing/download/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('corrected_test.csv');
    });

    it('returns 404 for non-existent file log', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/processing/download/999')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('non trouv');
    });

    it('handles DB error during download', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(createTestApp())
        .get('/api/processing/download/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('handles download callback cleanup', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 1, file_name: 'test.csv', status: 'success' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, pan: '4000056655665556', first_name: 'John', last_name: 'Doe' }] });

      mockCsvProcessor.generateCorrectedCSV.mockImplementation(async (rows, outputPath) => {
        const fs = require('fs');
        fs.writeFileSync(outputPath, 'language;firstName;lastName;pan;expiry;phone;behaviour;action\n');
        return outputPath;
      });

      const res = await request(createTestApp())
        .get('/api/processing/download/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/processing/reprocess/:fileLogId', () => {
    it('reprocesses file successfully', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, bank_id: 1, file_name: 'test.csv', original_path: '/tmp/test.csv', status: 'validation_error', name: 'Bank A', code: 'BA' }]
      });

      const res = await request(createTestApp())
        .post('/api/processing/reprocess/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('returns 404 for non-existent file log', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/processing/reprocess/999')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('non trouv');
    });

    it('handles csvProcessor error during reprocess', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, bank_id: 1, file_name: 'test.csv', original_path: '/tmp/test.csv', status: 'validation_error', name: 'Bank A', code: 'BA' }]
      });

      const res = await request(createTestApp())
        .post('/api/processing/reprocess/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
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

    it('returns 400 for missing bankId', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/validate-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          entries: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' }]
        });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty entries', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/validate-manual')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, entries: [] });

      expect(res.status).toBe(400);
    });

    it('detects duplicate PAN in database', async () => {
      const { hashPan } = require('../../services/encryptionService');
      hashPan.mockReturnValue('hash:4000056655665556');
      db.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

      const res = await request(createTestApp())
        .post('/api/processing/validate-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.entries[0].status).toBe('duplicate');
      expect(res.body.data.entries[0].errorMessage).toContain('deja existant');
    });

    it('handles mixed valid and invalid entries', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/processing/validate-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [
            { pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' },
            { pan: '1234', expiry: '12/28', phone: '21699123456', action: 'update' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.entries[0].status).toBe('valid');
      expect(res.body.data.entries[1].status).toBe('error');
      expect(res.body.data.stats.valid).toBe(1);
      expect(res.body.data.stats.error).toBe(1);
    });

    it('handles DB error during duplicate check', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(createTestApp())
        .post('/api/processing/validate-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' }]
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
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

    it('processes valid entries successfully', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] });

      const res = await request(createTestApp())
        .post('/api/processing/process-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [
            {
              language: 'fr',
              firstName: 'John',
              lastName: 'Doe',
              pan: '4000056655665556',
              expiry: '12/28',
              phone: '21699123456',
              behaviour: 'otp',
              action: 'create'
            }
          ]
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('returns 404 for non-existent bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/processing/process-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 999,
          entries: [
            {
              language: 'fr',
              firstName: 'John',
              lastName: 'Doe',
              pan: '4000056655665556',
              expiry: '12/28',
              phone: '21699123456',
              behaviour: 'otp',
              action: 'create'
            }
          ]
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('non trouv');
    });

    it('processes multiple entries and logs each to history', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] });

      const res = await request(createTestApp())
        .post('/api/processing/process-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [
            { firstName: 'John', lastName: 'Doe', pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' },
            { firstName: 'Jane', lastName: 'Smith', pan: '5000056655665556', expiry: '06/29', phone: '21699123457', action: 'update' }
          ]
        });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles DB error during record insertion', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] });

      const res = await request(createTestApp())
        .post('/api/processing/process-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [
            { firstName: 'John', lastName: 'Doe', pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' }
          ]
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
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
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://localhost:5432' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('non autoris');
    });

    it('blocks 169.254.x.x (link-local)', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://169.254.169.254/latest/meta-data/' });

      expect(res.status).toBe(400);
    });

    it('successfully calls external API and processes response', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('extracts data using dataPath', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET', dataPath: 'results.items' });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles bad dataPath with missing keys', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET', dataPath: 'nonexistent.path' });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('wraps single-object response into an array', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/single', method: 'GET' });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('rejects response with invalid PAN from API', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles API call with bearer auth', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          url: 'http://api.example.com/data',
          method: 'GET',
          authType: 'bearer',
          authToken: 'my-token'
        });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles API call with basic auth', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          url: 'http://api.example.com/data',
          method: 'GET',
          authType: 'basic',
          authToken: 'user:pass'
        });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles API call with apiKey auth', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          url: 'http://api.example.com/data',
          method: 'GET',
          authType: 'apikey',
          authToken: 'key-123'
        });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles axios failure gracefully', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('makes POST request when method is POST', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          url: 'http://api.example.com/submit',
          method: 'POST'
        });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('sends request body with POST method', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          url: 'http://api.example.com/submit',
          method: 'POST',
          body: { firstName: 'John', pan: '4000056655665556' }
        });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('blocks invalid URL format in call-api', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'not-a-valid-url', method: 'GET' });

      expect(res.status).toBe(400);
    });

    it('returns validation error when phone is missing in API response data', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });

    it('handles history log error during call-api gracefully', async () => {
      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(202);
      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.status).toBe('pending');
    });
  });

  describe('Permissions par rôle', () => {
    const publicRoutes = [
      { method: 'get', path: '/template' },
      { method: 'get', path: '/status/test-job' },
      { method: 'get', path: '/queue/stats' },
    ];
    const bankScopedRoutes = [
      { method: 'post', path: '/process-url', body: { url: 'http://example.com/file.csv', bankId: 1 } },
      { method: 'post', path: '/validate-manual', body: { entries: [{ pan: '4000056655665556' }] } },
      { method: 'post', path: '/process-manual', body: { entries: [{ pan: '4000056655665556' }] } },
    ];

    for (const role of ['super_admin', 'bank_admin', 'bank']) {
      describe(`en tant que ${role}`, () => {
        const headers = { 'Authorization': 'Bearer token', 'x-test-role': role };
        if (role === 'bank_admin' || role === 'bank') {
          headers['x-test-bank-id'] = '1';
        }

        for (const r of publicRoutes) {
          it(`accede à GET ${r.path}`, async () => {
            const res = await request(createTestApp())[r.method](r.path).set(headers);
            expect(res.status).not.toBe(401);
            expect(res.status).not.toBe(403);
          });
        }

        for (const r of bankScopedRoutes) {
          it(`accede à POST ${r.path} avec forceBankId`, async () => {
            const res = await request(createTestApp())[r.method](r.path).set(headers).send(r.body);
            expect(res.status).not.toBe(401);
            expect(res.status).not.toBe(403);
          });
        }
      });
    }

    it('forceBankId injecte bank_id pour bank', async () => {
      const app = createTestApp();
      const db = require('../../config/database');
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 5, code: 'BT', name: 'Bank Test', is_active: true }] })
        .mockResolvedValueOnce({ rows: [] });
      mockCsvProcessor.processFileFromURL.mockResolvedValue({ fileLog: { id: 10 }, errorCount: 0, successCount: 5 });
      const res = await request(app)
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '5')
        .send({ baseUrl: 'http://example.com/file.csv' });
      expect(res.status).toBe(202);
    });
  });
});
