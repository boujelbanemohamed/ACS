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
});
