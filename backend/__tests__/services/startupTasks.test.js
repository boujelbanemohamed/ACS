const fs = require('fs');
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.mock('../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../services/encryptionService', () => ({
  decrypt: jest.fn(v => (v && v.startsWith('enc:') ? v.slice(4) : null)),
  hashPan: jest.fn(p => `hmac:${p}`)
}));

const db = require('../../config/database');
const { runStartupTasks } = require('../../services/startupTasks');

describe('startupTasks', () => {
  let applied;
  let panVersion;
  let records;

  beforeEach(() => {
    jest.clearAllMocks();
    applied = ['001_audit_logs_columns'];
    panVersion = null;
    records = { processed_records: [{ id: 1, pan: 'enc:4741000000000006' }, { id: 2, pan: 'unreadable' }], record_history: [] };
    process.env.PAN_ENCRYPTION_KEY = 'key';
    db.pool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockImplementation(async (sql, params = []) => {
      if (sql.startsWith('SELECT version FROM schema_migrations')) return { rows: applied.map(version => ({ version })) };
      if (sql.includes("key = 'pan_hash_version'")) return { rows: panVersion ? [{ value: panVersion }] : [] };
      const select = sql.match(/SELECT id, pan FROM (\w+) WHERE id > \$1/);
      if (select) return { rows: records[select[1]].filter(r => r.id > params[0]) };
      return { rows: [] };
    });
  });

  it('applies pending migrations in order, each in a transaction, under a cluster lock', async () => {
    const files = fs.readdirSync(require('path').join(__dirname, '../../migrations')).filter(f => f.endsWith('.sql')).sort();

    await runStartupTasks();

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('SELECT pg_advisory_lock($1)');
    const recorded = mockClient.query.mock.calls.filter(c => c[0].startsWith('INSERT INTO schema_migrations')).map(c => c[1][0]);
    expect(recorded).toEqual(files.map(f => f.replace('.sql', '')).filter(v => !applied.includes(v)));
    expect(calls[calls.length - 1]).toBe('SELECT pg_advisory_unlock($1)');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('re-hashes the PANs with HMAC once and records the version', async () => {
    await runStartupTasks();

    const updates = mockClient.query.mock.calls.filter(c => c[0].startsWith('UPDATE processed_records SET pan_hash'));
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toEqual(['hmac:4741000000000006', 1]);
    expect(mockClient.query.mock.calls.some(c => c[0].includes("VALUES ('pan_hash_version'"))).toBe(true);
  });

  it('does nothing more when the PAN hashes are already migrated', async () => {
    panVersion = '2';
    await runStartupTasks();
    expect(mockClient.query.mock.calls.some(c => c[0].startsWith('UPDATE processed_records'))).toBe(false);
  });

  it('rolls back and unlocks when a migration fails', async () => {
    const base = mockClient.query.getMockImplementation();
    mockClient.query.mockImplementation(async (sql, params) => {
      if (sql.includes('token_version')) throw new Error('syntax error');
      return base(sql, params);
    });

    await expect(runStartupTasks()).rejects.toThrow('003_security_hardening');

    const calls = mockClient.query.mock.calls.map(c => c[0]);
    expect(calls).toContain('ROLLBACK');
    expect(calls[calls.length - 1]).toBe('SELECT pg_advisory_unlock($1)');
  });
});
