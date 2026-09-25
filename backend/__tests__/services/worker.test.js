jest.mock('../../services/queueService', () => ({ processingQueue: { process: jest.fn() } }));
jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('axios', () => jest.fn());
jest.mock('../../services/auditService', () => ({ logAction: jest.fn().mockResolvedValue() }));
jest.mock('../../services/recordHistoryService', () => ({ logAttempt: jest.fn().mockResolvedValue() }));
const mockCommit = jest.fn();
jest.mock('../../services/pipelineService', () => ({ commitValidRecords: (...a) => mockCommit(...a) }));
const mockProcessor = {
  processFileFromURL: jest.fn(),
  processUploadedFile: jest.fn(),
  archiveOldFile: jest.fn(),
  moveFileToDestination: jest.fn(),
  updateFileLog: jest.fn(),
  sanitizeErrors: jest.fn(e => e)
};
jest.mock('../../services/csvProcessor', () => jest.fn(() => mockProcessor));

process.env.PAN_ENCRYPTION_KEY = 'worker-test-key';
jest.spyOn(require('dns').promises, 'lookup').mockImplementation(async (host) =>
  (host === 'internal.example' ? [{ address: '10.0.0.4', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]));
jest.spyOn(console, 'log').mockImplementation(() => {});

const fs = require('fs');
const axios = require('axios');
const db = require('../../config/database');
const { encrypt } = require('../../services/encryptionService');
const { handleProcessUrl, handleUpload, handleProcessManual, handleCallApi } = require('../../services/worker');

const bank = { id: 2, code: 'BT', old_url: '/archive', destination_url: '/dest' };
const job = (data) => ({ data, progress: jest.fn() });
const validCard = { pan: '4000056655665556', phone: '21699123456', expiry: '12/29', firstName: 'Ali', lastName: 'Ben' };

describe('worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM banks')) return { rows: [bank] };
      if (sql.includes('INSERT INTO file_logs')) return { rows: [{ id: 77 }] };
      return { rows: [] };
    });
    mockCommit.mockImplementation(async ({ rows }) => {
      rows.forEach((r, i) => { r.id = i + 1; });
      return { savedRecords: rows, xmlResult: { success: true, fileName: 'ACS.xml', xmlEntriesCount: rows.length * 2 } };
    });
    mockProcessor.archiveOldFile.mockResolvedValue({ success: true });
    mockProcessor.moveFileToDestination.mockResolvedValue({ success: true, destinationPath: '/dest/latest.csv' });
  });

  describe('process-manual', () => {
    it('decrypts the PANs coming from the queue and commits them', async () => {
      const result = await handleProcessManual(job({ bankId: 2, entries: [{ ...validCard, pan: encrypt(validCard.pan) }], username: 'u' }));

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      const committed = mockCommit.mock.calls[0][0];
      expect(committed.rows[0].pan).toBe('4000056655665556');
      expect(committed.fileLogId).toBe(77);
    });

    it('refuses invalid entries (defensive re-validation)', async () => {
      await expect(handleProcessManual(job({ bankId: 2, entries: [{ pan: encrypt('123') }] })))
        .rejects.toThrow('invalide');
      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('call-api', () => {
    beforeEach(() => {
      axios.mockResolvedValue({ data: { items: [validCard, { pan: 'bad' }] } });
    });

    it('decrypts the secret, drops forbidden headers, disables redirects and validates the cards', async () => {
      const result = await handleCallApi(job({
        bankId: 2, url: 'https://api.example.com/cards', method: 'GET', dataPath: 'items',
        headers: { Host: 'evil', 'X-Custom': '1' }, authType: 'bearer', authToken: encrypt('s3cret')
      }));

      const config = axios.mock.calls[0][0];
      expect(config.headers.Authorization).toBe('Bearer s3cret');
      expect(config.headers.Host).toBeUndefined();
      expect(config.headers['X-Custom']).toBe('1');
      expect(config.maxRedirects).toBe(0);
      expect(result.stats).toEqual(expect.objectContaining({ totalRows: 2, validRows: 1, invalidRows: 1 }));
      // Résultat conservé dans Redis : PAN masqué
      expect(result.validRows[0].pan).not.toBe('4000056655665556');
      expect(result.validRows[0].pan.endsWith('5556')).toBe(true);
    });

    it('re-checks the URL at execution time (SSRF / DNS rebinding)', async () => {
      await expect(handleCallApi(job({ bankId: 2, url: 'http://internal.example/cards' }))).rejects.toThrow('interne');
      expect(axios).not.toHaveBeenCalled();
    });
  });

  describe('upload', () => {
    it('always deletes the uploaded file, even when processing fails', async () => {
      const unlink = jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
      mockProcessor.processUploadedFile.mockRejectedValue(new Error('parse failed'));

      await expect(handleUpload(job({ bankId: 2, filePath: '/uploads/a.csv', originalName: 'a.csv' }))).rejects.toThrow('parse failed');

      expect(unlink).toHaveBeenCalledWith('/uploads/a.csv');
      unlink.mockRestore();
    });

    it('does not save anything when the file has blocking errors', async () => {
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
      mockProcessor.processUploadedFile.mockResolvedValue({
        success: false, fileLogId: 5, stats: { totalRows: 1 }, errors: [{ severity: 'error' }], validRecords: []
      });

      const result = await handleUpload(job({ bankId: 2, filePath: '/uploads/a.csv', originalName: 'a.csv' }));

      expect(result.success).toBe(false);
      expect(result.totalValidRows).toBe(0);
      expect(mockCommit).not.toHaveBeenCalled();
    });
  });

  describe('process-url', () => {
    const okResult = { success: true, fileLogId: 9, stats: {}, errors: [], validRecords: [{ ...validCard }] };

    it('archives BEFORE moving a file source, in the parent folder of the file', async () => {
      const order = [];
      mockProcessor.processFileFromURL.mockResolvedValue({ ...okResult, validRecords: [{ ...validCard }] });
      mockProcessor.archiveOldFile.mockImplementation(async (dir) => { order.push(['archive', dir]); return { success: true }; });
      mockProcessor.moveFileToDestination.mockImplementation(async (dir) => { order.push(['move', dir]); return { success: true }; });

      await handleProcessUrl(job({ bankId: 2, fileUrl: 'sftp://h/in/BT/latest.csv', fileName: 'latest.csv' }));

      expect(order).toEqual([['archive', 'sftp://h/in/BT'], ['move', 'sftp://h/in/BT']]);
      expect(mockProcessor.processFileFromURL).toHaveBeenCalledWith(2, 'sftp://h/in/BT/latest.csv', 'latest.csv',
        { corrections: [], sourceType: 'url', trustedUrl: false });
    });

    it('does not try to move an HTTP source', async () => {
      mockProcessor.processFileFromURL.mockResolvedValue({ ...okResult, validRecords: [{ ...validCard }] });

      await handleProcessUrl(job({ bankId: 2, fileUrl: 'https://files.example.com/BT/latest.csv', fileName: 'latest.csv' }));

      expect(mockProcessor.archiveOldFile).not.toHaveBeenCalled();
      expect(mockProcessor.moveFileToDestination).not.toHaveBeenCalled();
    });

    it('passes the user corrections to the reprocessing', async () => {
      mockProcessor.processFileFromURL.mockResolvedValue({ success: false, fileLogId: 9, stats: {}, errors: [], validRecords: [] });
      const corrections = [{ rowNumber: 2, field: 'phone', value: '21699123456' }];

      await handleProcessUrl(job({ bankId: 2, fileUrl: '/in/a.csv', fileName: 'a.csv', corrections, sourceType: 'cron', trustedUrl: true }));

      expect(mockProcessor.processFileFromURL).toHaveBeenCalledWith(2, '/in/a.csv', 'a.csv', { corrections, sourceType: 'cron', trustedUrl: true });
      expect(mockCommit).not.toHaveBeenCalled();
    });
  });
});
