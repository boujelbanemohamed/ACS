jest.mock('axios');
jest.mock('fs');
jest.mock('../../config/database');
jest.mock('../../services/csvProcessor', () => jest.fn().mockImplementation(() => ({
  processFileFromURL: jest.fn(),
  processRowsWithHistory: jest.fn(),
  saveValidatedRecords: jest.fn(),
  archiveOldFile: jest.fn(),
  moveFileToDestination: jest.fn()
})));
jest.mock('../../services/xmlGenerator');
jest.mock('../../utils/remoteFileService', () => ({
  isRemote: jest.fn(),
  listFiles: jest.fn(),
  writeFile: jest.fn()
}));

const axios = require('axios');
const fs = require('fs');
const db = require('../../config/database');
const CSVProcessor = require('../../services/csvProcessor');
const xmlGenerator = require('../../services/xmlGenerator');
const remoteFileService = require('../../utils/remoteFileService');
const FileScanner = require('../../services/fileScanner');

describe('FileScanner', () => {
  let scanner;

  beforeEach(() => {
    jest.clearAllMocks();
    remoteFileService.isRemote.mockReset();
    remoteFileService.listFiles.mockReset();
    remoteFileService.writeFile.mockReset();
    scanner = new FileScanner();
  });

  describe('scanBank', () => {
    const bank = { id: 1, name: 'TestBank', source_url: 'https://example.com/files', old_url: 'https://example.com/old', destination_url: 'https://example.com/dest' };

    it('Full happy path: lists 2 files, processes both, generates XML', async () => {
      scanner.listFiles = jest.fn().mockResolvedValue(['file1.csv', 'file2.csv']);
      scanner.isFileProcessed = jest.fn().mockResolvedValue(false);
      scanner.csvProcessor.processFileFromURL.mockResolvedValue({
        success: true, allRows: [{ pan: '123' }], validRecords: [{ id: null, pan: '4741000000000006' }],
        errors: [], fileLogId: 10
      });
      scanner.csvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 100 }]);
      xmlGenerator.processAndGenerateXML.mockResolvedValue({ fileName: 'test.xml', filePath: '/tmp/test.xml', xmlEntriesCount: 2 });
      db.query.mockResolvedValue({ rows: [] });

      const result = await scanner.scanBank(bank);

      expect(result.filesFound).toBe(2);
      expect(result.filesProcessed).toBe(2);
      expect(result.xmlGenerated).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(scanner.csvProcessor.archiveOldFile).toHaveBeenCalledTimes(2);
      expect(scanner.csvProcessor.moveFileToDestination).toHaveBeenCalledTimes(2);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO xml_logs'), expect.any(Array));
    });

    it('No files found: returns { filesFound: 0, filesProcessed: 0, xmlGenerated: false, errors: [] }', async () => {
      scanner.listFiles = jest.fn().mockResolvedValue([]);

      const result = await scanner.scanBank(bank);

      expect(result).toEqual({ filesFound: 0, filesProcessed: 0, xmlGenerated: false, errors: [] });
    });

    it('File already processed: isFileProcessed returns true, skips it', async () => {
      scanner.listFiles = jest.fn().mockResolvedValue(['file1.csv', 'file2.csv']);
      scanner.isFileProcessed = jest.fn().mockResolvedValue(true);

      const result = await scanner.scanBank(bank);

      expect(result.filesProcessed).toBe(0);
      expect(scanner.csvProcessor.processFileFromURL).not.toHaveBeenCalled();
    });

    it('Validation errors in processing: stats has errors, no XML generation', async () => {
      scanner.listFiles = jest.fn().mockResolvedValue(['file1.csv']);
      scanner.isFileProcessed = jest.fn().mockResolvedValue(false);
      scanner.csvProcessor.processFileFromURL.mockResolvedValue({
        success: false, errors: [{ field: 'pan', message: 'Invalid' }]
      });

      const result = await scanner.scanBank(bank);

      expect(result.filesProcessed).toBe(0);
      expect(result.xmlGenerated).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Validation errors detected');
    });

    it('XML generation throws: caught, added to errors array, scan continues', async () => {
      scanner.listFiles = jest.fn().mockResolvedValue(['file1.csv']);
      scanner.isFileProcessed = jest.fn().mockResolvedValue(false);
      scanner.csvProcessor.processFileFromURL.mockResolvedValue({
        success: true, allRows: [{ pan: '123' }], validRecords: [{ id: null, pan: '4741000000000006' }],
        errors: [], fileLogId: 10
      });
      scanner.csvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 100 }]);
      xmlGenerator.processAndGenerateXML.mockRejectedValue(new Error('XML error'));

      const result = await scanner.scanBank(bank);

      expect(result.xmlGenerated).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('XML generation failed');
      expect(scanner.csvProcessor.archiveOldFile).toHaveBeenCalled();
    });

    it('Processing throws: caught, error added to results', async () => {
      scanner.listFiles = jest.fn().mockResolvedValue(['file1.csv', 'file2.csv']);
      scanner.isFileProcessed = jest.fn().mockResolvedValue(false);
      scanner.csvProcessor.processFileFromURL
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({
          success: true, allRows: [], validRecords: [{ id: null, pan: '4741000000000006' }],
          errors: [], fileLogId: 11
        });
      xmlGenerator.processAndGenerateXML.mockResolvedValue({ fileName: 'test.xml', filePath: '/tmp/test.xml', xmlEntriesCount: 2 });
      scanner.csvProcessor.saveValidatedRecords.mockResolvedValue([{ id: 101 }]);
      db.query.mockResolvedValue({ rows: [] });

      const result = await scanner.scanBank(bank);

      expect(result.filesProcessed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Connection timeout');
    });
  });

  describe('listFiles', () => {
    it('HTTP URL delegates to listFilesHTTP', async () => {
      scanner.listFilesHTTP = jest.fn().mockResolvedValue(['file1.csv']);
      const result = await scanner.listFiles('https://example.com/files');
      expect(result).toEqual(['file1.csv']);
    });

    it('SFTP URL uses remoteFileService.listFiles', async () => {
      remoteFileService.isRemote.mockReturnValue(true);
      remoteFileService.listFiles.mockResolvedValue(['file1.csv', 'file2.csv']);
      const result = await scanner.listFiles('sftp://example.com/files');
      expect(result).toEqual(['file1.csv', 'file2.csv']);
      expect(remoteFileService.listFiles).toHaveBeenCalledWith('sftp://example.com/files', '.csv');
    });

    it('Local file:// URL delegates to listFilesLocal', async () => {
      scanner.listFilesLocal = jest.fn().mockResolvedValue(['data.csv']);
      const result = await scanner.listFiles('file:///data/files');
      expect(result).toEqual(['data.csv']);
    });

    it('Unsupported protocol returns []', async () => {
      const result = await scanner.listFiles('ftp://bad-host');
      expect(result).toEqual([]);
    });
  });

  describe('listFilesHTTP', () => {
    it('JSON content-type with array of files', async () => {
      axios.get.mockResolvedValue({
        headers: { 'content-type': 'application/json' },
        data: ['file1.csv', 'file2.csv', 'readme.txt']
      });
      const result = await scanner.listFilesHTTP('https://example.com/files');
      expect(result).toEqual(['file1.csv', 'file2.csv']);
    });

    it('JSON content-type with { files: [...] }', async () => {
      axios.get.mockResolvedValue({
        headers: { 'content-type': 'application/json' },
        data: { files: ['a.csv', 'b.csv', 'c.csv'] }
      });
      const result = await scanner.listFilesHTTP('https://example.com/files');
      expect(result).toEqual(['a.csv', 'b.csv', 'c.csv']);
    });

    it('HTML content-type parses href for .csv files', async () => {
      axios.get.mockResolvedValue({
        headers: { 'content-type': 'text/html' },
        data: '<html><a href="data.csv">data</a><a href="/path/file.csv">file</a><a href="notes.txt">notes</a></html>'
      });
      const result = await scanner.listFilesHTTP('https://example.com/files');
      expect(result).toEqual(['data.csv', 'file.csv']);
    });

    it('404 response returns empty array (does not throw)', async () => {
      const err = new Error('Not found');
      err.response = { status: 404 };
      axios.get.mockRejectedValue(err);
      const result = await scanner.listFilesHTTP('https://example.com/files');
      expect(result).toEqual([]);
    });

    it('Connection error throws', async () => {
      axios.get.mockRejectedValue(new Error('connect ECONNREFUSED'));
      await expect(scanner.listFilesHTTP('https://example.com/files')).rejects.toThrow();
    });
  });

  describe('listFilesLocal', () => {
    it('Reads directory, returns .csv files', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['file1.csv', 'file2.txt', 'data.csv']);
      const result = await scanner.listFilesLocal('/data/files');
      expect(result).toEqual(['file1.csv', 'data.csv']);
    });

    it('Directory does not exist returns []', async () => {
      fs.existsSync.mockReturnValue(false);
      const result = await scanner.listFilesLocal('/nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('isFileProcessed', () => {
    it('Returns true when status is success', async () => {
      db.query.mockResolvedValue({ rows: [{ status: 'success' }] });
      expect(await scanner.isFileProcessed(1, 'test.csv')).toBe(true);
    });

    it('Returns true when status is processing', async () => {
      db.query.mockResolvedValue({ rows: [{ status: 'processing' }] });
      expect(await scanner.isFileProcessed(1, 'test.csv')).toBe(true);
    });

    it('Returns false when no rows found', async () => {
      db.query.mockResolvedValue({ rows: [] });
      expect(await scanner.isFileProcessed(1, 'test.csv')).toBe(false);
    });

    it('Returns false when status is error', async () => {
      db.query.mockResolvedValue({ rows: [{ status: 'error' }] });
      expect(await scanner.isFileProcessed(1, 'test.csv')).toBe(false);
    });
  });
});
