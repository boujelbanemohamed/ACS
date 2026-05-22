jest.mock('../../config/database');
jest.mock('../../services/encryptionService');

const db = require('../../config/database');
const { encrypt, decrypt, hashPan } = require('../../services/encryptionService');
const recordHistoryService = require('../../services/recordHistoryService');

function createMockClient() {
  const client = { query: jest.fn(), release: jest.fn() };
  return client;
}

describe('RecordHistoryService', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockClient();
    db.pool.connect.mockResolvedValue(mockClient);
    encrypt.mockImplementation(v => v ? `enc_${v}` : v);
    decrypt.mockImplementation(v => v && v.startsWith('enc_') ? v.replace('enc_', '') : v);
    hashPan.mockImplementation(v => v ? `hash_${v}` : v);
  });

  describe('logAttempt', () => {
    const baseParams = {
      bankId: 1,
      pan: '4741000000000006',
      fileLogId: 10,
      fileName: 'test.csv',
      sourceType: 'upload',
      status: 'SUCCESS',
      validationResults: [
        { field: 'pan', value: '4741000000000006', isValid: true, severity: 'error' },
        { field: 'phone', value: '98765432', isValid: false, severity: 'error', errorType: 'INVALID_FORMAT', errorMessage: 'Bad phone' },
        { field: 'name', value: '', isValid: false, severity: 'warning', errorType: 'MISSING', errorMessage: 'Missing name' }
      ]
    };

    function setupQueryQueue(responses) {
      let idx = 0;
      mockClient.query.mockImplementation(() => {
        const r = responses[idx];
        idx++;
        if (r === undefined) return Promise.resolve();
        if (r && typeof r === 'object' && r.rows) return Promise.resolve(r);
        return Promise.resolve(r);
      });
    }

    it('Full flow: inserts record_history, inserts details, commits, returns { historyId, attemptNumber, totalErrors, totalWarnings }', async () => {
      setupQueryQueue([
        undefined, // BEGIN
        { rows: [{ next_attempt: 1 }] }, // MAX attempt
        { rows: [{ id: 42 }] }, // INSERT history RETURNING id
        undefined, // detail 1
        undefined, // detail 2
        undefined, // detail 3
        undefined // COMMIT
      ]);

      const result = await recordHistoryService.logAttempt(baseParams);

      expect(result).toEqual({ historyId: 42, attemptNumber: 1, totalErrors: 1, totalWarnings: 1 });
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('Uses provided attemptNumber', async () => {
      setupQueryQueue([
        undefined, // BEGIN
        { rows: [{ id: 43 }] }, // INSERT history RETURNING id
        { rows: [] }, // previous values (attempt=3 > 1)
        undefined, // detail 1
        undefined, // detail 2
        undefined, // detail 3
        undefined // COMMIT
      ]);

      const result = await recordHistoryService.logAttempt({ ...baseParams, attemptNumber: 3 });

      expect(result.attemptNumber).toBe(3);
    });

    it('Auto-calculates attemptNumber by MAX(attempt_number)+1', async () => {
      setupQueryQueue([
        undefined, // BEGIN
        { rows: [{ next_attempt: 5 }] }, // MAX attempt
        { rows: [{ id: 44 }] }, // INSERT history RETURNING id
        { rows: [] }, // previous values (attempt 5 > 1)
        undefined, // detail 1
        undefined, // detail 2
        undefined, // detail 3
        undefined // COMMIT
      ]);

      const result = await recordHistoryService.logAttempt(baseParams);

      expect(result.attemptNumber).toBe(5);
      expect(mockClient.query).toHaveBeenNthCalledWith(2,
        expect.stringContaining('SELECT COALESCE(MAX(attempt_number), 0) + 1'),
        [1, 'hash_4741000000000006']
      );
    });

    it('Throws error when bankId or pan missing', async () => {
      await expect(recordHistoryService.logAttempt({ pan: '123' })).rejects.toThrow('bankId');
      await expect(recordHistoryService.logAttempt({ bankId: 1 })).rejects.toThrow('pan');
    });

    it('sourceType cron sets displayUsername SYSTÈME', async () => {
      setupQueryQueue([
        undefined,
        { rows: [{ next_attempt: 1 }] },
        { rows: [{ id: 45 }] },
        undefined,
        undefined,
        undefined,
        undefined
      ]);

      await recordHistoryService.logAttempt({ ...baseParams, sourceType: 'cron', username: 'someuser' });

      const calls = mockClient.query.mock.calls;
      const insertCall = calls.find(c => c[0].startsWith('INSERT INTO record_history'));
      expect(insertCall[1][8]).toBe('SYSTÈME');
    });

    it('sourceType api without username sets displayUsername API', async () => {
      setupQueryQueue([
        undefined,
        { rows: [{ next_attempt: 1 }] },
        { rows: [{ id: 46 }] },
        undefined,
        undefined,
        undefined,
        undefined
      ]);

      await recordHistoryService.logAttempt({ ...baseParams, sourceType: 'api', username: null });

      const calls = mockClient.query.mock.calls;
      const insertCall = calls.find(c => c[0].startsWith('INSERT INTO record_history'));
      expect(insertCall[1][8]).toBe('API');
    });

    it('Calculates totalErrors and totalWarnings from validationResults', async () => {
      setupQueryQueue([
        undefined,
        { rows: [{ next_attempt: 1 }] },
        { rows: [{ id: 47 }] },
        undefined,
        undefined,
        undefined,
        undefined
      ]);

      await recordHistoryService.logAttempt({
        ...baseParams,
        validationResults: [
          { field: 'a', isValid: false, severity: 'error' },
          { field: 'b', isValid: false, severity: 'error' },
          { field: 'c', isValid: false, severity: 'warning' }
        ]
      });

      const calls = mockClient.query.mock.calls;
      const insertCall = calls.find(c => c[0].startsWith('INSERT INTO record_history'));
      expect(insertCall[1][13]).toBe(2);
      expect(insertCall[1][14]).toBe(1);
    });

    it('Attempts > 1 fetches previous values from record_history_details', async () => {
      setupQueryQueue([
        undefined,
        { rows: [{ next_attempt: 2 }] },
        { rows: [{ id: 48 }] },
        { rows: [{ field_name: 'pan', field_value: 'old_pan' }] },
        undefined,
        undefined,
        undefined,
        undefined
      ]);

      await recordHistoryService.logAttempt(baseParams);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM record_history_details'),
        [1, 'hash_4741000000000006', 1]
      );
    });

    it('Marks isCorrected=true when value differs from previous and is valid', async () => {
      setupQueryQueue([
        undefined,
        { rows: [{ next_attempt: 2 }] },
        { rows: [{ id: 49 }] },
        { rows: [{ field_name: 'pan', field_value: 'old_pan' }] },
        undefined,
        undefined,
        undefined,
        undefined
      ]);

      await recordHistoryService.logAttempt(baseParams);

      const calls = mockClient.query.mock.calls;
      const panDetailCall = calls.find(c =>
        c[0].startsWith('INSERT INTO record_history_details') && c[1][1] === 'pan'
      );
      expect(panDetailCall[1][9]).toBe(true);
    });

    it('ROLLBACK on error, re-throws', async () => {
      mockClient.query.mockImplementation(() => { throw new Error('DB failure'); });

      await expect(recordHistoryService.logAttempt(baseParams)).rejects.toThrow('DB failure');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('RELEASES client in finally after success', async () => {
      setupQueryQueue([
        undefined,
        { rows: [{ next_attempt: 1 }] },
        { rows: [{ id: 50 }] },
        undefined,
        undefined,
        undefined,
        undefined
      ]);

      await recordHistoryService.logAttempt(baseParams);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('RELEASES client in finally after error', async () => {
      mockClient.query.mockRejectedValue(new Error('fail'));

      await expect(recordHistoryService.logAttempt(baseParams)).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getHistoryByPan', () => {
    const mockAttempt = {
      id: 1, bank_id: 1, pan: 'enc_4741000000000006', pan_hash: 'hash_4741000000000006',
      attempt_number: 1, status: 'SUCCESS', bank_code: 'BNK', bank_name: 'TestBank',
      username: 'admin', data_received: '{"pan":"4741000000000006"}',
      processed_at: '2025-01-01T10:00:00Z', xml_id: 100
    };

    it('Queries DB with pan_hash, returns summary + attempts with decrypted PAN', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [mockAttempt] })
        .mockResolvedValueOnce({ rows: [{ field_name: 'pan', field_value: '4741' }] });

      const result = await recordHistoryService.getHistoryByPan(1, '4741000000000006');

      expect(result.summary.pan).toBe('4741000000000006');
      expect(result.summary.totalAttempts).toBe(1);
      expect(result.summary.bankCode).toBe('BNK');
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].pan).toBe('4741000000000006');
    });

    it('Returns summary with correctionDelayMinutes for multi-attempt SUCCESS', async () => {
      const attempt2 = {
        ...mockAttempt, id: 2, attempt_number: 2, processed_at: '2025-01-01T10:30:00Z', data_received: '{}'
      };
      db.query
        .mockResolvedValueOnce({ rows: [mockAttempt, attempt2] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await recordHistoryService.getHistoryByPan(1, '4741000000000006');

      expect(result.summary.correctionDelayMinutes).toBe(30);
    });

    it('Parses data_received JSON string', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [mockAttempt] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await recordHistoryService.getHistoryByPan(1, '4741000000000006');

      expect(result.attempts[0].data_received).toEqual({ pan: '4741000000000006' });
    });

    it('No attempts case returns empty result', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await recordHistoryService.getHistoryByPan(1, '4741000000000006');

      expect(result.summary.totalAttempts).toBe(0);
      expect(result.summary.currentStatus).toBe('UNKNOWN');
      expect(result.attempts).toHaveLength(0);
    });
  });

  describe('searchHistory', () => {
    const mockRow = {
      id: 1, pan: 'enc_4741000000000006', bank_id: 1, bank_code: 'BNK',
      status: 'SUCCESS', source_type: 'upload', total_errors: 0
    };

    it('Builds query with all optional filters (bankId, status, sourceType, userId, dateFrom, dateTo, hasErrors)', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await recordHistoryService.searchHistory({
        bankId: 1, status: 'SUCCESS', sourceType: 'upload', userId: 5,
        dateFrom: '2025-01-01', dateTo: '2025-01-31', hasErrors: false,
        limit: 10, offset: 5
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });

    it('Applies LIMIT and OFFSET', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await recordHistoryService.searchHistory({ limit: 25, offset: 50 });

      expect(result.limit).toBe(25);
      expect(result.offset).toBe(50);
    });

    it('filters by hasErrors=true', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await recordHistoryService.searchHistory({ limit: 10, offset: 0, hasErrors: true });

      expect(db.query.mock.calls[0][0]).toContain('total_errors > 0');
    });
  });

  describe('getStats', () => {
    it('Returns aggregated stats with all counts', async () => {
      const statsRow = {
        total_attempts: '100', unique_pans: '50', success_count: '60',
        rejected_count: '20', partial_count: '10', cron_count: '40',
        upload_count: '30', manual_count: '10', correction_count: '5',
        api_count: '15', total_errors: '200', total_warnings: '50',
        unique_users: '8'
      };
      db.query
        .mockResolvedValueOnce({ rows: [statsRow] })
        .mockResolvedValueOnce({ rows: [{ pans_with_corrections: '10' }] });

      const result = await recordHistoryService.getStats();

      expect(result.total_attempts).toBe('100');
      expect(result.unique_pans).toBe('50');
      expect(result.pans_with_corrections).toBe(10);
    });

    it('Includes pans_with_corrections subquery', async () => {
      const empty = { total_attempts: '0', unique_pans: '0', success_count: '0', rejected_count: '0', partial_count: '0', cron_count: '0', upload_count: '0', manual_count: '0', correction_count: '0', api_count: '0', total_errors: '0', total_warnings: '0', unique_users: '0' };
      db.query
        .mockResolvedValueOnce({ rows: [empty] })
        .mockResolvedValueOnce({ rows: [{ pans_with_corrections: '3' }] });

      expect((await recordHistoryService.getStats()).pans_with_corrections).toBe(3);
    });

    it('Filters by bankId', async () => {
      const row = { total_attempts: '10', unique_pans: '5', success_count: '5', rejected_count: '2', partial_count: '1', cron_count: '3', upload_count: '2', manual_count: '1', correction_count: '2', api_count: '2', total_errors: '10', total_warnings: '5', unique_users: '2' };
      db.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ pans_with_corrections: '2' }] });

      await recordHistoryService.getStats(1);

      expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('WHERE rh.bank_id = $1'), [1]);
    });
  });

  describe('getTopErrors', () => {
    it('Returns grouped field errors ordered by occurrence_count DESC', async () => {
      db.query.mockResolvedValue({ rows: [
        { field_name: 'pan', error_type: 'INVALID_FORMAT', error_message: 'Bad length', occurrence_count: '15' },
        { field_name: 'phone', error_type: 'MISSING', error_message: 'Required', occurrence_count: '8' }
      ]});

      const result = await recordHistoryService.getTopErrors();

      expect(result).toHaveLength(2);
      expect(result[0].occurrence_count).toBe('15');
    });

    it('Filters by bankId when provided', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await recordHistoryService.getTopErrors(2, 5);

      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE rh.bank_id = $2'), [5, 2]);
    });
  });
});
