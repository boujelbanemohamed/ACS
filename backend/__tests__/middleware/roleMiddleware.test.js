const { checkRole } = require('../../middleware/roleMiddleware');

describe('checkRole', () => {
  it('allows user with matching role', () => {
    const middleware = checkRole('admin');
    const req = { user: { role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows user with one of multiple roles', () => {
    const middleware = checkRole('admin', 'superadmin');
    const req = { user: { role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks user without matching role', () => {
    const middleware = checkRole('superadmin');
    const req = { user: { role: 'bank' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks request without user', () => {
    const middleware = checkRole('admin');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
