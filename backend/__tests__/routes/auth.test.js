const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

jest.mock('../../config/database');
jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'test-id' })
}));

const db = require('../../config/database');
const authRoutes = require('../../routes/auth');
const emailService = require('../../services/emailService');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';
process.env.JWT_EXPIRE = '1h';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });
  return app;
}

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('login with valid credentials returns token', async () => {
      const hashedPassword = await bcrypt.hash('correctpass', 10);
      db.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, username: 'admin', password: hashedPassword, email: 'admin@test.com', role: 'admin', bank_id: null, is_active: true }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'correctpass' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.role).toBe('admin');
    });

    it('rejects wrong password', async () => {
      const hashedPassword = await bcrypt.hash('correctpass', 10);
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, username: 'admin', password: hashedPassword, email: 'admin@test.com', role: 'admin', is_active: true }]
      });

      const res = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpass' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects non-existent user', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'nobody', password: 'test1234' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('invalides');
    });

    it('rejects inactive user', async () => {
      const hashedPassword = await bcrypt.hash('test1234', 10);
      db.query.mockResolvedValueOnce({
        rows: [{ id: 2, username: 'inactive', password: hashedPassword, role: 'bank', bank_id: 1, is_active: false }]
      });

      const res = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'inactive', password: 'test1234' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('desactive');
    });

    it('returns 400 for missing username', async () => {
      const res = await request(createTestApp())
        .post('/api/auth/login')
        .send({ password: 'test1234' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing password', async () => {
      const res = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'admin' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('sends same response whether email exists or not', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('envoy');
    });

    it('generates reset token when email exists', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin', email: 'admin@test.com' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalled();
      const emailCall = emailService.sendEmail.mock.calls[0];
      expect(emailCall[0]).toBe('admin@test.com');
      expect(emailCall[1]).toContain('mot de passe');
    });

    it('returns 400 for missing email', async () => {
      const res = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('resets password with valid token', async () => {
      const token = 'valid-reset-token-32-chars-minimum!!';
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewPass123!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid token', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token', password: 'NewPass123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects short password', async () => {
      const res = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token: 'some-token', password: '12' });

      expect(res.status).toBe(400);
    });

    it('rejects missing token', async () => {
      const res = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ password: 'NewPass123!' });

      expect(res.status).toBe(400);
    });
  });
});
