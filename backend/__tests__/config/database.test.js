let mockPoolInstance;
jest.mock('pg', () => {
  mockPoolInstance = {
    query: jest.fn(),
    on: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mockPoolInstance)
  };
});

jest.mock('dotenv', () => ({
  config: jest.fn()
}));

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
  delete process.env.DB_HOST;
  delete process.env.DB_PORT;
  delete process.env.DB_NAME;
  delete process.env.DB_USER;
  delete process.env.DB_PASSWORD;
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe('Database config', () => {
  it('creates Pool with default env values', () => {
    const { Pool } = require('pg');
    require('../../config/database');
    expect(Pool).toHaveBeenCalledWith({
      host: 'localhost',
      port: 5432,
      database: 'banking_db',
      user: 'banking_user',
      password: 'banking_password',
      max: 100,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  });

  it('creates Pool with env var overrides', () => {
    process.env.DB_HOST = 'myhost';
    process.env.DB_PORT = '5433';
    process.env.DB_NAME = 'mydb';
    process.env.DB_USER = 'myuser';
    process.env.DB_PASSWORD = 'mypass';
    jest.resetModules();
    const { Pool } = require('pg');
    require('../../config/database');
    expect(Pool).toHaveBeenCalledWith({
      host: 'myhost',
      port: '5433',
      database: 'mydb',
      user: 'myuser',
      password: 'mypass',
      max: 100,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  });

  it('exports query function', () => {
    const db = require('../../config/database');
    db.query('SELECT 1', ['arg']);
    expect(mockPoolInstance.query).toHaveBeenCalledWith('SELECT 1', ['arg']);
  });

  it('exports pool object', () => {
    const db = require('../../config/database');
    expect(db.pool).toBe(mockPoolInstance);
  });

  it('registers error handler on pool', () => {
    require('../../config/database');
    expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('error handler calls process.exit(-1)', () => {
    require('../../config/database');
    const errorHandler = mockPoolInstance.on.mock.calls.find(call => call[0] === 'error')[1];
    const originalExit = process.exit;
    process.exit = jest.fn();
    errorHandler(new Error('test error'));
    expect(process.exit).toHaveBeenCalledWith(-1);
    process.exit = originalExit;
  });
});
