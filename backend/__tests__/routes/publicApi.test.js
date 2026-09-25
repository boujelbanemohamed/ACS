const express = require('express');
const request = require('supertest');
const crypto = require('crypto');

const mockCommitValidRecords = jest.fn();
jest.mock('../../services/pipelineService', () => ({
  commitValidRecords: (...args) => mockCommitValidRecords(...args)
}));

jest.mock('../../config/database');
jest.mock('../../services/auditService');

const db = require('../../config/database');
const auditService = require('../../services/auditService');
const publicApiRoutes = require('../../routes/publicApi');

const API_KEY = 'acs_test-key-123';
const API_KEY_HASH = crypto.createHash('sha256').update(API_KEY).digest('hex');

// Carte de test valide : PAN conforme Luhn, expiration future
const futureExpiry = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String((d.getFullYear() + 3) % 100).padStart(2, '0')}`;
};
const validCard = () => ({ pan: '4000056655665556', phone: '+21699123456', expiry: futureExpiry(), firstName: 'Ali', lastName: 'Ben' });

const baseKey = {
  id: 1, name: 'Test App', institution: 'Bank', key_hash: API_KEY_HASH,
  bank_id: 1, bank_code: 'BANK01', rate_limit: 100, is_active: true,
  permissions: ['read', 'write'], expires_at: null, last_used_at: null
};

const banks = {
  BANK01: { id: 1, code: 'BANK01', name: 'Bank A', is_active: true, xml_output_url: '/tmp/xml' },
  BANK02: { id: 2, code: 'BANK02', name: 'Bank B', is_active: true, xml_output_url: '/tmp/xml' }
};

let state;

// Base simulée : chaque requête SQL est routée selon son contenu
function installDb() {
  db.query.mockImplementation(async (sql, params = []) => {
    if (state.failOn && sql.includes(state.failOn)) throw new Error('DB error');
    if (sql.includes('FROM api_keys')) {
      return { rows: params[0] === API_KEY_HASH && state.key ? [{ ...state.key }] : [] };
    }
    if (sql.startsWith('UPDATE api_keys SET last_used_at')) return { rows: [] };
    if (sql.includes('INSERT INTO api_rate_limits')) {
      state.requestCount += 1;
      return { rows: [{ request_count: state.requestCount }] };
    }
    if (sql.includes('DELETE FROM api_rate_limits')) return { rows: [] };
    if (sql.includes('INSERT INTO api_logs')) {
      state.apiLogs.push(params);
      return { rows: [] };
    }
    if (sql.includes('FROM banks WHERE is_active = true AND id = $1')) {
      return { rows: Object.values(banks).filter(b => b.id === params[0]) };
    }
    if (sql.includes('FROM banks WHERE is_active = true ORDER BY name')) {
      return { rows: Object.values(banks) };
    }
    if (sql.includes('FROM banks WHERE code = $1')) {
      return { rows: banks[params[0]] ? [banks[params[0]]] : [] };
    }
    if (sql.includes('INSERT INTO file_logs')) return { rows: [{ id: 42 }] };
    if (sql.includes('FROM file_logs fl')) {
      return { rows: state.fileLog && state.fileLog.id === params[0] ? [state.fileLog] : [] };
    }
    return { rows: [] };
  });
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRoutes);
  return app;
}

const api = () => request(createTestApp());

describe('Public API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    state = { key: { ...baseKey }, requestCount: 0, apiLogs: [], fileLog: null, failOn: null };
    installDb();
    mockCommitValidRecords.mockImplementation(async ({ rows, generateXml }) => ({
      savedRecords: rows.map((r, i) => ({ id: i + 1, pan: r.pan })),
      xmlResult: generateXml === false ? null : { success: true, fileName: 'ACS_CARDS_BANK01.xml', xmlEntriesCount: rows.length * 2 }
    }));
    auditService.log.mockResolvedValue();
  });

  describe('GET /api/v1/docs', () => {
    it('returns JSON with name, version, endpoints array', async () => {
      const res = await api().get('/api/v1/docs');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('ACS Banking CSV Processor API');
      expect(res.body.version).toBe('1.0.0');
      expect(Array.isArray(res.body.endpoints)).toBe(true);
    });

    it('includes /banks, /cards/validate, /cards/register, /status/:fileLogId', async () => {
      const res = await api().get('/api/v1/docs');
      const paths = res.body.endpoints.map(e => e.path);
      expect(paths).toEqual(expect.arrayContaining(['/banks', '/cards/validate', '/cards/register', '/status/:fileLogId']));
    });
  });

  describe('Authentication', () => {
    it('returns 401 API_KEY_REQUIRED without API key', async () => {
      const res = await api().get('/api/v1/banks');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('API_KEY_REQUIRED');
    });

    it('returns 401 INVALID_API_KEY with an unknown key', async () => {
      const res = await api().get('/api/v1/banks').set('X-API-Key', 'bad-key');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_API_KEY');
    });

    it('looks the key up by its SHA-256 hash, never in clear text', async () => {
      await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      const lookup = db.query.mock.calls.find(([sql]) => sql.includes('FROM api_keys'));
      expect(lookup[0]).toContain('key_hash = $1');
      expect(lookup[1]).toEqual([API_KEY_HASH]);
    });

    it('returns 401 API_KEY_EXPIRED with an expired key', async () => {
      state.key.expires_at = '2020-01-01T00:00:00Z';
      const res = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('API_KEY_EXPIRED');
    });

    it('accepts Authorization: Bearer <key> and updates last_used_at', async () => {
      const res = await api().get('/api/v1/banks').set('Authorization', `Bearer ${API_KEY}`);
      expect(res.status).toBe(200);
      expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE api_keys SET last_used_at'))).toBe(true);
    });

    it('returns 500 when the key lookup fails', async () => {
      state.failOn = 'FROM api_keys';
      const res = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('AUTH_ERROR');
    });
  });

  describe('GET /api/v1/banks', () => {
    it('a key bound to a bank only sees that bank', async () => {
      const res = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].code).toBe('BANK01');
    });

    it('a global key (no bank) sees every active bank', async () => {
      state.key.bank_id = null;
      const res = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('returns 500 on database error', async () => {
      state.failOn = 'FROM banks';
      const res = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('SERVER_ERROR');
    });
  });

  describe('POST /api/v1/cards/validate', () => {
    it('returns 400 INVALID_REQUEST without bankCode or cards', async () => {
      const res = await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_REQUEST');
    });

    it('returns 404 BANK_NOT_FOUND for an unknown bank', async () => {
      state.key.bank_id = null;
      const res = await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({ bankCode: 'NOPE', cards: [validCard()] });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('BANK_NOT_FOUND');
    });

    it('returns 403 BANK_FORBIDDEN when the key belongs to another bank', async () => {
      const res = await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({ bankCode: 'BANK02', cards: [validCard()] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('BANK_FORBIDDEN');
    });

    it('separates valid and invalid cards', async () => {
      const res = await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({
        bankCode: 'BANK01',
        cards: [validCard(), { pan: '123', phone: '', expiry: 'bad' }]
      });
      expect(res.status).toBe(200);
      expect(res.body.data.validCount).toBe(1);
      expect(res.body.data.invalidCount).toBe(1);
      const fields = res.body.data.invalidCards[0].errors.map(e => e.field);
      expect(fields).toEqual(expect.arrayContaining(['pan', 'phone', 'expiry']));
    });

    it('rejects an invalid month, an expired card and a bad expiry format', async () => {
      const res = await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({
        bankCode: 'BANK01',
        cards: [
          { ...validCard(), expiry: '13/30' },
          { ...validCard(), pan: '5555555555554444', expiry: '01/20' },
          { ...validCard(), pan: '4111111111111111', expiry: '2030-01' }
        ]
      });
      expect(res.status).toBe(200);
      expect(res.body.data.invalidCount).toBe(3);
      const messages = res.body.data.invalidCards.map(c => c.errors[0].message);
      expect(messages[0]).toContain('Mois invalide');
      expect(messages[1]).toContain('expirée');
      expect(messages[2]).toContain('Format expiry');
    });

    it('rejects values outside the allowed lists and duplicate PANs in the request', async () => {
      const res = await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({
        bankCode: 'BANK01',
        cards: [{ ...validCard(), language: 'xx' }, validCard(), validCard()]
      });
      expect(res.body.data.validCount).toBe(1);
      expect(res.body.data.invalidCount).toBe(2);
    });

    it('returns 403 without the read permission', async () => {
      state.key.permissions = ['write'];
      const res = await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01', cards: [validCard()] });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('PERMISSION_DENIED');
    });

    it('never writes a clear PAN in api_logs', async () => {
      await api().post('/api/v1/cards/validate').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01', cards: [validCard()] });
      expect(state.apiLogs.length).toBe(1);
      const [, , , requestBody, , responseBody] = state.apiLogs[0];
      expect(requestBody).not.toContain('4000056655665556');
      expect(responseBody).not.toContain('4000056655665556');
      expect(requestBody).toContain('5556');
    });
  });

  describe('POST /api/v1/cards/register', () => {
    it('returns 400 without bankCode or cards', async () => {
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ cards: [] });
      expect(res.status).toBe(400);
    });

    it('registers valid cards and generates the XML atomically', async () => {
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01', cards: [validCard()] });
      expect(res.status).toBe(200);
      expect(res.body.data.fileLogId).toBe(42);
      expect(res.body.data.registered).toBe(1);
      expect(res.body.data.xmlEntriesGenerated).toBe(2);
      expect(mockCommitValidRecords).toHaveBeenCalledWith(expect.objectContaining({ fileLogId: 42, generateXml: true }));
      expect(mockCommitValidRecords.mock.calls[0][0].bank.id).toBe(1);
    });

    it('skips XML generation with generateXml=false', async () => {
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01', cards: [validCard()], generateXml: false });
      expect(res.status).toBe(200);
      expect(res.body.data.xmlFileName).toBeNull();
      expect(mockCommitValidRecords.mock.calls[0][0].generateXml).toBe(false);
    });

    it('returns 400 NO_VALID_CARDS when every card is invalid', async () => {
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01', cards: [{ pan: '1' }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_VALID_CARDS');
      expect(mockCommitValidRecords).not.toHaveBeenCalled();
    });

    it('cannot register cards for another bank', async () => {
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ bankCode: 'BANK02', cards: [validCard()] });
      expect(res.status).toBe(403);
      expect(mockCommitValidRecords).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown bank', async () => {
      state.key.bank_id = null;
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ bankCode: 'NOPE', cards: [validCard()] });
      expect(res.status).toBe(404);
    });

    it('returns 403 without the write permission', async () => {
      state.key.permissions = ['read'];
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01', cards: [validCard()] });
      expect(res.status).toBe(403);
    });

    it('returns 500 when saving fails', async () => {
      mockCommitValidRecords.mockRejectedValueOnce(new Error('XML write failed'));
      const res = await api().post('/api/v1/cards/register').set('X-API-Key', API_KEY).send({ bankCode: 'BANK01', cards: [validCard()] });
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('SERVER_ERROR');
    });
  });

  describe('GET /api/v1/status/:fileLogId', () => {
    it('returns the processing status without internal paths', async () => {
      state.fileLog = { id: 42, bank_id: 1, status: 'success', original_path: 'sftp://u:secret@h/in', bank_code: 'BANK01', xml_file_name: 'a.xml' };
      const res = await api().get('/api/v1/status/42').set('X-API-Key', API_KEY);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('success');
      expect(res.body.data.original_path).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });

    it('hides the processing of another bank (404)', async () => {
      state.fileLog = { id: 42, bank_id: 2, status: 'success' };
      const res = await api().get('/api/v1/status/42').set('X-API-Key', API_KEY);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND for an unknown id', async () => {
      const res = await api().get('/api/v1/status/999').set('X-API-Key', API_KEY);
      expect(res.status).toBe(404);
    });

    it('returns 500 on database error', async () => {
      state.failOn = 'FROM file_logs fl';
      const res = await api().get('/api/v1/status/42').set('X-API-Key', API_KEY);
      expect(res.status).toBe(500);
    });
  });

  describe('Rate limiting', () => {
    it('blocks requests beyond the key rate_limit (counter shared in database)', async () => {
      state.key.rate_limit = 2;
      const first = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      const second = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      const third = await api().get('/api/v1/banks').set('X-API-Key', API_KEY);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      expect(third.body.error).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});
