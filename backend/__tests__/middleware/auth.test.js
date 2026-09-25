const { authMiddleware } = require('../../middleware/auth');

jest.mock('../../config/database', () => ({
  query: jest.fn()
}));

const jwt = require('jsonwebtoken');
const db = require('../../config/database');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createMockReqRes(token) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects request without token', async () => {
    const { req, res, next } = createMockReqRes(null);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.stringContaining('requis') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects request with invalid token', async () => {
    const { req, res, next } = createMockReqRes('invalid-token');
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.stringContaining('invalide') })
    );
  });

  it('rejects expired token', async () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '0s' });
    await new Promise(r => setTimeout(r, 100));
    const { req, res, next } = createMockReqRes(token);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('expir') })
    );
  });

  it('passes with valid token and active user', async () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'admin', email: 'admin@test.com', role: 'admin', bank_id: null, is_active: true }]
    });
    const { req, res, next } = createMockReqRes(token);
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.role).toBe('admin');
  });

  it('rejects if user not found in DB', async () => {
    const token = jwt.sign({ id: 999 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    db.query.mockResolvedValueOnce({ rows: [] });
    const { req, res, next } = createMockReqRes(token);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('non trouv') })
    );
  });

  it('rejects inactive user', async () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    db.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'inactive', role: 'bank', bank_id: 1, is_active: false }]
    });
    const { req, res, next } = createMockReqRes(token);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('désactiv') })
    );
  });

  describe('security hardening', () => {
    const activeUser = (overrides = {}) => ({
      id: 1, username: 'u', email: 'u@test.com', role: 'bank', bank_id: 2, is_active: true,
      must_change_password: false, password_changed_at: new Date(), token_version: 0, ...overrides
    });
    const reqFor = (token, url = '/api/banks', query = {}) => ({
      headers: token ? { authorization: `Bearer ${token}` } : {},
      originalUrl: url,
      query
    });
    const resMock = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

    it('rejects a token issued before a password change (token_version)', async () => {
      const token = jwt.sign({ id: 1, tv: 0 }, process.env.JWT_SECRET);
      db.query.mockResolvedValue({ rows: [activeUser({ token_version: 1 })] });
      const res = resMock();
      const next = jest.fn();

      await authMiddleware(reqFor(token), res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepts a token carrying the current token_version and hides internal columns', async () => {
      const token = jwt.sign({ id: 1, tv: 3 }, process.env.JWT_SECRET);
      db.query.mockResolvedValue({ rows: [activeUser({ token_version: 3 })] });
      const req = reqFor(token);
      const next = jest.fn();

      await authMiddleware(req, resMock(), next);

      expect(next).toHaveBeenCalled();
      expect(req.user.token_version).toBeUndefined();
      expect(req.user.must_change_password).toBeUndefined();
    });

    it('blocks the API while the password must be changed', async () => {
      const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
      db.query.mockResolvedValue({ rows: [activeUser({ must_change_password: true })] });
      const res = resMock();
      const next = jest.fn();

      await authMiddleware(reqFor(token, '/api/records'), res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('still allows the password change route while the password must be changed', async () => {
      const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
      db.query.mockResolvedValue({ rows: [activeUser({ must_change_password: true })] });
      const next = jest.fn();

      await authMiddleware(reqFor(token, '/api/auth/change-password'), resMock(), next);

      expect(next).toHaveBeenCalled();
    });

    it('blocks the API when the password is expired', async () => {
      const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
      db.query.mockResolvedValue({ rows: [activeUser({ password_changed_at: new Date(Date.now() - 120 * 86400000) })] });
      const res = resMock();

      await authMiddleware(reqFor(token), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('accepts ?token= only on the SSE stream (never elsewhere, to keep tokens out of logs)', async () => {
      const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
      db.query.mockResolvedValue({ rows: [activeUser({ role: 'super_admin' })] });

      const res = resMock();
      await authMiddleware(reqFor(null, '/api/banks?token=' + token, { token }), res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(401);

      const next = jest.fn();
      await authMiddleware(reqFor(null, '/api/live/stream?token=' + token, { token }), resMock(), next);
      expect(next).toHaveBeenCalled();
    });

    it('refuses a token signed with another algorithm (alg none)', async () => {
      const unsigned = jwt.sign({ id: 1 }, null, { algorithm: 'none' });
      const res = resMock();

      await authMiddleware(reqFor(unsigned), res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
