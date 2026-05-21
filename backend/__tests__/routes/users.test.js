const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

jest.mock('../../config/database');
jest.mock('../../services/auditService');

jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    if (req.headers['x-test-role']) {
      req.user = {
        id: parseInt(req.headers['x-test-id'] || '1'),
        username: req.headers['x-test-username'] || 'admin',
        role: req.headers['x-test-role'],
        bank_id: parseInt(req.headers['x-test-bank-id'] || '0') || null
      };
    } else {
      req.user = { id: 1, username: 'admin', role: 'super_admin', bank_id: null };
    }
    next();
  }
}));

jest.mock('../../middleware/roleMiddleware', () => {
  const actual = jest.requireActual('../../middleware/roleMiddleware');
  return {
    ...actual,
    checkRole: (...roles) => (req, res, next) => {
      if (roles.includes(req.user.role)) return next();
      return res.status(403).json({ success: false, message: 'Accès non autorisé' });
    }
  };
});

const db = require('../../config/database');
const auditService = require('../../services/auditService');
const usersRoutes = require('../../routes/users');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRoutes);
  return app;
}

describe('Users Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users', () => {
    it('super_admin sees all users', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', role: 'super_admin', email: 'admin@test.com' }] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const res = await request(createTestApp())
        .get('/api/users')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('bank_admin sees only their bank users', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'bankuser', role: 'bank', bank_id: 3, email: 'user@bank.com' }] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const res = await request(createTestApp())
        .get('/api/users')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain('WHERE u.bank_id = $1');
      expect(db.query.mock.calls[0][1]).toEqual([3, 50, 0]);
    });

    it('blocks bank user', async () => {
      const res = await request(createTestApp())
        .get('/api/users')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/users/:id', () => {
    it('returns user by id as super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', role: 'super_admin' }] });
      const res = await request(createTestApp())
        .get('/api/users/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent user', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/users/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });

    it('blocks bank user', async () => {
      const res = await request(createTestApp())
        .get('/api/users/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/users', () => {
    it('creates a user as super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'newuser', email: 'new@test.com', role: 'bank', bank_id: 1 }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/users')
        .send({ username: 'newuser', email: 'new@test.com', password: 'Pass1234' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects missing required fields', async () => {
      const res = await request(createTestApp())
        .post('/api/users')
        .send({ username: 'newuser' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
    });

    it('rejects duplicate username or email', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(createTestApp())
        .post('/api/users')
        .send({ username: 'existing', email: 'existing@test.com', password: 'Pass1234' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('deja utilise');
    });

    it('bank_admin can only create bank users', async () => {
      const res = await request(createTestApp())
        .post('/api/users')
        .send({ username: 'newadmin', email: 'admin2@test.com', password: 'Pass1234', role: 'super_admin' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(403);
    });

    it('bank_admin gets auto-assigned to their bank', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 5, username: 'bankuser', role: 'bank', bank_id: 3 }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/users')
        .send({ username: 'bankuser', email: 'bu@test.com', password: 'Pass1234', role: 'bank' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
    });

    it('blocks bank user from creating users', async () => {
      const res = await request(createTestApp())
        .post('/api/users')
        .send({ username: 'newuser', email: 'new@test.com', password: 'Pass1234' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('updates a user as super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'old', role: 'bank', bank_id: 1, password: 'hash' }] })
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'updated', role: 'bank', bank_id: 1 }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/users/2')
        .send({ username: 'updated' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent user', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .put('/api/users/999')
        .send({ username: 'ghost' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });

    it('bank_admin can only update users in their bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 2, username: 'other', role: 'bank', bank_id: 5, password: 'hash' }] });
      const res = await request(createTestApp())
        .put('/api/users/2')
        .send({ username: 'hack' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('deletes a user as super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'delete_me', role: 'bank', bank_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 2 }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .delete('/api/users/2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('blocks deleting own account', async () => {
      const res = await request(createTestApp())
        .delete('/api/users/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin')
        .set('x-test-id', '1');
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('propre compte');
    });

    it('returns 404 for non-existent user', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .delete('/api/users/999')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(404);
    });

    it('bank_admin cannot delete super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 10, username: 'admin', role: 'super_admin', bank_id: null }] });
      const res = await request(createTestApp())
        .delete('/api/users/10')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-id', '1')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/users/me/profile', () => {
    it('returns own profile', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', email: 'admin@test.com', role: 'super_admin' }] });
      const res = await request(createTestApp())
        .get('/api/users/me/profile')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('PUT /api/users/me/profile', () => {
    it('updates own profile', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, password: 'hash' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', email: 'new@test.com', phone: '21699123456' }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/users/me/profile')
        .send({ email: 'new@test.com', phone: '21699123456' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });
  });
});
