const express = require('express');
const request = require('supertest');

const mockSaveValidatedRecords = jest.fn();
jest.mock('../../services/csvProcessor', () => jest.fn(() => ({
  saveValidatedRecords: mockSaveValidatedRecords
})));

jest.mock('../../config/database');
jest.mock('../../services/xmlGenerator');
jest.mock('../../services/auditService');

const db = require('../../config/database');
const xmlGenerator = require('../../services/xmlGenerator');
const auditService = require('../../services/auditService');
const publicApiRoutes = require('../../routes/publicApi');

const validKeyRow = {
  id: 1, api_key: 'test-key-123', name: 'Test App', institution: 'Bank',
  bank_id: 1, bank_code: 'BANK01', rate_limit: 100, is_active: true,
  permissions: ['read', 'write'], expires_at: null, last_used_at: null
};

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });
  return app;
}

function authHeader(key) {
  return { 'X-API-Key': key || 'test-key-123' };
}

describe('Public API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/docs', () => {
    it('returns JSON with name, version, endpoints array', async () => {
      const res = await request(createTestApp())
        .get('/api/v1/docs');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('ACS Banking CSV Processor API');
      expect(res.body.version).toBe('1.0.0');
      expect(Array.isArray(res.body.endpoints)).toBe(true);
    });

    it('includes /banks, /cards/validate, /cards/register, /status/:fileLogId', async () => {
      const res = await request(createTestApp())
        .get('/api/v1/docs');

      const paths = res.body.endpoints.map(e => e.path);
      expect(paths).toContain('/banks');
      expect(paths).toContain('/cards/validate');
      expect(paths).toContain('/cards/register');
      expect(paths).toContain('/status/:fileLogId');
    });
  });

  describe('Authentication', () => {
    it('GET /api/v1/banks without API key returns 401 with API_KEY_REQUIRED', async () => {
      const res = await request(createTestApp())
        .get('/api/v1/banks');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('API_KEY_REQUIRED');
    });

    it('GET /api/v1/banks with invalid key returns 401 with INVALID_API_KEY', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'bad-key');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_API_KEY');
    });

    it('GET /api/v1/banks with expired key returns 401 with API_KEY_EXPIRED', async () => {
      const expiredKey = { ...validKeyRow, expires_at: '2020-01-01T00:00:00Z' };
      db.query.mockResolvedValueOnce({ rows: [expiredKey] });

      const res = await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'expired-key');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('API_KEY_EXPIRED');
    });

    it('GET /api/v1/banks with valid key returns 200 with bank list', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01' }] });

      const res = await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'test-key-123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('updates last_used_at on successful auth', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01' }] });

      await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'test-key-123');

      expect(db.query.mock.calls[1][0]).toContain('UPDATE api_keys SET last_used_at');
      expect(db.query.mock.calls[1][1]).toEqual([1]);
    });

    it('auth middleware returns 500 on database error', async () => {
      db.query.mockRejectedValue(new Error('DB down'));

      const res = await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'test-key-123');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('AUTH_ERROR');
    });
  });

  describe('GET /api/v1/banks', () => {
    it('returns only active banks ordered by name', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [
        { id: 1, name: 'Alpha Bank', code: 'ALPHA' },
        { id: 2, name: 'Beta Bank', code: 'BETA' }
      ] });

      const res = await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'test-key-123');

      expect(res.status).toBe(200);
      expect(db.query.mock.calls[2][0]).toContain('is_active = true');
      expect(db.query.mock.calls[2][0]).toContain('ORDER BY name');
    });

    it('returns { success: true, data: [...] }', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });

      const res = await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'test-key-123');

      expect(res.body).toEqual({
        success: true,
        data: [{ id: 1, name: 'Bank A', code: 'BA' }]
      });
    });

    it('returns 500 on database error', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockRejectedValueOnce(new Error('DB error'));

      const res = await request(createTestApp())
        .get('/api/v1/banks')
        .set('X-API-Key', 'test-key-123');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('SERVER_ERROR');
    });
  });

  describe('POST /api/v1/cards/validate', () => {
    it('missing bankCode or cards returns 400 with INVALID_REQUEST', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({});

      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_REQUEST');
    });

    it('invalid cards return with invalidCards', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, code: 'BANK01' }] });

      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234', phone: null, expiry: '13/99' }] });

      expect(res.status).toBe(200);
      expect(res.body.data.invalidCount).toBeGreaterThan(0);
      expect(res.body.data.invalidCards.length).toBeGreaterThan(0);
    });

    it('all valid cards return with validCards', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, code: 'BANK01' }] });

      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({
          bankCode: 'BANK01',
          cards: [{
            pan: '1234567890123456',
            phone: '+21650123456',
            expiry: '12/28',
            firstName: 'John',
            lastName: 'Doe'
          }]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.validCount).toBe(1);
      expect(res.body.data.validCards).toHaveLength(1);
      expect(res.body.data.validCards[0].pan).toBe('1234567890123456');
    });

    it('bank not found returns 404 with BANK_NOT_FOUND', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({ bankCode: 'NONEXIST', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '12/28' }] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('BANK_NOT_FOUND');
    });

    it('rejects invalid month in expiry', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, code: 'BANK01' }] });

      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '13/28' }] });

      expect(res.status).toBe(200);
      expect(res.body.data.invalidCards[0].errors[0].message).toContain('Mois');
    });

    it('rejects expired card', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, code: 'BANK01' }] });

      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '01/25' }] });

      expect(res.status).toBe(200);
      expect(res.body.data.invalidCards.length).toBeGreaterThan(0);
    });

    it('rejects invalid expiry format in validate', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, code: 'BANK01' }] });
      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: 'bad' }] });
      expect(res.status).toBe(200);
      expect(res.body.data.invalidCards[0].errors[0].message).toContain('Format expiry');
    });

    it('returns 500 on database error in validate', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('DB error'));

      const res = await request(createTestApp())
        .post('/api/v1/cards/validate')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '12/28' }] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('SERVER_ERROR');
    });
  });

  describe('POST /api/v1/cards/register', () => {
    it('missing bankCode or cards returns 400', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({});

      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_REQUEST');
    });

    it('full flow: validates, creates file_log, saves records, generates XML, returns success', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01', xml_output_url: '/tmp/xml' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 10 }] });
      mockSaveValidatedRecords.mockResolvedValueOnce([{ id: 100 }, { id: 101 }]);
      xmlGenerator.processAndGenerateXML.mockResolvedValueOnce({ filePath: '/tmp/xml/out.xml', xmlEntriesCount: 4 });
      db.query.mockResolvedValueOnce({ rows: [] });
      auditService.log.mockResolvedValue();

      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({
          bankCode: 'BANK01',
          cards: [
            { pan: '1234567890123456', phone: '+21650123456', expiry: '12/28', firstName: 'John', lastName: 'Doe' },
            { pan: '6543210987654321', phone: '+21650654321', expiry: '01/30', firstName: 'Jane', lastName: 'Doe' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileLogId).toBe(10);
      expect(res.body.data.registered).toBe(2);
      expect(res.body.data.xmlFileName).toContain('ACS_CARDS_BANK01');
      expect(res.body.data.xmlEntriesGenerated).toBe(4);
      expect(auditService.log).toHaveBeenCalled();
    });

    it('with generateXml=false skips XML generation', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01', xml_output_url: '/tmp/xml' }] });
      db.query.mockResolvedValueOnce({ rows: [{ id: 11 }] });
      mockSaveValidatedRecords.mockResolvedValueOnce([{ id: 100 }]);
      auditService.log.mockResolvedValue();

      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({
          bankCode: 'BANK01',
          generateXml: false,
          cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '12/28' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.data.xmlFileName).toBeNull();
      expect(xmlGenerator.processAndGenerateXML).not.toHaveBeenCalled();
    });

    it('no valid cards returns 400 with NO_VALID_CARDS', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01' }] });

      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: 'bad', phone: null, expiry: null }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_VALID_CARDS');
    });

    it('bank not found returns 404', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({ bankCode: 'NONEXIST', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '12/28' }] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('BANK_NOT_FOUND');
    });

    it('returns 500 on database error in register', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('DB error'));

      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '12/28' }] });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('SERVER_ERROR');
    });

    it('rejects invalid month in register', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01' }] });
      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '13/28' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_VALID_CARDS');
    });

    it('rejects invalid year in register', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01' }] });
      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '01/99' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_VALID_CARDS');
    });

    it('rejects expired card in register', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BANK01' }] });
      const res = await request(createTestApp())
        .post('/api/v1/cards/register')
        .set(authHeader())
        .send({ bankCode: 'BANK01', cards: [{ pan: '1234567890123456', phone: '+21650123456', expiry: '01/25' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_VALID_CARDS');
    });
  });

  describe('GET /api/v1/status/:fileLogId', () => {
    it('returns file_log with bank and XML info', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [{
        id: 10, file_name: 'API_BANK01_2026-01-01.csv', status: 'success',
        bank_name: 'Bank A', bank_code: 'BANK01',
        xml_file_name: 'ACS_CARDS_BANK01_20260101.xml', xml_status: 'success', xml_entries_count: 2
      }] });

      const res = await request(createTestApp())
        .get('/api/v1/status/10')
        .set(authHeader());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(10);
      expect(res.body.data.bank_name).toBe('Bank A');
      expect(res.body.data.xml_file_name).toContain('.xml');
    });

    it('not found returns 404 with NOT_FOUND', async () => {
      db.query.mockResolvedValueOnce({ rows: [validKeyRow] });
      db.query.mockResolvedValueOnce({});
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .get('/api/v1/status/999')
        .set(authHeader());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('returns 500 on database error in status', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [validKeyRow] })
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('DB error'));

      const res = await request(createTestApp())
        .get('/api/v1/status/10')
        .set(authHeader());

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('SERVER_ERROR');
    });
  });

  describe('Rate Limiting', () => {
    it('apiRateLimiter blocks after rate_limit requests within window', async () => {
      const keyRow = { ...validKeyRow, rate_limit: 2 };
      db.query.mockResolvedValue({ rows: [keyRow] });

      const app = createTestApp();

      await request(app).get('/api/v1/banks').set('X-API-Key', 'rate-limited-key');
      await request(app).get('/api/v1/banks').set('X-API-Key', 'rate-limited-key');

      const res = await request(app)
        .get('/api/v1/banks')
        .set('X-API-Key', 'rate-limited-key');

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('RATE_LIMIT_EXCEEDED');
    });

  });
});
