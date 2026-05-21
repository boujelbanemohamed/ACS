const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ query: mockQuery }));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('fs');

beforeEach(() => {
  jest.resetModules();
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
  process.exit = jest.fn();
  console.log = jest.fn();
  console.error = jest.fn();
});

describe('migrate runner', () => {
  it('creates schema_migrations table if not exists', () => {
    const fs = require('fs');
    fs.readdirSync.mockReturnValue([]);

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
    });
  });

  it('fetches already applied migrations', () => {
    const fs = require('fs');
    fs.readdirSync.mockReturnValue([]);

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
    });
  });

  it('reads migration files from migrations directory', () => {
    const fs = require('fs');
    fs.readdirSync.mockReturnValue(['001_initial.sql', '002_add_field.sql']);

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(fs.readdirSync).toHaveBeenCalled();
      const dirArg = fs.readdirSync.mock.calls[0][0];
      expect(dirArg).toContain('migrations');
    });
  });

  it('applies new migrations that have not been applied yet', () => {
    const fs = require('fs');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ version: '001_initial' }] })
      .mockResolvedValueOnce({ rows: [] });
    fs.readdirSync.mockReturnValue(['001_initial.sql', '002_add_field.sql']);
    fs.readFileSync = jest.fn().mockReturnValue('CREATE TABLE test (id INT);');

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('002_add_field.sql'),
        'utf8'
      );
      expect(mockQuery).toHaveBeenCalledWith('CREATE TABLE test (id INT);');
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        ['002_add_field', '002_add_field.sql']
      );
    });
  });

  it('skips already applied migrations', () => {
    const fs = require('fs');
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ version: '001_initial' }] });
    fs.readdirSync.mockReturnValue(['001_initial.sql']);

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('déjà appliquée')
      );
    });
  });

  it('stops and exits with 1 on migration error', () => {
    const fs = require('fs');
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    fs.readdirSync.mockReturnValue(['001_initial.sql']);
    fs.readFileSync = jest.fn().mockReturnValue('BROKEN SQL');
    mockQuery.mockRejectedValueOnce(new Error('SQL error'));

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  it('exits with 0 when all migrations are applied', () => {
    const fs = require('fs');
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ version: '001_initial' }] });
    fs.readdirSync.mockReturnValue(['001_initial.sql']);

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  it('exits with 0 when no migrations exist', () => {
    const fs = require('fs');
    fs.readdirSync.mockReturnValue([]);

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  it('reports count of applied migrations', () => {
    const fs = require('fs');
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    fs.readdirSync.mockReturnValue(['001_init.sql']);
    fs.readFileSync = jest.fn().mockReturnValue('SELECT 1');

    require('../../scripts/migrate');
    return new Promise(process.nextTick).then(() => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('1 migration(s) appliquée(s)')
      );
    });
  });
});
