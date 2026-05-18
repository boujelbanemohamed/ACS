const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    req.user = req.user || { id: 1, username: 'admin', role: 'admin', bank_id: null };
    next();
  }
}));

const db = require('../../config/database');
const dashboardRoutes = require('../../routes/dashboard');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRoutes);
  return app;
}

describe('Dashboard Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockStats = () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ count: '100' }] })
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', processed_at: new Date().toISOString(), file_name: 'test.csv' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', total_records: 50, total_files: 10, successful_files: 8, failed_files: 2 }] });
  };

  it('returns dashboard stats for admin', async () => {
    mockStats();

    const res = await request(createTestApp())
      .get('/api/dashboard')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalBanks');
    expect(res.body.data).toHaveProperty('totalRecords');
    expect(res.body.data).toHaveProperty('recentActivity');
    expect(res.body.data).toHaveProperty('bankStats');
  });

  it('filters stats for bank user', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 2, username: 'bankuser', role: 'bank', bank_id: 1 };
      next();
    });
    app.use('/api/dashboard', dashboardRoutes);

    db.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', processed_at: new Date().toISOString(), file_name: 'test.csv' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Bank A', code: 'BA', total_records: 50, total_files: 10, successful_files: 8, failed_files: 2 }] });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', 'Bearer bank-token');

    expect(res.status).toBe(200);
    expect(res.body.data.bankStats).toHaveLength(1);
  });
});
