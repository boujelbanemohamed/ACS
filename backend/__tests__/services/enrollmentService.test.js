jest.mock('../../config/database');
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn()
  }
}));

const db = require('../../config/database');
const fs = require('fs');
const enrollmentService = require('../../services/enrollmentService');

describe('EnrollmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseEnrollmentXML', () => {
    it('parses XML with OK status returning success', () => {
      const xml = '<cardRegistryRecordProcessingResult id="1" status="OK"/>';
      const result = enrollmentService.parseEnrollmentXML(xml);
      expect(result).toEqual([{ xmlId: 1, status: 'success', errorCode: null, errorDescription: null }]);
    });

    it('parses XML with KO status returning errorCode', () => {
      const xml = '<cardRegistryRecordProcessingResult id="2" status="KO"/>';
      const result = enrollmentService.parseEnrollmentXML(xml);
      expect(result).toEqual([{ xmlId: 2, status: 'error', errorCode: 'KO', errorDescription: null }]);
    });

    it('includes description attribute when present', () => {
      const xml = '<cardRegistryRecordProcessingResult id="3" status="KO" description="Invalid card number"/>';
      const result = enrollmentService.parseEnrollmentXML(xml);
      expect(result[0].errorDescription).toBe('Invalid card number');
    });

    it('parses multiple records', () => {
      const xml = `
        <cardRegistryRecordProcessingResult id="1" status="OK"/>
        <cardRegistryRecordProcessingResult id="2" status="KO" description="Expired"/>
        <cardRegistryRecordProcessingResult id="3" status="OK"/>
      `;
      const result = enrollmentService.parseEnrollmentXML(xml);
      expect(result).toHaveLength(3);
      expect(result[0].status).toBe('success');
      expect(result[1].status).toBe('error');
      expect(result[1].errorCode).toBe('KO');
      expect(result[1].errorDescription).toBe('Expired');
      expect(result[2].status).toBe('success');
    });

    it('returns empty array for XML with no matches', () => {
      const xml = '<root><item id="1"/></root>';
      const result = enrollmentService.parseEnrollmentXML(xml);
      expect(result).toEqual([]);
    });
  });

  describe('processEnrollmentReportFromContent', () => {
    it('processes XML with 2 OK records, updates DB, creates log, returns success', async () => {
      const xml = `
        <cardRegistryRecordProcessingResult id="1" status="OK"/>
        <cardRegistryRecordProcessingResult id="2" status="OK"/>
      `;
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 10 }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 20 }] })
        .mockResolvedValueOnce({ rows: [{ id: 100 }] });

      const result = await enrollmentService.processEnrollmentReportFromContent(xml, 1, 'report.xml');

      expect(result.success).toBe(true);
      expect(result.totalRecords).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.updatedRecords).toBe(2);
      expect(result.logId).toBe(100);
      expect(db.query).toHaveBeenCalledTimes(3);
    });

    it('returns no records message when XML has no matches', async () => {
      const xml = '<root/>';
      const result = await enrollmentService.processEnrollmentReportFromContent(xml, 1, 'empty.xml');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Aucun enregistrement trouve dans le fichier XML');
    });

    it('adds xmlId to notFoundIds when DB update rowCount is 0', async () => {
      const xml = '<cardRegistryRecordProcessingResult id="99" status="OK"/>';
      db.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await enrollmentService.processEnrollmentReportFromContent(xml, 1, 'notfound.xml');

      expect(result.notFoundIds).toEqual([99]);
      expect(result.notFoundCount).toBe(1);
    });

    it('counts mixed success and error results correctly', async () => {
      const xml = `
        <cardRegistryRecordProcessingResult id="1" status="OK"/>
        <cardRegistryRecordProcessingResult id="2" status="KO"/>
        <cardRegistryRecordProcessingResult id="3" status="OK"/>
      `;
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 2 }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 3 }] })
        .mockResolvedValueOnce({ rows: [{ id: 5 }] });

      const result = await enrollmentService.processEnrollmentReportFromContent(xml, 1, 'mixed.xml');

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.totalRecords).toBe(3);
      expect(result.updatedRecords).toBe(3);
    });

    it('handles DB error and returns error message', async () => {
      const xml = '<cardRegistryRecordProcessingResult id="1" status="OK"/>';
      db.query.mockRejectedValue(new Error('Connection timeout'));

      const result = await enrollmentService.processEnrollmentReportFromContent(xml, 1, 'error.xml');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Erreur lors du traitement: Connection timeout');
    });
  });

  describe('processEnrollmentReport', () => {
    it('reads file via fs.readFile and calls processEnrollmentReportFromContent', async () => {
      const xmlContent = '<cardRegistryRecordProcessingResult id="1" status="OK"/>';
      fs.promises.readFile.mockResolvedValue(xmlContent);
      db.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 5 }] });

      const result = await enrollmentService.processEnrollmentReport('/path/to/file.xml', 1, 'file.xml');

      expect(fs.promises.readFile).toHaveBeenCalledWith('/path/to/file.xml', 'utf8');
      expect(result.success).toBe(true);
    });

    it('returns error when file read fails', async () => {
      fs.promises.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await enrollmentService.processEnrollmentReport('/nonexistent.xml', 1, 'missing.xml');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Erreur lecture fichier: ENOENT: no such file');
    });
  });

  describe('getEnrollmentStats', () => {
    it('returns stats from query result', async () => {
      db.query.mockResolvedValue({ rows: [{ total_records: '50', enrolled_success: '30', enrolled_error: '10', pending: '10' }] });

      const result = await enrollmentService.getEnrollmentStats();

      expect(result.total_records).toBe('50');
      expect(result.enrolled_success).toBe('30');
      expect(result.enrolled_error).toBe('10');
      expect(result.pending).toBe('10');
    });

    it('filters by bankId when provided', async () => {
      db.query.mockResolvedValue({ rows: [{ total_records: '10', enrolled_success: '8', enrolled_error: '1', pending: '1' }] });

      await enrollmentService.getEnrollmentStats(3);

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE bank_id = $1'), [3]);
    });

    it('returns null on DB error', async () => {
      db.query.mockRejectedValue(new Error('DB down'));

      const result = await enrollmentService.getEnrollmentStats();

      expect(result).toBeNull();
    });
  });

  describe('getEnrollmentLogs', () => {
    it('returns logs with bank info JOIN', async () => {
      const mockLogs = [{ id: 1, bank_name: 'Test Bank', bank_code: 'TB', status: 'processed' }];
      db.query.mockResolvedValue({ rows: mockLogs });

      const result = await enrollmentService.getEnrollmentLogs();

      expect(result).toEqual(mockLogs);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN banks b'), [50, 0]);
    });

    it('filters by bankId', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await enrollmentService.getEnrollmentLogs(5);

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE el.bank_id = $1'), [5, 50, 0]);
    });

    it('applies LIMIT and OFFSET', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await enrollmentService.getEnrollmentLogs(null, 20, 10);

      expect(db.query).toHaveBeenCalledWith(expect.any(String), [20, 10]);
    });

    it('orders by processed_at DESC', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await enrollmentService.getEnrollmentLogs();

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY el.processed_at DESC'), expect.any(Array));
    });

    it('returns empty array on DB error', async () => {
      db.query.mockRejectedValue(new Error('Query failed'));

      const result = await enrollmentService.getEnrollmentLogs();

      expect(result).toEqual([]);
    });
  });
});
