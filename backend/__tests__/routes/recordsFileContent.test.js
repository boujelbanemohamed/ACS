const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
jest.mock('../../services/auditService');
jest.mock('../../utils/remoteFileService', () => ({ isRemote: jest.fn(() => false), readFile: jest.fn() }));
jest.mock('../../services/encryptionService', () => ({
  decrypt: jest.fn(v => v.replace('enc:', '')),
  hashPan: jest.fn(),
  maskPan: jest.fn(p => '************' + String(p).slice(-4))
}));
jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = { id: 1, role: req.headers['x-role'] || 'super_admin', bank_id: parseInt(req.headers['x-bank'] || '0') || null };
    next();
  }
}));

const fs = require('fs');
const db = require('../../config/database');
const recordsRoutes = require('../../routes/records');

const app = () => {
  const a = express();
  a.use(express.json());
  a.use('/api/records', recordsRoutes);
  return a;
};

describe('GET /api/records/file-content/byname', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates its parameters', async () => {
    const res = await request(app()).get('/api/records/file-content/byname?type=exe&fileName=a');
    expect(res.status).toBe(400);
  });

  it('returns the CSV records with masked PAN, limited to the user bank', async () => {
    db.query.mockResolvedValue({ rows: [{ first_name: 'Ali', last_name: 'Ben', pan: 'enc:4000056655665556', enrollment_status: 'pending' }] });

    const res = await request(app()).get('/api/records/file-content/byname?type=csv&fileName=a.csv').set('x-role', 'bank').set('x-bank', '3');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ firstName: 'Ali', pan: '************5556', status: 'pending' }));
    expect(db.query.mock.calls[0][0]).toContain('bank_id = $2');
    expect(db.query.mock.calls[0][1]).toEqual(['a.csv', 3]);
  });

  it('returns 404 for a file of another bank (no row visible)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app()).get('/api/records/file-content/byname?type=xml&fileName=x.xml').set('x-role', 'bank').set('x-bank', '3');
    expect(res.status).toBe(404);
  });

  it('returns the XML content with card numbers masked', async () => {
    db.query.mockResolvedValue({ rows: [{ xml_file_path: '/xml/a.xml', bank_id: 3 }] });
    const spy = jest.spyOn(fs.promises, 'readFile').mockResolvedValue('<add id="1" cardNumber="4000056655665556" profileId="BT">');

    const res = await request(app()).get('/api/records/file-content/byname?type=xml&fileName=a.xml');

    expect(res.status).toBe(200);
    expect(res.body.data).toContain('cardNumber="************5556"');
    expect(res.body.data).not.toContain('4000056655665556');
    spy.mockRestore();
  });

  it('returns 404 when the XML file is missing on disk', async () => {
    db.query.mockResolvedValue({ rows: [{ xml_file_path: '/xml/gone.xml', bank_id: 3 }] });
    const spy = jest.spyOn(fs.promises, 'readFile').mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));

    const res = await request(app()).get('/api/records/file-content/byname?type=xml&fileName=gone.xml');

    expect(res.status).toBe(404);
    spy.mockRestore();
  });
});

describe('GET /api/records/export/csv', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exports the records of the user bank only, with masked PAN', async () => {
    db.query.mockResolvedValue({ rows: [{ bank_code: 'BT', first_name: 'Ali;Ben', last_name: 'X', pan: 'enc:4000056655665556', processed_at: '2026-01-01T00:00:00Z' }] });

    const res = await request(app()).get('/api/records/export/csv?bankId=9').set('x-role', 'bank_admin').set('x-bank', '3');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(db.query.mock.calls[0][1]).toEqual([3]);
    expect(res.text).toContain('************5556');
    expect(res.text).not.toContain('4000056655665556');
    expect(res.text).toContain('"Ali;Ben"');
  });
});
