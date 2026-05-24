jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    createReadStream: jest.fn(),
    createWriteStream: jest.fn(),
    existsSync: jest.fn(),
    cpSync: jest.fn(),
    unlinkSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
    promises: {
      access: jest.fn(),
      cp: jest.fn(),
      unlink: jest.fn(),
      writeFile: jest.fn(),
      mkdir: jest.fn(),
      readFile: jest.fn(),
    },
  };
});

let mockCSVStream;
jest.mock('csv-parser', () => {
  return jest.fn().mockImplementation(() => {
    const { Readable } = require('stream');
    const s = new Readable({ objectMode: true, read() {} });
    mockCSVStream = s;
    return s;
  });
});

jest.mock('axios');
jest.mock('../../config/database');
jest.mock('../../services/recordHistoryService');
jest.mock('../../utils/csvValidator');
jest.mock('../../utils/validationHelper');
jest.mock('../../utils/remoteFileService');
jest.mock('../../services/encryptionService');

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const db = require('../../config/database');
const recordHistoryService = require('../../services/recordHistoryService');
const CSVValidator = require('../../utils/csvValidator');
const { validateRowForHistory } = require('../../utils/validationHelper');
const remoteFileService = require('../../utils/remoteFileService');
const { encrypt, decrypt, hashPan } = require('../../services/encryptionService');

const CSVProcessor = require('../../services/csvProcessor');

function makeValidRow(overrides = {}) {
  return {
    language: 'fr',
    firstName: 'John',
    lastName: 'Doe',
    pan: '4000000000000002',
    expiry: '12/28',
    phone: '21624080852',
    behaviour: 'otp',
    action: 'update',
    ...overrides
  };
}

function setupCSVStream(dataRows, headers) {
  if (headers) {
    mockCSVStream.emit('headers', headers);
  }
  dataRows.forEach(row => mockCSVStream.push(row));
  mockCSVStream.push(null);
}

