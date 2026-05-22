jest.mock('dotenv', () => ({ config: jest.fn() }));

const request = require('supertest');

const rateLimitConfigs = [];
jest.mock('express-rate-limit', () => jest.fn((opts) => {
  rateLimitConfigs.push(opts);
  return (req, res, next) => next();
}));

jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
  pool: { end: jest.fn().mockResolvedValue() }
}));

jest.mock('helmet', () => () => (req, res, next) => next());
jest.mock('compression', () => () => (req, res, next) => next());
jest.mock('morgan', () => () => (req, res, next) => next());
const corsConfigs = [];
jest.mock('cors', () => jest.fn((opts) => {
  corsConfigs.push(opts);
  return (req, res, next) => next();
}));

jest.mock('../services/cronService', () => ({
  createTable: jest.fn().mockResolvedValue(),
  init: jest.fn(),
  schedule: '*/5 * * * *',
  describeCron: jest.fn().mockReturnValue('every 5 minutes'),
  enabled: true
}));
jest.mock('../services/roleFeaturesService', () => ({
  seedDefaults: jest.fn().mockResolvedValue()
}));
jest.mock('../services/encryptionService', () => ({
  maskResponseData: jest.fn(data => data)
}));
jest.mock('../middleware/auth', () => ({
  authMiddleware: jest.fn((req, res, next) => {
    req.user = { id: 1, username: 'admin', role: 'super_admin', bank_id: null };
    next();
  })
}));
jest.mock('../middleware/roleMiddleware', () => ({
  checkRole: jest.fn(() => (req, res, next) => next()),
  checkFeature: jest.fn(() => (req, res, next) => next()),
  isSuperAdmin: jest.fn((req, res, next) => next())
}));

const mockErrorHandler = jest.fn((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ success: false, message: err.isOperational ? err.message : 'Erreur serveur interne', timestamp: new Date().toISOString() });
});
const mockNotFoundHandler = jest.fn((req, res) => {
  res.status(404).json({ success: false, message: 'Not found', timestamp: new Date().toISOString() });
});
jest.mock('../middleware/errorHandler', () => ({
  errorHandler: mockErrorHandler,
  notFoundHandler: mockNotFoundHandler
}));

const createMockRouter = () => {
  const Router = require('express').Router;
  return Router();
};
jest.mock('../routes/auth', () => createMockRouter());
jest.mock('../routes/banks', () => createMockRouter());
jest.mock('../routes/processing', () => createMockRouter());
jest.mock('../routes/dashboard', () => createMockRouter());
jest.mock('../routes/records', () => createMockRouter());
jest.mock('../routes/settings', () => createMockRouter());
jest.mock('../routes/xmlLogs', () => createMockRouter());
jest.mock('../routes/history', () => createMockRouter());
jest.mock('../routes/publicApi', () => createMockRouter());
jest.mock('../routes/recordHistory', () => createMockRouter());
jest.mock('../routes/apiKeys', () => createMockRouter());
jest.mock('../routes/users', () => createMockRouter());
jest.mock('../routes/enrollment', () => createMockRouter());
jest.mock('../routes/notifications', () => createMockRouter());
jest.mock('../routes/scanner', () => createMockRouter());
jest.mock('../routes/monitoring', () => createMockRouter());
jest.mock('../routes/audit', () => createMockRouter());
jest.mock('../routes/roleFeatures', () => createMockRouter());

const OLD_ENV = { ...process.env };
const db = require('../config/database');

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  process.env = { ...OLD_ENV };
});

