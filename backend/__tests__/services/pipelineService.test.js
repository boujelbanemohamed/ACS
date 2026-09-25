const mockClient = { query: jest.fn(), release: jest.fn() };

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() }
}));
const mockSaveValidatedRecords = jest.fn();
const mockUpdateFileLog = jest.fn();
jest.mock('../../services/csvProcessor', () => jest.fn(() => ({
  saveValidatedRecords: mockSaveValidatedRecords,
  updateFileLog: mockUpdateFileLog
})));
jest.mock('../../services/xmlGenerator', () => ({
  processAndGenerateXML: jest.fn(),
  deleteXML: jest.fn()
}));

const db = require('../../config/database');
const xmlGenerator = require('../../services/xmlGenerator');
const { commitValidRecords, withTransaction } = require('../../services/pipelineService');

const bank = { id: 3, code: 'BT' };

describe('pipelineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] });
    db.pool.connect.mockResolvedValue(mockClient);
    mockSaveValidatedRecords.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockUpdateFileLog.mockResolvedValue();
    xmlGenerator.processAndGenerateXML.mockResolvedValue({
      success: true, fileName: 'ACS.xml', filePath: '/xml/ACS.xml', xmlEntriesCount: 4, recordsCount: 2
    });
  });

  it('saves records, generates the XML and marks the file as successful in ONE transaction', async () => {
    const rows = [{ pan: '1' }, { pan: '2' }];

    const { xmlResult } = await commitValidRecords({ bank, fileLogId: 7, fileName: 'f.csv', rows });

    const statements = mockClient.query.mock.calls.map(c => c[0]);
    expect(statements[0]).toBe('BEGIN');
    expect(statements).toContain('COMMIT');
    expect(mockSaveValidatedRecords).toHaveBeenCalledWith(3, rows, 'f.csv', mockClient);
    expect(xmlGenerator.processAndGenerateXML).toHaveBeenCalledWith(rows, bank, { client: mockClient });
    expect(statements.some(s => s.includes('INSERT INTO xml_logs'))).toBe(true);
    expect(mockUpdateFileLog).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'success', output_path: '/xml/ACS.xml' }), mockClient);
    expect(rows.map(r => r.id)).toEqual([10, 11]);
    expect(xmlResult.fileName).toBe('ACS.xml');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back and deletes the XML file when a later step fails', async () => {
    mockClient.query.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO xml_logs')) throw new Error('insert failed');
      return { rows: [] };
    });

    await expect(commitValidRecords({ bank, fileLogId: 7, fileName: 'f.csv', rows: [{ pan: '1' }] }))
      .rejects.toThrow('insert failed');

    const statements = mockClient.query.mock.calls.map(c => c[0]);
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(xmlGenerator.deleteXML).toHaveBeenCalledWith('/xml/ACS.xml');
    expect(mockUpdateFileLog).toHaveBeenLastCalledWith(7, { status: 'error', error_details: 'insert failed' });
  });

  it('fails (and saves nothing) when no card can be written in the XML', async () => {
    xmlGenerator.processAndGenerateXML.mockResolvedValue({ success: false, message: 'Aucune carte exploitable pour le XML' });

    await expect(commitValidRecords({ bank, fileLogId: 7, fileName: 'f.csv', rows: [{ pan: '1' }] }))
      .rejects.toThrow('Aucune carte exploitable');
    expect(mockClient.query.mock.calls.map(c => c[0])).toContain('ROLLBACK');
  });

  it('generateXml=false only saves the records', async () => {
    const { xmlResult } = await commitValidRecords({ bank, fileLogId: 7, fileName: 'f.csv', rows: [{ pan: '1' }], generateXml: false });

    expect(xmlResult).toBeNull();
    expect(xmlGenerator.processAndGenerateXML).not.toHaveBeenCalled();
    expect(mockUpdateFileLog).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'success' }), mockClient);
  });

  it('withTransaction runs directly when no pool is available (unit tests)', async () => {
    const pool = db.pool;
    db.pool = undefined;
    await expect(withTransaction(async (client) => client === db)).resolves.toBe(true);
    db.pool = pool;
  });
});