describe('CSVProcessor', () => {
  let processor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCSVStream = null;

    fs.createReadStream.mockReturnValue({
      pipe: jest.fn().mockImplementation(function (dest) { return dest; }),
    });
    fs.createWriteStream.mockReturnValue({
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'finish') process.nextTick(handler);
        return this;
      }),
    });
    fs.promises.access.mockResolvedValue(undefined);
    fs.promises.cp.mockResolvedValue();
    fs.promises.unlink.mockResolvedValue();
    fs.promises.writeFile.mockResolvedValue();
    fs.promises.mkdir.mockResolvedValue();

    remoteFileService.isRemote.mockReturnValue(false);
    remoteFileService.listFiles.mockReset();
    remoteFileService.copyToLocal.mockReset();
    remoteFileService.deleteFile.mockReset();
    remoteFileService.moveFile.mockReset();

    processor = new CSVProcessor();
    processor.validator.validateHeader.mockReturnValue({ isValid: true, errors: [] });
    processor.validator.validateRow.mockReturnValue({ isValid: true, errors: [] });

    db.query.mockResolvedValue({ rows: [] });

    encrypt.mockImplementation(v => `enc_${v}`);
    decrypt.mockImplementation(v => {
      if (typeof v === 'string' && v.startsWith('enc_')) return v.slice(4);
      return v;
    });
    hashPan.mockImplementation(v => `hash_${v}`);

    axios.mockReset();
    axios.mockResolvedValue({ data: { pipe: jest.fn().mockReturnThis() } });
    axios.get = jest.fn();
  });

  describe('normalizeRowData', () => {
    it('normalizes row with standard casing', () => {
      const result = processor.normalizeRowData({
        language: 'fr', firstName: 'John', lastName: 'Doe',
        pan: '1234', expiry: '12/28', phone: '21624080852',
        behaviour: 'otp', action: 'update'
      }, 1);

      expect(result.language).toBe('fr');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.pan).toBe('1234');
      expect(result.rowNumber).toBe(1);
    });

    it('handles uppercase field names', () => {
      const result = processor.normalizeRowData({
        LANGUAGE: 'en', FIRSTNAME: 'Jane', LASTNAME: 'Smith',
        PAN: '5678', EXPIRY: '06/30', PHONE: '21624080853',
        BEHAVIOUR: 'sms', ACTION: 'create'
      }, 2);

      expect(result.language).toBe('en');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(result.pan).toBe('5678');
    });

    it('handles French field names (prenom/nom)', () => {
      const result = processor.normalizeRowData({
        prenom: 'Pierre', nom: 'Dupont', pan: '9999',
        language: 'fr', expiry: '12/28', phone: '21624080854',
        behaviour: 'email', action: 'update'
      }, 3);

      expect(result.firstName).toBe('Pierre');
      expect(result.lastName).toBe('Dupont');
    });

    it('defaults missing fields to empty string', () => {
      const result = processor.normalizeRowData({}, 4);

      expect(result.language).toBe('');
      expect(result.firstName).toBe('');
      expect(result.lastName).toBe('');
      expect(result.pan).toBe('');
      expect(result.expiry).toBe('');
      expect(result.phone).toBe('');
      expect(result.behaviour).toBe('');
      expect(result.action).toBe('');
    });
  });

  describe('parseAndValidateCSV', () => {
    it('parses valid rows successfully', async () => {
      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([makeValidRow()], [
        'language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'
      ]);

      const result = await promise;
      expect(result.stats.totalRows).toBe(1);
      expect(result.stats.validRows).toBe(1);
      expect(result.stats.invalidRows).toBe(0);
      expect(result.stats.duplicateRows).toBe(0);
      expect(result.rows).toHaveLength(1);
      expect(result.allRows).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('skips empty rows', async () => {
      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([
        makeValidRow(),
        { language: '', firstName: '', lastName: '', pan: '', expiry: '', phone: '', behaviour: '', action: '' }
      ], ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action']);

      const result = await promise;
      expect(result.stats.totalRows).toBe(2);
      expect(result.stats.validRows).toBe(1);
      expect(result.stats.invalidRows).toBe(0);
      expect(result.allRows).toHaveLength(2);
      expect(result.rows).toHaveLength(1);
    });

    it('detects duplicate PANs within file', async () => {
      const row1 = makeValidRow({ pan: '4000000000000002' });
      const row2 = makeValidRow({ pan: '4000000000000002' });

      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([row1, row2], [
        'language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'
      ]);

      const result = await promise;
      expect(result.stats.totalRows).toBe(2);
      expect(result.stats.validRows).toBe(1);
      expect(result.stats.duplicateRows).toBe(1);
      expect(result.stats.invalidRows).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('PAN en double');
    });

    it('reports header validation errors', async () => {
      processor.validator.validateHeader.mockReturnValue({
        isValid: false,
        errors: [{ field: 'header', error: 'Champ requis manquant: firstName', severity: 'error' }]
      });

      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      mockCSVStream.emit('headers', ['language', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action']);
      mockCSVStream.push(makeValidRow());
      mockCSVStream.push(null);

      const result = await promise;
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('firstName');
    });

    it('reports row validation errors', async () => {
      processor.validator.validateRow.mockReturnValue({
        isValid: false,
        errors: [{ field: 'phone', error: 'Format téléphone invalide', severity: 'error' }]
      });

      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([makeValidRow({ phone: '123' })], [
        'language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'
      ]);

      const result = await promise;
      expect(result.stats.invalidRows).toBe(1);
      expect(result.stats.validRows).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('phone');
    });

    it('rejects on stream error', async () => {
      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      mockCSVStream.emit('error', new Error('Stream corrupted'));

      await expect(promise).rejects.toThrow('Stream corrupted');
    });

    it('checks existing PAN in database', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([makeValidRow()], [
        'language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'
      ]);

      const result = await promise;
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM processed_records'),
        [1, 'hash_4000000000000002']
      );
      expect(result.stats.validRows).toBe(1);
      expect(result.stats.updatedRows).toBe(0);
    });

    it('marks row as updated when PAN exists in database', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([makeValidRow()], [
        'language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'
      ]);

      const result = await promise;
      expect(result.stats.updatedRows).toBe(1);
      expect(result.stats.validRows).toBe(1);
    });

    it('handles missing PAN in row gracefully', async () => {
      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([makeValidRow({ pan: '' })], [
        'language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'
      ]);

      const result = await promise;
      expect(result.stats.totalRows).toBe(1);
    });

    it('processes multiple valid rows', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const promise = processor.parseAndValidateCSV('/fake/test.csv', 1);

      setupCSVStream([
        makeValidRow({ pan: '4000000000000002' }),
        makeValidRow({ pan: '5000000000000009' }),
        makeValidRow({ pan: '6000000000000004' }),
      ], ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action']);

      const result = await promise;
      expect(result.stats.totalRows).toBe(3);
      expect(result.stats.validRows).toBe(3);
      expect(result.rows).toHaveLength(3);
    });
  });

  describe('checkExistingPAN', () => {
    it('returns true when PAN exists in database', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1 }] });
      const result = await processor.checkExistingPAN(1, '4000000000000002');
      expect(result).toBe(true);
      expect(hashPan).toHaveBeenCalledWith('4000000000000002');
    });

    it('returns false when PAN not found', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const result = await processor.checkExistingPAN(1, '4000000000000002');
      expect(result).toBe(false);
    });

    it('returns false for empty PAN', async () => {
      const result = await processor.checkExistingPAN(1, '');
      expect(result).toBe(false);
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns false for null PAN', async () => {
      const result = await processor.checkExistingPAN(1, null);
      expect(result).toBe(false);
    });
  });

  describe('downloadFile', () => {
    it('downloads file from HTTP URL', async () => {
      const mockPipe = jest.fn().mockReturnThis();
      axios.mockResolvedValue({ data: { pipe: mockPipe } });

      await processor.downloadFile('http://example.com/file.csv', '/tmp/file.csv');

      expect(axios).toHaveBeenCalledWith({
        method: 'GET',
        url: 'http://example.com/file.csv',
        responseType: 'stream',
        timeout: 30000
      });
      expect(fs.createWriteStream).toHaveBeenCalledWith('/tmp/file.csv');
    });

    it('downloads file from HTTPS URL', async () => {
      axios.mockResolvedValue({ data: { pipe: jest.fn().mockReturnThis() } });

      await processor.downloadFile('https://example.com/file.csv', '/tmp/file.csv');

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com/file.csv' })
      );
    });

    it('copies file from local filesystem', async () => {
      await processor.downloadFile('file:///data/file.csv', '/tmp/file.csv');
      expect(fs.promises.cp).toHaveBeenCalledWith('/data/file.csv', '/tmp/file.csv');
    });

    it('copies file from plain local path', async () => {
      await processor.downloadFile('/data/file.csv', '/tmp/file.csv');
      expect(fs.promises.access).toHaveBeenCalledWith('/data/file.csv');
      expect(fs.promises.cp).toHaveBeenCalledWith('/data/file.csv', '/tmp/file.csv');
    });

    it('throws when local file not found', async () => {
      fs.promises.access.mockRejectedValue(new Error('ENOENT'));
      await expect(
        processor.downloadFile('/data/file.csv', '/tmp/file.csv')
      ).rejects.toThrow('File not found');
    });

    it('handles remote URL via remoteFileService', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.copyToLocal.mockResolvedValue();

      await processor.downloadFile('sftp://server/file.csv', '/tmp/file.csv');

      expect(remoteFileService.copyToLocal).toHaveBeenCalledWith(
        'sftp://server/file.csv', '/tmp/file.csv'
      );
    });
  });

  describe('processFileFromURL', () => {
    beforeEach(() => {
      db.query.mockResolvedValue({ rows: [{ id: 42 }] });
      axios.mockResolvedValue({ data: { pipe: jest.fn().mockReturnThis() } });
    });

    it('processes file from HTTP URL successfully', async () => {
      jest.spyOn(processor, 'parseAndValidateCSV').mockResolvedValue({
        rows: [makeValidRow()],
        errors: [],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, updatedRows: 0 },
        allRows: [makeValidRow()]
      });

      const result = await processor.processFileFromURL(1, 'http://example.com/test.csv', 'test.csv');

      expect(result.success).toBe(true);
      expect(result.fileLogId).toBe(42);
      expect(result.stats.validRows).toBe(1);
      expect(result.validRecords).toHaveLength(1);
    });

    it('reports validation errors', async () => {
      jest.spyOn(processor, 'parseAndValidateCSV').mockResolvedValue({
        rows: [],
        errors: [{ rowNumber: 1, field: 'phone', error: 'Invalid phone', severity: 'error' }],
        stats: { totalRows: 1, validRows: 0, invalidRows: 1, duplicateRows: 0, updatedRows: 0 },
        allRows: [makeValidRow()]
      });

      const result = await processor.processFileFromURL(1, 'http://example.com/test.csv', 'test.csv');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE file_logs'),
        expect.arrayContaining(['validation_error'])
      );
    });

    it('handles download failure', async () => {
      axios.mockRejectedValue(new Error('Connection timeout'));
      jest.spyOn(processor, 'createFileLog').mockResolvedValue(1);
      jest.spyOn(processor, 'updateFileLog').mockResolvedValue();

      await expect(
        processor.processFileFromURL(1, 'http://example.com/test.csv', 'test.csv')
      ).rejects.toThrow('Connection timeout');
    });

    it('handles database error during file log creation', async () => {
      db.query.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        processor.processFileFromURL(1, 'http://example.com/test.csv', 'test.csv')
      ).rejects.toThrow('DB connection lost');
    });

    it('updates file log with error status on failure', async () => {
      axios.mockRejectedValue(new Error('Network error'));
      const updateSpy = jest.spyOn(processor, 'updateFileLog').mockResolvedValue();
      jest.spyOn(processor, 'createFileLog').mockResolvedValue(1);

      await expect(
        processor.processFileFromURL(1, 'http://example.com/test.csv', 'test.csv')
      ).rejects.toThrow();

      expect(updateSpy).toHaveBeenCalledWith(1, {
        status: 'error',
        error_details: 'Network error'
      });
    });

    it('cleans up temp file after processing', async () => {
      jest.spyOn(processor, 'parseAndValidateCSV').mockResolvedValue({
        rows: [makeValidRow()], errors: [],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, updatedRows: 0 },
        allRows: [makeValidRow()]
      });

      await processor.processFileFromURL(1, 'http://example.com/test.csv', 'test.csv');

      expect(fs.promises.unlink).toHaveBeenCalledWith(path.join('/tmp', 'test.csv'));
    });
  });

  describe('processUploadedFile', () => {
    beforeEach(() => {
      db.query.mockResolvedValue({ rows: [{ id: 7 }] });
    });

    it('processes uploaded file successfully', async () => {
      jest.spyOn(processor, 'parseAndValidateCSV').mockResolvedValue({
        rows: [makeValidRow()], errors: [],
        stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0, updatedRows: 0 },
        allRows: [makeValidRow()]
      });

      const result = await processor.processUploadedFile(1, '/tmp/upload.csv', 'upload.csv');

      expect(result.success).toBe(true);
      expect(result.fileLogId).toBe(7);
      expect(result.stats.validRows).toBe(1);
    });

    it('handles validation errors in uploaded file', async () => {
      jest.spyOn(processor, 'parseAndValidateCSV').mockResolvedValue({
        rows: [], errors: [{ rowNumber: 1, field: 'pan', error: 'Invalid PAN', severity: 'error' }],
        stats: { totalRows: 1, validRows: 0, invalidRows: 1, duplicateRows: 0, updatedRows: 0 },
        allRows: [makeValidRow()]
      });

      const result = await processor.processUploadedFile(1, '/tmp/upload.csv', 'upload.csv');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('updates file log with error status on parse failure', async () => {
      const parseError = new Error('Parse failed');
      jest.spyOn(processor, 'parseAndValidateCSV').mockRejectedValue(parseError);
      const updateSpy = jest.spyOn(processor, 'updateFileLog').mockResolvedValue();
      jest.spyOn(processor, 'createFileLog').mockResolvedValue(7);

      await expect(
        processor.processUploadedFile(1, '/tmp/upload.csv', 'upload.csv')
      ).rejects.toThrow('Parse failed');

      expect(updateSpy).toHaveBeenCalledWith(7, {
        status: 'error',
        error_details: 'Parse failed'
      });
    });
  });

  describe('logRowHistory', () => {
    it('logs row attempt to history service', async () => {
      validateRowForHistory.mockReturnValue({ results: [{ field: 'pan', isValid: true }] });

      await processor.logRowHistory(
        1, makeValidRow(), 42, 'test.csv', 'upload', 100, 'jdoe', '127.0.0.1', 'SUCCESS'
      );

      expect(recordHistoryService.logAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          bankId: 1,
          pan: '4000000000000002',
          fileLogId: 42,
          fileName: 'test.csv',
          sourceType: 'upload',
          userId: 100,
          username: 'jdoe',
          status: 'SUCCESS',
          ipAddress: '127.0.0.1',
        })
      );
    });

    it('handles history service error gracefully', async () => {
      validateRowForHistory.mockReturnValue({ results: [] });
      recordHistoryService.logAttempt.mockRejectedValue(new Error('History error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await processor.logRowHistory(1, makeValidRow(), 42, 'test.csv', 'upload', null, null, null, 'SUCCESS');

      expect(consoleSpy).toHaveBeenCalledWith('Error logging row history:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('processRowsWithHistory', () => {
    it('logs history for all rows', async () => {
      const logRowSpy = jest.spyOn(processor, 'logRowHistory').mockResolvedValue();
      const rows = [makeValidRow({ rowNumber: 1 }), makeValidRow({ pan: '5000000000000009', rowNumber: 2 })];

      await processor.processRowsWithHistory(
        1, rows, [rows[0]], [], 42, 'test.csv', 'upload', 100, 'jdoe', '127.0.0.1'
      );

      expect(logRowSpy).toHaveBeenCalledTimes(2);
    });

    it('marks row status as REJECTED for invalid rows', async () => {
      const logRowSpy = jest.spyOn(processor, 'logRowHistory').mockResolvedValue();
      const validRow = makeValidRow({ rowNumber: 1 });
      const invalidRow = makeValidRow({ rowNumber: 2, pan: '' });
      const errors = [{ rowNumber: 2, field: 'pan', error: 'Missing PAN', severity: 'error' }];

      await processor.processRowsWithHistory(
        1, [validRow, invalidRow], [validRow], errors, 42, 'test.csv', 'upload', 100, 'jdoe', '127.0.0.1'
      );

      expect(logRowSpy).toHaveBeenCalledWith(
        1, invalidRow, 42, 'test.csv', 'upload', 100, 'jdoe', '127.0.0.1', 'REJECTED'
      );
    });
  });

  describe('saveValidatedRecords', () => {
    it('inserts records with encrypted PAN and hash', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1, pan: 'enc_4000000000000002' }] });

      const rows = [makeValidRow()];
      const result = await processor.saveValidatedRecords(1, rows, 'test.csv');

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO processed_records'),
        [1, 'fr', 'John', 'Doe', 'enc_4000000000000002', 'hash_4000000000000002', '12/28', '21624080852', 'otp', 'update', 'test.csv']
      );
      expect(result).toHaveLength(1);
      expect(result[0].pan).toBe('4000000000000002');
    });

    it('handles database error during insert', async () => {
      db.query.mockRejectedValue(new Error('Insert failed'));
      const rows = [makeValidRow()];

      await expect(
        processor.saveValidatedRecords(1, rows, 'test.csv')
      ).rejects.toThrow('Insert failed');
    });

    it('saves multiple records', async () => {
      db.query.mockResolvedValue({ rows: [
        { id: 1, pan: 'enc_4000000000000002' },
        { id: 2, pan: 'enc_5000000000000009' }
      ] });

      const rows = [
        makeValidRow({ pan: '4000000000000002' }),
        makeValidRow({ pan: '5000000000000009' })
      ];
      const result = await processor.saveValidatedRecords(1, rows, 'test.csv');

      expect(result).toHaveLength(2);
      expect(db.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('createFileLog', () => {
    it('creates file log entry and returns id', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 99 }] });
      const result = await processor.createFileLog(1, 'test.csv', '/path/file.csv');
      expect(result).toBe(99);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO file_logs'),
        [1, 'test.csv', '/path/file.csv']
      );
    });
  });

  describe('updateFileLog', () => {
    it('updates file log with single field', async () => {
      await processor.updateFileLog(42, { status: 'success' });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE file_logs'),
        ['success', 42]
      );
    });

    it('updates file log with multiple fields', async () => {
      await processor.updateFileLog(42, {
        total_rows: 10,
        valid_rows: 8,
        invalid_rows: 2,
        status: 'validation_error'
      });
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE file_logs'),
        [10, 8, 2, 'validation_error', 42]
      );
    });
  });

  describe('saveValidationErrors', () => {
    it('saves multiple validation errors', async () => {
      const errors = [
        { rowNumber: 1, field: 'pan', value: '1234', error: 'Invalid length', severity: 'error' },
        { rowNumber: 2, field: 'phone', value: 'abc', error: 'Invalid format', severity: 'error' },
      ];

      await processor.saveValidationErrors(42, errors);

      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO validation_errors'),
        [42, 1, 'pan', '1234', 'Invalid length', 'error', 42, 2, 'phone', 'abc', 'Invalid format', 'error']
      );
    });

    it('handles error without rowNumber', async () => {
      const errors = [{ field: 'header', value: '', error: 'Missing field', severity: 'error' }];
      await processor.saveValidationErrors(42, errors);
      expect(db.query).toHaveBeenCalledWith(
        expect.any(String),
        [42, null, 'header', '', 'Missing field', 'error']
      );
    });
  });

  describe('checkForNewFiles', () => {
    it('returns files from remote source', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.listFiles.mockResolvedValue(['f1.csv', 'f2.csv']);

      const result = await processor.checkForNewFiles('sftp://server/incoming');

      expect(result).toEqual(['f1.csv', 'f2.csv']);
      expect(remoteFileService.listFiles).toHaveBeenCalledWith('sftp://server/incoming', '.csv');
    });

    it('returns CSV files from HTTP endpoint', async () => {
      remoteFileService.isRemote.mockReturnValue(false);
      axios.get.mockResolvedValue({
        status: 200,
        data: { files: ['file1.csv', 'file2.txt', 'file3.csv', 'notes.doc'] }
      });

      const result = await processor.checkForNewFiles('http://server/list');

      expect(result).toEqual(['file1.csv', 'file3.csv']);
    });

    it('returns empty array on HTTP error', async () => {
      remoteFileService.isRemote.mockReturnValue(false);
      axios.get.mockRejectedValue(new Error('Server unreachable'));

      const result = await processor.checkForNewFiles('http://server/list');

      expect(result).toEqual([]);
    });

    it('returns empty array when no files in response', async () => {
      remoteFileService.isRemote.mockReturnValue(false);
      axios.get.mockResolvedValue({ status: 200, data: {} });

      const result = await processor.checkForNewFiles('http://server/list');

      expect(result).toEqual([]);
    });

    it('returns empty array for non-200 status', async () => {
      remoteFileService.isRemote.mockReturnValue(false);
      axios.get.mockResolvedValue({ status: 404, data: null });

      const result = await processor.checkForNewFiles('http://server/list');

      expect(result).toEqual([]);
    });
  });

  describe('moveFileToDestination', () => {
    it('moves file between local directories', async () => {
      const result = await processor.moveFileToDestination('file:///source', 'file:///dest', 'test.csv');

      expect(result.success).toBe(true);
      expect(result.destinationPath).toBe('file:///dest/test.csv');
      expect(fs.promises.cp).toHaveBeenCalledWith(
        path.join('/source', 'test.csv'),
        path.join('/dest', 'test.csv')
      );
      expect(fs.promises.unlink).toHaveBeenCalledWith(path.join('/source', 'test.csv'));
    });

    it('creates destination directory if needed', async () => {
      const result = await processor.moveFileToDestination('file:///source', 'file:///dest', 'test.csv');

      expect(result.success).toBe(true);
      expect(fs.promises.mkdir).toHaveBeenCalledWith('/dest', { recursive: true });
    });

    it('handles SFTP source and SFTP destination', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.moveFile.mockResolvedValue();

      const result = await processor.moveFileToDestination('sftp://source', 'sftp://dest', 'test.csv');

      expect(result.success).toBe(true);
      expect(remoteFileService.moveFile).toHaveBeenCalledWith(
        'sftp://source/test.csv', 'sftp://dest/test.csv'
      );
    });

    it('handles local source with SFTP destination', async () => {
      remoteFileService.isRemote
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      remoteFileService.copyFromLocal.mockResolvedValue();

      const result = await processor.moveFileToDestination('file:///source', 'sftp://dest', 'test.csv');

      expect(result.success).toBe(true);
      expect(remoteFileService.copyFromLocal).toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(path.join('/source', 'test.csv'));
    });

    it('handles SFTP source with local destination', async () => {
      remoteFileService.isRemote
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      remoteFileService.copyToLocal.mockResolvedValue();
      remoteFileService.deleteFile.mockResolvedValue();

      const result = await processor.moveFileToDestination('sftp://source', 'file:///dest', 'test.csv');

      expect(result.success).toBe(true);
      expect(remoteFileService.copyToLocal).toHaveBeenCalled();
      expect(remoteFileService.deleteFile).toHaveBeenCalled();
    });

    it('returns failure result on error', async () => {
      fs.promises.cp.mockRejectedValue(new Error('Permission denied'));

      const result = await processor.moveFileToDestination('file:///source', 'file:///dest', 'test.csv');

      expect(result.success).toBe(false);
    });
  });

  describe('archiveOldFile', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-22T10:30:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('archives file with timestamp prefix', async () => {
      const result = await processor.archiveOldFile('file:///source', 'file:///archive', 'test.csv');

      expect(result.success).toBe(true);
      expect(result.archivePath).toContain('OLD_');
      expect(result.archivePath).toContain('test.csv');
      expect(fs.promises.cp).toHaveBeenCalled();
    });

    it('creates archive directory if needed', async () => {
      const result = await processor.archiveOldFile('file:///source', 'file:///archive', 'test.csv');

      expect(result.success).toBe(true);
      expect(fs.promises.mkdir).toHaveBeenCalledWith('/archive', { recursive: true });
    });

    it('handles SFTP source and archive', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      const mockSftp = {
        mkdir: jest.fn().mockResolvedValue(),
        exists: jest.fn().mockResolvedValue(true),
        fastGet: jest.fn().mockResolvedValue(),
        fastPut: jest.fn().mockResolvedValue(),
        end: jest.fn().mockResolvedValue(),
      };
      remoteFileService.connect = jest.fn().mockResolvedValue(mockSftp);
      remoteFileService.parseUrl.mockImplementation(url => {
        const cleaned = url.replace('sftp://', '');
        const parts = cleaned.split('/');
        return { remotePath: '/' + parts.slice(1).join('/') };
      });

      const result = await processor.archiveOldFile('sftp://source', 'sftp://archive', 'test.csv');

      expect(result.success).toBe(true);
      expect(mockSftp.exists).toHaveBeenCalled();
      expect(mockSftp.fastGet).toHaveBeenCalled();
      expect(mockSftp.fastPut).toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('/tmp/OLD_'));
      expect(mockSftp.end).toHaveBeenCalled();
    });

    it('handles SFTP source with local archive', async () => {
      remoteFileService.isRemote
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      remoteFileService.copyToLocal.mockResolvedValue();

      const result = await processor.archiveOldFile('sftp://source', 'file:///archive', 'test.csv');

      expect(result.success).toBe(true);
      expect(remoteFileService.copyToLocal).toHaveBeenCalled();
    });

    it('does not throw on non-existent source file', async () => {
      const err = new Error('ENOENT');
      err.code = 'ENOENT';
      fs.promises.access.mockRejectedValue(err);

      const result = await processor.archiveOldFile('file:///source', 'file:///archive', 'test.csv');

      expect(result.success).toBe(true);
      expect(fs.promises.cp).not.toHaveBeenCalled();
    });

    it('handles local source with SFTP archive', async () => {
      remoteFileService.isRemote
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      remoteFileService.copyFromLocal.mockResolvedValue();
      fs.existsSync.mockReturnValue(true);

      const result = await processor.archiveOldFile('file:///source', 'sftp://archive', 'test.csv');

      expect(result.success).toBe(true);
      expect(remoteFileService.copyFromLocal).toHaveBeenCalled();
    });
  });

  describe('generateCorrectedCSV', () => {
    it('generates CSV content with headers and rows', async () => {
      const rows = [
        { language: 'fr', firstName: 'John', lastName: 'Doe', pan: '4000000000000002', expiry: '12/28', phone: '21624080852', behaviour: 'otp', action: 'update' },
        { language: 'en', firstName: 'Jane', lastName: 'Smith', pan: '5000000000000009', expiry: '06/30', phone: '21624080853', behaviour: 'sms', action: 'create' },
      ];

      const result = await processor.generateCorrectedCSV(rows, '/tmp/corrected.csv');

      expect(result).toBe('/tmp/corrected.csv');
      expect(fs.promises.writeFile).toHaveBeenCalled();
      const written = fs.promises.writeFile.mock.calls[0][1];
      expect(written).toContain('language;firstName;lastName;pan;expiry;phone;behaviour;action');
      expect(written).toContain('John');
      expect(written).toContain('Jane');
    });

    it('handles empty rows array', async () => {
      const result = await processor.generateCorrectedCSV([], '/tmp/empty.csv');

      expect(result).toBe('/tmp/empty.csv');
      expect(fs.promises.writeFile).toHaveBeenCalled();
      const written = fs.promises.writeFile.mock.calls[0][1];
      expect(written).toContain('language;firstName;lastName;pan;expiry;phone;behaviour;action');
    });

    it('fills missing values with empty string', async () => {
      const rows = [{ language: 'fr' }];

      await processor.generateCorrectedCSV(rows, '/tmp/partial.csv');

      const written = fs.promises.writeFile.mock.calls[0][1];
      expect(written).toContain('fr;;;;;;;');
    });
  });
});