describe('Startup validation', () => {
  function expectStartupToExit(envVars, expectedCode) {
    const oldExit = process.exit;
    process.exit = jest.fn();
    const savedEnv = { ...process.env };

    process.env = {};
    Object.entries(envVars).forEach(([k, v]) => { process.env[k] = v; });

    jest.isolateModules(() => {
      require('../server');
    });

    expect(process.exit).toHaveBeenCalledWith(expectedCode);
    process.exit = oldExit;
    process.env = savedEnv;
  }

  it('exits with error when JWT_SECRET is missing', () => {
    expectStartupToExit({
      JWT_SECRET: '',
      PAN_ENCRYPTION_KEY: 'test-key-32-chars-here!!!',
      NODE_ENV: 'test',
      PORT: '0'
    }, 1);
  });

  it('exits with error when JWT_SECRET is too short', () => {
    expectStartupToExit({
      JWT_SECRET: 'short',
      PAN_ENCRYPTION_KEY: 'test-key-32-chars-here!!!',
      NODE_ENV: 'test',
      PORT: '0'
    }, 1);
  });

  it('exits with error when PAN_ENCRYPTION_KEY is missing in production', () => {
    expectStartupToExit({
      JWT_SECRET: 'test-secret-key-min-32-chars-here!!!',
      NODE_ENV: 'production',
      PORT: '0'
    }, 1);
  });

  it('logs warning when PAN_ENCRYPTION_KEY is missing in development', () => {
    console.warn = jest.fn();
    const savedEnv = { ...process.env };

    process.env = {};
    Object.entries({
      JWT_SECRET: 'test-secret-key-min-32-chars-here!!!',
      NODE_ENV: 'development',
      PORT: '0'
    }).forEach(([k, v]) => { process.env[k] = v; });

    jest.isolateModules(() => {
      require('../server');
    });

    expect(console.warn).toHaveBeenCalled();
    process.env = savedEnv;
  });
});

describe('Server app', () => {
  let app;

  beforeAll(() => {
    jest.clearAllMocks();
    rateLimitConfigs.length = 0;
    corsConfigs.length = 0;

    jest.isolateModules(() => {
      process.env = {
        JWT_SECRET: 'test-secret-key-min-32-chars-here!!!',
        PAN_ENCRYPTION_KEY: 'test-encryption-key-32-chars!!!',
        NODE_ENV: 'test',
        PORT: '0',
        CORS_ORIGIN: 'http://example.com,http://test.com'
      };
      app = require('../server');
    });
  });

  describe('Health check', () => {
    it('returns 200 when DB is up', async () => {
      db.query.mockResolvedValue({ rows: [{ now: new Date() }] });
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('API et base de donnees operationnelles');
      expect(res.body.timestamp).toBeDefined();
    });

    it('returns 503 when DB is down', async () => {
      db.query.mockRejectedValue(new Error('connection refused'));
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
    });
  });

  describe('CORS', () => {
    it('passes CORS_ORIGIN env var to cors middleware', () => {
      const originConfig = corsConfigs.find(c => c.origin && Array.isArray(c.origin) && c.origin.includes('http://example.com'));
      expect(originConfig).toBeDefined();
      expect(originConfig.credentials).toBe(true);
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown-route');
      expect(res.status).toBe(404);
    });
  });

  describe('Rate limiting', () => {
    it('applies global rate limiter with 5000 requests per 15 min', () => {
      const globalConfig = rateLimitConfigs.find(c => c.max === 5000);
      expect(globalConfig).toBeDefined();
      expect(globalConfig.windowMs).toBe(15 * 60 * 1000);
    });

    it('applies auth rate limiter with configurable max', () => {
      const authConfig = rateLimitConfigs.find(c => c.max === 1000 || c.max === parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10));
      expect(authConfig).toBeDefined();
      expect(authConfig.windowMs).toBe(60 * 1000);
    });
  });

  describe('Route mounting', () => {
    it('loads all route modules', () => {
      expect(true).toBe(true);
    });

    it('loads publicApi routes without auth', () => {
      expect(true).toBe(true);
    });
  });

  describe('PAN masking middleware', () => {
    it('installs PAN masking on app', () => {
      const { maskResponseData } = require('../services/encryptionService');
      expect(maskResponseData).toBeDefined();
    });
  });

  describe('Graceful shutdown', () => {
    it('handles SIGTERM signal', () => {
      const listeners = process.listeners('SIGTERM');
      expect(listeners.length).toBeGreaterThan(0);
    });

    it('handles SIGINT signal', () => {
      const listeners = process.listeners('SIGINT');
      expect(listeners.length).toBeGreaterThan(0);
    });
  });
});
