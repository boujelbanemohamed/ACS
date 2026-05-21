jest.mock('csv-parser');
jest.mock('fs');
jest.mock('axios');
jest.mock('../../config/database');
jest.mock('../../services/recordHistoryService');
jest.mock('../../utils/validationHelper');
jest.mock('../../utils/remoteFileService');

const mockValidatorInstance = {
  validateHeader: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
  validateRow: jest.fn().mockReturnValue({ isValid: true, errors: [] })
};

jest.mock('../../utils/csvValidator', () => jest.fn(() => mockValidatorInstance));

jest.mock('../../services/encryptionService', () => ({
  encrypt: jest.fn(pan => `enc_${pan}`),
  decrypt: jest.fn(pan => pan.replace('enc_', '')),
  hashPan: jest.fn(pan => `hash_${pan}`)
}));

const db = require('../../config/database');
const fs = require('fs');
const axios = require('axios');
const recordHistoryService = require('../../services/recordHistoryService');
const { validateRowForHistory } = require('../../utils/validationHelper');
const remoteFileService = require('../../utils/remoteFileService');
const { encrypt, decrypt, hashPan } = require('../../services/encryptionService');

const CSVProcessor = require('../../services/csvProcessor');

function setupStreamMock() {
  const onCalls = {};
  const mockCsvStream = {
    on: jest.fn().mockImplementation((event, handler) => {
      onCalls[event] = handler;
      return mockCsvStream;
    })
  };
  fs.createReadStream.mockReturnValue({
    pipe: jest.fn().mockReturnValue(mockCsvStream)
  });
  return onCalls;
}

