const mockQuery = jest.fn();
const mockEncrypt = jest.fn();
const mockHashPan = jest.fn();
jest.mock('../../config/database', () => ({ query: mockQuery }));
jest.mock('../../services/encryptionService', () => ({
  encrypt: mockEncrypt,
  hashPan: mockHashPan
}));
jest.mock('dotenv', () => ({ config: jest.fn() }));

beforeEach(() => {
  jest.resetModules();
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
  mockEncrypt.mockReset();
  mockEncrypt.mockReturnValue('encrypted:val');
  mockHashPan.mockReset();
  mockHashPan.mockReturnValue('hashed:val');
  process.exit = jest.fn();
  console.log = jest.fn();
  console.error = jest.fn();
});

describe('encryptExistingPans migration', () => {
  it('queries processed_records with correct SQL', () => {
    require('../../scripts/encryptExistingPans');
    return new Promise(process.nextTick).then(() => {
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, pan FROM processed_records'),
        expect.any(Array)
      );
    });
  });

  it('queries record_history with correct SQL', () => {
    require('../../scripts/encryptExistingPans');
    return new Promise(process.nextTick).then(() => {
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, pan FROM record_history'),
        expect.any(Array)
      );
    });
  });

  it('filters out already encrypted PANs', () => {
    require('../../scripts/encryptExistingPans');
    return new Promise(process.nextTick).then(() => {
      const selectCall = mockQuery.mock.calls.find(c => c[0].includes('SELECT'));
      expect(selectCall[0]).toContain("pan NOT LIKE '%:%'");
    });
  });

  it('uses batch size of 100', () => {
    require('../../scripts/encryptExistingPans');
    return new Promise(process.nextTick).then(() => {
      const selectCall = mockQuery.mock.calls.find(c => c[0].includes('LIMIT'));
      expect(selectCall[1][0]).toBe(100);
    });
  });

  it('encrypts and updates each row when PANs exist', () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 42, pan: '1234567890123456' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockEncrypt.mockReturnValue('encrypted:abc');
    mockHashPan.mockReturnValue('hashed:abc');

    require('../../scripts/encryptExistingPans');
    return new Promise(process.nextTick).then(() => new Promise(process.nextTick)).then(() => {
      expect(mockEncrypt).toHaveBeenCalledWith('1234567890123456');
      expect(mockHashPan).toHaveBeenCalledWith('1234567890123456');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE processed_records'),
        ['encrypted:abc', 'hashed:abc', 42]
      );
    });
  });

  it('handles encryption errors gracefully', () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, pan: '1111111111111111' }, { id: 2, pan: '2222222222222222' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockEncrypt.mockReturnValueOnce('encrypted:1');
    mockEncrypt.mockImplementationOnce(() => { throw new Error('encrypt failed'); });
    mockHashPan.mockReturnValue('hash');

    require('../../scripts/encryptExistingPans');
    return new Promise(process.nextTick).then(() => new Promise(process.nextTick)).then(() => {
      expect(console.error).toHaveBeenCalledWith(
        'Erreur row 2: encrypt failed'
      );
    });
  });

  it('processes both tables', () => {
    require('../../scripts/encryptExistingPans');
    return new Promise(process.nextTick).then(() => {
      const processedCalls = mockQuery.mock.calls.filter(c => c[0].includes('processed_records'));
      const historyCalls = mockQuery.mock.calls.filter(c => c[0].includes('record_history'));
      expect(processedCalls.length).toBeGreaterThan(0);
      expect(historyCalls.length).toBeGreaterThan(0);
    });
  });
});
