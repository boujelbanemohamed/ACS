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

    it('generates reset token and sends email for super_admin', async () => {
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

    it('generates reset token and sends email for bank_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 2, username: 'bankadmin', email: 'bankadmin@test.com', role: 'bank_admin' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'bankadmin@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith('bankadmin@test.com', expect.stringContaining('mot de passe'), expect.any(String), expect.any(String));
    });

    it('generates reset token and sends email for bank user', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 3, username: 'bankuser', email: 'bankuser@test.com', role: 'bank' }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'bankuser@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(emailService.sendEmail).toHaveBeenCalledWith('bankuser@test.com', expect.stringContaining('mot de passe'), expect.any(String), expect.any(String));
    });

    it('stores reset_token in DB for any role', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 5, username: 'anyuser', email: 'any@test.com', role: 'bank' }] })
        .mockResolvedValueOnce({ rows: [] });

      await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'any@test.com' });

      const updateQuery = db.query.mock.calls[1][0];
      const updateParams = db.query.mock.calls[1][1];
      expect(updateQuery).toContain('UPDATE users SET reset_token');
      expect(updateQuery).toContain('WHERE id = $3');
      expect(updateParams[2]).toBe(5);
      expect(updateParams[0]).toBeDefined();
      expect(updateParams[1]).toBeDefined();
    });

    it('rejects inactive user regardless of role', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'disabled@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('envoy');
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('returns 400 for missing email', async () => {
      const res = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('resets password with valid token for super_admin', async () => {
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

    it('resets password with valid token for bank_admin', async () => {
      const token = 'bank-admin-reset-token-32!!';
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewPass456!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const updateCall = db.query.mock.calls[1][0];
      expect(updateCall).toContain('UPDATE users SET password');
    });

    it('resets password with valid token for bank user', async () => {
      const token = 'bank-user-reset-token-32-chars';
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 3 }] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewPass789!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('clears reset_token after successful reset', async () => {
      const token = 'clear-token-after-reset-32-chars';
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token, password: 'NewPass123!' });

      const updateQuery = db.query.mock.calls[1][0];
      expect(updateQuery).toContain('reset_token = NULL');
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

  describe('Full forgot-password cycle for all roles', () => {
    const token = 'test-reset-token-32-chars-x!!';
    const newPassword = 'NewSuperPass123!';

    it('full cycle: forgot → reset → login for super_admin', async () => {
      const user = { id: 1, username: 'admin', email: 'admin@test.com', role: 'super_admin', bank_id: null, is_active: true };
      const hashedNew = await bcrypt.hash(newPassword, 10);

      db.query
        .mockResolvedValueOnce({ rows: [user] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...user, password: hashedNew, bank_name: null, bank_code: null }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const forgotRes = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@test.com' });
      expect(forgotRes.status).toBe(200);
      expect(emailService.sendEmail).toHaveBeenCalledWith('admin@test.com', expect.any(String), expect.any(String), expect.any(String));

      const resetRes = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword });
      expect(resetRes.status).toBe(200);

      const loginRes = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'admin', password: newPassword });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('super_admin');
    });

    it('full cycle: forgot → reset → login for bank_admin', async () => {
      const user = { id: 2, username: 'bankadmin', email: 'bankadmin@test.com', role: 'bank_admin', bank_id: 3, is_active: true };
      const hashedNew = await bcrypt.hash(newPassword, 10);

      db.query
        .mockResolvedValueOnce({ rows: [user] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 2 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...user, password: hashedNew, bank_name: 'Bank', bank_code: 'BK' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const forgotRes = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'bankadmin@test.com' });
      expect(forgotRes.status).toBe(200);

      const resetRes = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword });
      expect(resetRes.status).toBe(200);

      const loginRes = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'bankadmin', password: newPassword });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('bank_admin');
    });

    it('full cycle: forgot → reset → login for bank user', async () => {
      const user = { id: 3, username: 'bankuser', email: 'bankuser@test.com', role: 'bank', bank_id: 1, is_active: true };
      const hashedNew = await bcrypt.hash(newPassword, 10);

      db.query
        .mockResolvedValueOnce({ rows: [user] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 3 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...user, password: hashedNew, bank_name: 'Bank A', bank_code: 'BA' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const forgotRes = await request(createTestApp())
        .post('/api/auth/forgot-password')
        .send({ email: 'bankuser@test.com' });
      expect(forgotRes.status).toBe(200);

      const resetRes = await request(createTestApp())
        .post('/api/auth/reset-password')
        .send({ token, password: newPassword });
      expect(resetRes.status).toBe(200);

      const loginRes = await request(createTestApp())
        .post('/api/auth/login')
        .send({ username: 'bankuser', password: newPassword });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('bank');
    });
  });
});