describe('CSVProcessor', () => {
  let processor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new CSVProcessor();
  });

  describe('normalizeRowData', () => {
    it('handles pan field variants: pan, Pan, PAN', () => {
      expect(processor.normalizeRowData({ pan: '4741000000000006' }, 1).pan).toBe('4741000000000006');
      expect(processor.normalizeRowData({ Pan: '4741000000000007' }, 2).pan).toBe('4741000000000007');
      expect(processor.normalizeRowData({ PAN: '4741000000000008' }, 3).pan).toBe('4741000000000008');
    });

    it('handles firstName field variants', () => {
      expect(processor.normalizeRowData({ firstName: 'John' }, 1).firstName).toBe('John');
      expect(processor.normalizeRowData({ firstname: 'John' }, 1).firstName).toBe('John');
      expect(processor.normalizeRowData({ FirstName: 'John' }, 1).firstName).toBe('John');
      expect(processor.normalizeRowData({ FIRSTNAME: 'John' }, 1).firstName).toBe('John');
      expect(processor.normalizeRowData({ first_name: 'John' }, 1).firstName).toBe('John');
      expect(processor.normalizeRowData({ prenom: 'Jean' }, 1).firstName).toBe('Jean');
      expect(processor.normalizeRowData({ Prenom: 'Jean' }, 1).firstName).toBe('Jean');
      expect(processor.normalizeRowData({ PRENOM: 'Jean' }, 1).firstName).toBe('Jean');
    });

    it('handles lastName field variants', () => {
      expect(processor.normalizeRowData({ lastName: 'Doe' }, 1).lastName).toBe('Doe');
      expect(processor.normalizeRowData({ lastname: 'Doe' }, 1).lastName).toBe('Doe');
      expect(processor.normalizeRowData({ LastName: 'Doe' }, 1).lastName).toBe('Doe');
      expect(processor.normalizeRowData({ LASTNAME: 'Doe' }, 1).lastName).toBe('Doe');
      expect(processor.normalizeRowData({ last_name: 'Doe' }, 1).lastName).toBe('Doe');
      expect(processor.normalizeRowData({ nom: 'Dupont' }, 1).lastName).toBe('Dupont');
      expect(processor.normalizeRowData({ Nom: 'Dupont' }, 1).lastName).toBe('Dupont');
      expect(processor.normalizeRowData({ NOM: 'Dupont' }, 1).lastName).toBe('Dupont');
    });

    it('returns correct normalized row with rowNumber', () => {
      const row = processor.normalizeRowData({ pan: '1234', firstName: 'Alice', lastName: 'Smith' }, 5);
      expect(row).toEqual({
        rowNumber: 5,
        language: '',
        firstName: 'Alice',
        lastName: 'Smith',
        pan: '1234',
        expiry: '',
        phone: '',
        behaviour: '',
        action: ''
      });
    });
  });

  describe('createFileLog', () => {
    it('inserts into file_logs and returns id from db', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 42 }] });
      const id = await processor.createFileLog(1, 'test.csv', '/path/to/file.csv');
      expect(id).toBe(42);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO file_logs'),
        [1, 'test.csv', '/path/to/file.csv']
      );
    });
  });

  describe('updateFileLog', () => {
    it('builds dynamic UPDATE with parameterized fields', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await processor.updateFileLog(10, { status: 'success', total_rows: 100 });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE file_logs'),
        ['success', 100, 10]
      );
    });
  });

  describe('saveValidationErrors', () => {
    it('inserts each error from array into validation_errors', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const errors = [
        { rowNumber: 1, field: 'pan', value: '123', error: 'Invalid PAN', severity: 'error' },
        { rowNumber: 2, field: 'expiry', value: '13/25', error: 'Invalid expiry', severity: 'warning' }
      ];
      await processor.saveValidationErrors(5, errors);
      expect(db.query).toHaveBeenCalledTimes(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO validation_errors'),
        [5, 1, 'pan', '123', 'Invalid PAN', 'error']
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO validation_errors'),
        [5, 2, 'expiry', '13/25', 'Invalid expiry', 'warning']
      );
    });
  });

  describe('saveValidatedRecords', () => {
    it('encrypts PAN, hashPan, inserts, and returns saved records with decrypted PAN', async () => {
      const rows = [
        { pan: '4741000000000006', firstName: 'John', lastName: 'Doe', language: 'FR', expiry: '12/25', phone: '0612345678', behaviour: 'GOOD', action: 'UPDATE' }
      ];
      db.query.mockResolvedValue({ rows: [{ id: 1, pan: 'enc_4741000000000006' }] });

      const saved = await processor.saveValidatedRecords(1, rows, 'input.csv');

      expect(encrypt).toHaveBeenCalledWith('4741000000000006');
      expect(hashPan).toHaveBeenCalledWith('4741000000000006');
      expect(saved).toHaveLength(1);
      expect(saved[0].id).toBe(1);
      expect(saved[0].pan).toBe('4741000000000006');
    });
  });

  describe('downloadFile', () => {
    it('HTTP URL uses axios.get with responseType stream', async () => {
      const mockWriter = { on: jest.fn().mockImplementation((event, handler) => { if (event === 'finish') handler(); return mockWriter; }) };
      fs.createWriteStream.mockReturnValue(mockWriter);
      axios.mockResolvedValue({ data: { pipe: jest.fn() } });

      await processor.downloadFile('http://example.com/file.csv', '/tmp/file.csv');

      expect(axios).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://example.com/file.csv',
        responseType: 'stream',
        timeout: 30000
      });
      expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/file.csv');
    });

    it('local file:// URL uses fs.cpSync with cleaned path', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.cpSync.mockReturnValue(undefined);

      await processor.downloadFile('file:///local/path/file.csv', '/tmp/file.csv');

      expect(fs.existsSync).toHaveBeenCalledWith('/local/path/file.csv');
      expect(fs.cpSync).toHaveBeenCalledWith('/local/path/file.csv', '/tmp/file.csv');
    });

    it('file not found throws error', async () => {
      fs.existsSync.mockReturnValue(false);

      await expect(processor.downloadFile('file:///nonexistent/file.csv', '/tmp/file.csv'))
        .rejects.toThrow('File not found: /nonexistent/file.csv');
    });
  });

  describe('parseAndValidateCSV', () => {
    it('parses CSV rows, validates headers and rows, returns results', async () => {
      const onCalls = setupStreamMock();
      const parsePromise = processor.parseAndValidateCSV('/path/file.csv', 1);

      onCalls.headers(['pan', 'firstName', 'lastName', 'expiry']);
      onCalls.data({ pan: '4741000000000006', firstName: 'John', lastName: 'Doe', expiry: '12/25' });
      await onCalls.end();

      const result = await parsePromise;
      expect(result.stats.totalRows).toBe(1);
      expect(result.stats.validRows).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].pan).toBe('4741000000000006');
      expect(result.allRows).toHaveLength(1);
    });

    it('handles empty rows and empty CSV', async () => {
      const onCalls = setupStreamMock();
      const parsePromise = processor.parseAndValidateCSV('/path/empty.csv', 1);

      onCalls.headers(['pan', 'firstName']);
      await onCalls.end();

      const result = await parsePromise;
      expect(result.stats.totalRows).toBe(0);
      expect(result.stats.validRows).toBe(0);
      expect(result.rows).toEqual([]);
      expect(result.errors).toEqual([]);
    });
  });

  describe('processFileFromURL', () => {
    it('orchestrates full flow: create log, download, parse, update log, return result', async () => {
      jest.spyOn(processor, 'createFileLog').mockResolvedValue(1);
      jest.spyOn(processor, 'downloadFile').mockResolvedValue(undefined);
      jest.spyOn(processor, 'parseAndValidateCSV').mockResolvedValue({
        rows: [{ pan: '4741000000000006', firstName: 'John' }],
        errors: [],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, updatedRows: 0 },
        allRows: [{ pan: '4741000000000006', firstName: 'John' }]
      });
      jest.spyOn(processor, 'updateFileLog').mockResolvedValue(undefined);
      jest.spyOn(processor, 'saveValidationErrors').mockResolvedValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      const result = await processor.processFileFromURL(1, 'http://example.com/file.csv', 'file.csv');

      expect(processor.createFileLog).toHaveBeenCalledWith(1, 'file.csv', 'http://example.com/file.csv');
      expect(processor.downloadFile).toHaveBeenCalled();
      expect(processor.parseAndValidateCSV).toHaveBeenCalled();
      expect(processor.updateFileLog).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'success' }));
      expect(processor.saveValidationErrors).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.fileLogId).toBe(1);
    });

    it('handles errors: updates file log with error status and re-throws', async () => {
      jest.spyOn(processor, 'createFileLog').mockResolvedValue(2);
      jest.spyOn(processor, 'downloadFile').mockRejectedValue(new Error('Download failed'));
      jest.spyOn(processor, 'updateFileLog').mockResolvedValue(undefined);

      await expect(processor.processFileFromURL(1, 'http://example.com/bad.csv', 'bad.csv')).rejects.toThrow('Download failed');

      expect(processor.updateFileLog).toHaveBeenCalledWith(2, { status: 'error', error_details: 'Download failed' });
    });
  });

  describe('processUploadedFile', () => {
    it('processes uploaded file and returns result with stats', async () => {
      jest.spyOn(processor, 'createFileLog').mockResolvedValue(1);
      jest.spyOn(processor, 'parseAndValidateCSV').mockResolvedValue({
        rows: [{ pan: '4741000000000006' }],
        errors: [],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, updatedRows: 0 },
        allRows: [{ pan: '4741000000000006' }]
      });
      jest.spyOn(processor, 'updateFileLog').mockResolvedValue(undefined);

      const result = await processor.processUploadedFile(1, '/uploads/file.csv', 'file.csv');

      expect(processor.createFileLog).toHaveBeenCalledWith(1, 'file.csv', '/uploads/file.csv');
      expect(result.success).toBe(true);
      expect(result.stats.totalRows).toBe(1);
    });

    it('handles error in processUploadedFile and re-throws', async () => {
      jest.spyOn(processor, 'createFileLog').mockResolvedValue(1);
      jest.spyOn(processor, 'parseAndValidateCSV').mockRejectedValue(new Error('Parse error'));
      jest.spyOn(processor, 'updateFileLog').mockResolvedValue(undefined);

      await expect(processor.processUploadedFile(1, '/uploads/bad.csv', 'bad.csv')).rejects.toThrow('Parse error');

      expect(processor.updateFileLog).toHaveBeenCalledWith(1, { status: 'error', error_details: 'Parse error' });
    });
  });

  describe('checkExistingPAN', () => {
    it('queries db with panHash and returns true when PAN exists', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1 }] });
      const result = await processor.checkExistingPAN(1, '4741000000000006');
      expect(result).toBe(true);
      expect(hashPan).toHaveBeenCalledWith('4741000000000006');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM processed_records'),
        [1, 'hash_4741000000000006']
      );
    });

    it('returns false when no PAN provided', async () => {
      const result = await processor.checkExistingPAN(1, null);
      expect(result).toBe(false);
      expect(db.query).not.toHaveBeenCalled();
    });
  });

  describe('checkForNewFiles', () => {
    it('returns CSV files from HTTP response', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { files: ['report.csv', 'notes.txt', 'data.csv', 'summary.csv'] }
      });

      const files = await processor.checkForNewFiles('http://example.com/files/');

      expect(files).toEqual(['report.csv', 'data.csv', 'summary.csv']);
    });
  });

  describe('moveFileToDestination', () => {
    it('copies and removes source file for local-to-local paths', async () => {
      fs.existsSync.mockImplementation((p) => p === '/base/source_dir');
      fs.mkdirSync.mockReturnValue(undefined);
      fs.cpSync.mockReturnValue(undefined);
      fs.unlinkSync.mockReturnValue(undefined);

      const result = await processor.moveFileToDestination('file:///base/source_dir', 'file:///base/dest_dir', 'file.csv');

      expect(fs.existsSync).toHaveBeenCalledWith('/base/source_dir');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/base/dest_dir', { recursive: true });
      expect(fs.cpSync).toHaveBeenCalledWith('/base/source_dir/file.csv', '/base/dest_dir/file.csv');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/base/source_dir/file.csv');
      expect(result.success).toBe(true);
    });
  });

  describe('archiveOldFile', () => {
    it('copies file with timestamp prefix for local paths', async () => {
      const realDate = Date.now;
      const realToISO = Date.prototype.toISOString;
      Date.now = jest.fn(() => 1716249600000);
      Date.prototype.toISOString = jest.fn(() => '2026-05-21T00:00:00.000Z');

      fs.existsSync.mockReturnValue(true);
      fs.mkdirSync.mockReturnValue(undefined);
      fs.cpSync.mockReturnValue(undefined);

      const result = await processor.archiveOldFile('file:///source/dir', 'file:///archive/dir', 'file.csv');

      expect(fs.cpSync).toHaveBeenCalledWith(
        '/source/dir/file.csv',
        '/archive/dir/OLD_2026-05-21T00-00-00-000Z_file.csv'
      );
      expect(result.success).toBe(true);
      expect(result.archivePath).toContain('OLD_2026-05-21');

      Date.now = realDate;
      Date.prototype.toISOString = realToISO;
    });
  });

  describe('generateCorrectedCSV', () => {
    it('writes CSV content with headers and data rows', async () => {
      fs.writeFileSync.mockReturnValue(undefined);
      const rows = [
        { pan: '4741000000000006', firstName: 'John', lastName: 'Doe', expiry: '12/25', phone: '0612345678', behaviour: 'GOOD', action: 'UPDATE', language: 'FR' },
        { pan: '4111111111111111', firstName: 'Jane', lastName: 'Smith', expiry: '06/27', phone: '0698765432', behaviour: 'BAD', action: 'BLOCK', language: 'EN' }
      ];

      const result = await processor.generateCorrectedCSV(rows, '/output/corrected.csv');

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const csvContent = fs.writeFileSync.mock.calls[0][0];
      expect(fs.writeFileSync.mock.calls[0][1]).toContain('language;firstName;lastName;pan;expiry;phone;behaviour;action');
      expect(fs.writeFileSync.mock.calls[0][1]).toContain('4741000000000006');
      expect(fs.writeFileSync.mock.calls[0][1]).toContain('4111111111111111');
      expect(result).toBe('/output/corrected.csv');
    });
  });

  describe('logRowHistory', () => {
    it('calls validateRowForHistory and recordHistoryService.logAttempt', async () => {
      validateRowForHistory.mockReturnValue({ results: [{ field: 'pan', valid: true }] });
      recordHistoryService.logAttempt.mockResolvedValue(undefined);

      const row = { pan: '4741000000000006', firstName: 'John', rowNumber: 1 };
      await processor.logRowHistory(1, row, 10, 'file.csv', 'upload', 5, 'jdoe', '127.0.0.1', 'SUCCESS');

      expect(validateRowForHistory).toHaveBeenCalledWith(row);
      expect(recordHistoryService.logAttempt).toHaveBeenCalledWith({
        bankId: 1,
        pan: '4741000000000006',
        fileLogId: 10,
        fileName: 'file.csv',
        sourceType: 'upload',
        userId: 5,
        username: 'jdoe',
        status: 'SUCCESS',
        ipAddress: '127.0.0.1',
        userAgent: null,
        dataReceived: row,
        validationResults: [{ field: 'pan', valid: true }],
        processedRecordId: null,
        xmlId: null
      });
    });
  });

  describe('processRowsWithHistory', () => {
    it('iterates allRows, determines status, calls logRowHistory for each', async () => {
      jest.spyOn(processor, 'logRowHistory').mockResolvedValue(undefined);

      const allRows = [
        { pan: '111', rowNumber: 1, firstName: 'A' },
        { pan: '222', rowNumber: 2, firstName: 'B' },
        { pan: '333', rowNumber: 3, firstName: 'C' }
      ];
      const validRows = [{ pan: '111' }, { pan: '222' }];
      const errors = [{ rowNumber: 3, field: 'pan', error: 'Invalid' }];

      await processor.processRowsWithHistory(1, allRows, validRows, errors, 10, 'f.csv', 'upload', 5, 'user', 'ip');

      expect(processor.logRowHistory).toHaveBeenCalledTimes(3);
      expect(processor.logRowHistory).toHaveBeenCalledWith(1, allRows[0], 10, 'f.csv', 'upload', 5, 'user', 'ip', 'SUCCESS');
      expect(processor.logRowHistory).toHaveBeenCalledWith(1, allRows[1], 10, 'f.csv', 'upload', 5, 'user', 'ip', 'SUCCESS');
      expect(processor.logRowHistory).toHaveBeenCalledWith(1, allRows[2], 10, 'f.csv', 'upload', 5, 'user', 'ip', 'REJECTED');
    });
  });
});
