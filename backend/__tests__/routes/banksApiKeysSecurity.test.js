const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
jest.mock('../../services/auditService');
jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 1, username: 'u', role: req.headers['x-role'] || 'super_admin', bank_id: parseInt(req.headers['x-bank'] || '0') || null };
    next();
  }
}));

const db = require('../../config/database');
const auditService = require('../../services/auditService');
const banksRoutes = require('../../routes/banks');
const apiKeysRoutes = require('../../routes/apiKeys');

const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/banks', banksRoutes);
  a.use('/api/api-keys', apiKeysRoutes);
  return a;
};

const storedBank = {
  id: 3, code: 'BT', name: 'Banque', source_url: 'sftp://user:s3cr3t@sftp.bt.tn/in',
  destination_url: '/data/out', old_url: '/data/old', xml_output_url: 'sftp://user:s3cr3t@sftp.bt.tn/xml'
};

describe('banks: SFTP credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auditService.logAction.mockResolvedValue();
  });

  it('never returns the password stored in bank URLs', async () => {
    db.query.mockResolvedValue({ rows: [storedBank] });
    const res = await request(app()).get('/api/banks/3');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('s3cr3t');
    expect(res.body.data.source_url).toBe('sftp://user:***@sftp.bt.tn/in');
  });

  it('a bank user cannot read another bank', async () => {
    const res = await request(app()).get('/api/banks/3').set('x-role', 'bank').set('x-bank', '4');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('saving the masked URL keeps the stored password; audit logs are redacted', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [storedBank] })
      .mockResolvedValueOnce({ rows: [{ ...storedBank, name: 'Nouveau nom' }] });

    const res = await request(app()).put('/api/banks/3').send({ name: 'Nouveau nom', source_url: 'sftp://user:***@sftp.bt.tn/in' });

    expect(res.status).toBe(200);
    const updateParams = db.query.mock.calls[1][1];
    expect(updateParams[2]).toBe('sftp://user:s3cr3t@sftp.bt.tn/in');
    // Seules les données (hors objet req) sont journalisées
    expect(JSON.stringify(auditService.logAction.mock.calls.map(c => c[1]))).not.toContain('s3cr3t');
  });

  it('rejects a bank code that could break the XML', async () => {
    const res = await request(app()).post('/api/banks').send({
      code: 'B"T<', name: 'X', source_url: '/a', destination_url: '/b', old_url: '/c', xml_output_url: '/d'
    });
    expect(res.status).toBe(400);
  });
});

describe('api keys: the key is never stored nor returned in clear', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creation stores only the SHA-256 hash and shows the key once', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 9, name: 'k', key_hash: 'h', key_prefix: 'acs_abc' }] });

    const res = await request(app()).post('/api/api-keys').send({ name: 'k', bankId: 3, permissions: ['read', 'admin'] });

    expect(res.status).toBe(200);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('key_hash');
    const key = res.body.data.api_key;
    expect(key).toMatch(/^acs_[0-9a-f]{64}$/);
    expect(params).not.toContain(key);
    expect(params[1]).toBe(require('crypto').createHash('sha256').update(key).digest('hex'));
    // Permission inconnue ignorée
    expect(params[5]).toEqual(['read']);
    expect(res.body.data.key_hash).toBeUndefined();
  });

  it('the list never contains the key nor its hash, and is limited to the user bank', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 1, name: 'k', api_key: 'legacy-clear', key_hash: 'h', key_prefix: 'acs_abc', bank_id: 3 }] });

    const res = await request(app()).get('/api/api-keys?bankId=9').set('x-role', 'bank_admin').set('x-bank', '3');

    expect(res.status).toBe(200);
    expect(res.body.data[0].api_key).toBeUndefined();
    expect(res.body.data[0].key_hash).toBeUndefined();
    expect(res.body.data[0].key_prefix).toBe('acs_abc');
    expect(db.query.mock.calls[0][1]).toEqual([3]);
  });
});
