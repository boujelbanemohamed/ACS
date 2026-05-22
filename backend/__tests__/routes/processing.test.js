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
jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 1, username: 'admin', role: 'super_admin', bank_id: null };
    next();
  }
}));
jest.mock('../../middleware/roleMiddleware', () => ({
  forceBankId: (req, res, next) => next()
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
      expect(res.body.data.fileLogId).toBe(42);
    });

    it('handles csvProcessor failure gracefully', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true, destination_url: '/dest', old_url: '/old' }] });

      mockCsvProcessor.processFileFromURL.mockRejectedValue(new Error('Download failed'));

      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, baseUrl: 'http://valid-url.com' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('processes URL and generates XML when records exist', async () => {
      const bankRow = { id: 1, name: 'Bank A', code: 'BA', is_active: true, destination_url: '/dest', old_url: '/old' };
      db.query
        .mockResolvedValueOnce({ rows: [bankRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockCsvProcessor.processFileFromURL.mockResolvedValue({
        success: true,
        fileLogId: 42,
        validRecords: [
          { pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create', firstName: 'John', lastName: 'Doe', language: 'fr', behaviour: 'otp' }
        ],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0 }
      });
      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 1, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/process-url')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, baseUrl: 'http://valid-url.com' });

      expect(res.status).toBe(200);
      const xmlGenerator = require('../../services/xmlGenerator');
      expect(xmlGenerator.processAndGenerateXML).toHaveBeenCalled();
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

      mockCsvProcessor.parseAndValidateCSV.mockResolvedValue({
        rows: [{ language: 'fr', firstName: 'John', lastName: 'Doe', pan: '4000056655665556', expiry: '12/28', phone: '21699123456', behaviour: 'otp', action: 'create' }],
        errors: [],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 }
      });
      mockCsvProcessor.createFileLog.mockResolvedValue(1);
      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 1, pan: '4000056655665556' }]);
      db.query.mockResolvedValue({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1')
        .attach('file', Buffer.from(csvContent), 'test.csv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileLogId).toBe(1);
    });

    it('handles validation errors during upload', async () => {
      mockCsvProcessor.parseAndValidateCSV.mockResolvedValue({
        rows: [],
        errors: [{ rowNumber: 1, field: 'pan', error: 'PAN invalide', severity: 'error' }],
        stats: { totalRows: 1, validRows: 0, invalidRows: 1, duplicateRows: 0 }
      });
      mockCsvProcessor.createFileLog.mockResolvedValue(2);

      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1')
        .attach('file', Buffer.from('invalid'), 'bad.csv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.data.errors).toHaveLength(1);
    });

    it('returns 500 when csvProcessor throws', async () => {
      mockCsvProcessor.parseAndValidateCSV.mockRejectedValue(new Error('Parse error'));

      const res = await request(createTestApp())
        .post('/api/processing/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bankId', '1')
        .attach('file', Buffer.from('a,b,c'), 'bad.csv');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
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
  });

  describe('POST /api/processing/reprocess/:fileLogId', () => {
    it('reprocesses file successfully', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, bank_id: 1, file_name: 'test.csv', original_path: '/tmp/test.csv', status: 'validation_error', name: 'Bank A', code: 'BA' }]
      });

      mockCsvProcessor.processFileFromURL.mockResolvedValue({
        success: true,
        fileLogId: 2,
        stats: { totalRows: 5, validRows: 4, invalidRows: 1 },
        errors: []
      });

      const res = await request(createTestApp())
        .post('/api/processing/reprocess/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileLogId).toBe(2);
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

      mockCsvProcessor.processFileFromURL.mockRejectedValue(new Error('Reprocess failed'));

      const res = await request(createTestApp())
        .post('/api/processing/reprocess/1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
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
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 100, pan: 'encrypted:4000056655665556' }] });

      const { encrypt, hashPan } = require('../../services/encryptionService');
      encrypt.mockReturnValue('encrypted:4000056655665556');
      hashPan.mockReturnValue('hash:4000056655665556');

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

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileLogId).toBe(10);
      expect(res.body.data.recordsProcessed).toBe(1);
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
      expect(res.body.message).toContain('non trouvee');
    });

    it('processes multiple entries and logs each to history', async () => {
      const recordHistoryService = require('../../services/recordHistoryService');

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 20 }] })
        .mockResolvedValueOnce({ rows: [{ id: 101, pan: 'encrypted:4000056655665556' }] })
        .mockResolvedValueOnce({ rows: [{ id: 102, pan: 'encrypted:5000056655665556' }] });

      const { encrypt, hashPan } = require('../../services/encryptionService');
      encrypt.mockReturnValue('encrypted:test');
      hashPan.mockReturnValue('hash:test');

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

      expect(res.status).toBe(200);
      expect(res.body.data.recordsProcessed).toBe(2);
      expect(recordHistoryService.logAttempt).toHaveBeenCalledTimes(2);
    });

    it('handles DB error during record insertion', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 30 }] })
        .mockRejectedValueOnce(new Error('Insert failed'));

      const res = await request(createTestApp())
        .post('/api/processing/process-manual')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          entries: [
            { firstName: 'John', lastName: 'Doe', pan: '4000056655665556', expiry: '12/28', phone: '21699123456', action: 'create' }
          ]
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
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

    it('successfully calls external API and processes response', async () => {
      axios.mockResolvedValue({
        data: [
          { pan: '4000056655665556', expiry: '12/28', phone: '21699123456', firstName: 'John', lastName: 'Doe' }
        ]
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [{ id: 50 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 200, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stats.totalRows).toBe(1);
      expect(res.body.data.stats.validRows).toBe(1);
    });

    it('extracts data using dataPath', async () => {
      axios.mockResolvedValue({
        data: {
          results: {
            items: [
              { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }
            ]
          }
        }
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [{ id: 51 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 201, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET', dataPath: 'results.items' });

      expect(res.status).toBe(200);
      expect(res.body.data.stats.validRows).toBe(1);
    });

    it('handles bad dataPath with missing keys', async () => {
      axios.mockResolvedValue({
        data: {
          results: {
            items: [
              { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }
            ]
          }
        }
      });

      db.query.mockResolvedValueOnce({ rows: [{ id: 60 }] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([]);

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET', dataPath: 'nonexistent.path' });

      expect(res.status).toBe(200);
      expect(res.body.data.stats.totalRows).toBe(0);
      expect(res.body.data.stats.validRows).toBe(0);
    });

    it('wraps single-object response into an array', async () => {
      axios.mockResolvedValue({
        data: { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 61 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 206, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/single', method: 'GET' });

      expect(res.status).toBe(200);
      expect(res.body.data.stats.totalRows).toBe(1);
      expect(res.body.data.stats.validRows).toBe(1);
    });

    it('rejects response with invalid PAN from API', async () => {
      axios.mockResolvedValue({
        data: [
          { pan: '1234', expiry: '12/28', phone: '21699123456' },
          { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }
        ]
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 62 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 207, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(200);
      expect(res.body.data.stats.totalRows).toBe(2);
      expect(res.body.data.stats.validRows).toBe(1);
      expect(res.body.data.stats.invalidRows).toBe(1);
    });

    it('handles API call with bearer auth', async () => {
      axios.mockResolvedValue({
        data: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }]
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [{ id: 52 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 202, pan: '4000056655665556' }]);

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

      expect(res.status).toBe(200);
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' })
      }));
    });

    it('handles API call with basic auth', async () => {
      axios.mockResolvedValue({
        data: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }]
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [{ id: 53 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 203, pan: '4000056655665556' }]);

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

      expect(res.status).toBe(200);
    });

    it('handles API call with apiKey auth', async () => {
      axios.mockResolvedValue({
        data: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }]
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [{ id: 54 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 204, pan: '4000056655665556' }]);

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

      expect(res.status).toBe(200);
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'key-123' })
      }));
    });

    it('handles axios failure gracefully', async () => {
      axios.mockRejectedValue(new Error('Connection refused'));

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({ bankId: 1, url: 'http://api.example.com/data', method: 'GET' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('makes POST request when method is POST', async () => {
      axios.mockResolvedValue({
        data: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }]
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [{ id: 55 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 205, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          url: 'http://api.example.com/submit',
          method: 'POST'
        });

      expect(res.status).toBe(200);
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST'
      }));
    });

    it('sends request body with POST method', async () => {
      axios.mockResolvedValue({
        data: [{ pan: '4000056655665556', expiry: '12/28', phone: '21699123456' }]
      });

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 56 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockCsvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 208, pan: '4000056655665556' }]);

      const res = await request(createTestApp())
        .post('/api/processing/call-api')
        .set('Authorization', 'Bearer test-token')
        .send({
          bankId: 1,
          url: 'http://api.example.com/submit',
          method: 'POST',
          body: { firstName: 'John', pan: '4000056655665556' }
        });

      expect(res.status).toBe(200);
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        data: expect.objectContaining({ firstName: 'John' })
      }));
    });
  });
});
