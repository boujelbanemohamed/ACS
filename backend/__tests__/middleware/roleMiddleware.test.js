jest.mock('../../config/database');
jest.mock('../../services/roleFeaturesService');

const { checkRole, checkFeature, isSuperAdmin, isSuperAdminOrBankAdmin, filterByBank, forceBankId, checkBankAccess } = require('../../middleware/roleMiddleware');
const roleFeaturesService = require('../../services/roleFeaturesService');

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

describe('checkFeature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks request without user', async () => {
    const middleware = checkFeature('banks');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows super_admin without checking features', async () => {
    const middleware = checkFeature('banks');
    const req = { user: { id: 1, role: 'super_admin', bank_id: null } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware(req, res, next);
    expect(roleFeaturesService.getEffectiveFeatures).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('allows bank_admin with enabled feature', async () => {
    roleFeaturesService.getEffectiveFeatures.mockResolvedValue({ banks: true });
    const middleware = checkFeature('banks');
    const req = { user: { id: 2, role: 'bank_admin', bank_id: 1 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware(req, res, next);
    expect(roleFeaturesService.getEffectiveFeatures).toHaveBeenCalledWith(2, 'bank_admin', 1);
    expect(next).toHaveBeenCalled();
  });

  it('blocks bank_admin with disabled feature', async () => {
    roleFeaturesService.getEffectiveFeatures.mockResolvedValue({ banks: false });
    const middleware = checkFeature('banks');
    const req = { user: { id: 2, role: 'bank_admin', bank_id: 1 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(next).not.toHaveBeenCalled();
  });

  it('allows bank user with enabled feature', async () => {
    roleFeaturesService.getEffectiveFeatures.mockResolvedValue({ processing: true });
    const middleware = checkFeature('processing');
    const req = { user: { id: 3, role: 'bank', bank_id: 2 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware(req, res, next);
    expect(roleFeaturesService.getEffectiveFeatures).toHaveBeenCalledWith(3, 'bank', 2);
    expect(next).toHaveBeenCalled();
  });

  it('returns 500 on service error', async () => {
    roleFeaturesService.getEffectiveFeatures.mockRejectedValue(new Error('DB error'));
    const middleware = checkFeature('banks');
    const req = { user: { id: 2, role: 'bank', bank_id: 1 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('isSuperAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks request without user', () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    isSuperAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks non-super_admin role', () => {
    const req = { user: { role: 'bank_admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    isSuperAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows super_admin', () => {
    const req = { user: { role: 'super_admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    isSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('isSuperAdminOrBankAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks request without user', () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    isSuperAdminOrBankAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks bank user', () => {
    const req = { user: { role: 'bank' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    isSuperAdminOrBankAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows super_admin', () => {
    const req = { user: { role: 'super_admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    isSuperAdminOrBankAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows bank_admin', () => {
    const req = { user: { role: 'bank_admin', bank_id: 3 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    isSuperAdminOrBankAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('filterByBank', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks request without user', () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    filterByBank(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through for super_admin', () => {
    const req = { user: { role: 'super_admin', bank_id: null }, query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    filterByBank(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.query.bankId).toBeUndefined();
  });

  it('sets bank filter for bank user', () => {
    const req = { user: { role: 'bank', bank_id: 5 }, query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    filterByBank(req, res, next);
    expect(req.query.bankId).toBe(5);
    expect(req.bankFilter).toBe(5);
    expect(next).toHaveBeenCalled();
  });
});

describe('forceBankId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks request without user', () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    forceBankId(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('forces bank_id in body for bank users', () => {
    const req = { user: { role: 'bank', bank_id: 3 }, body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    forceBankId(req, res, next);
    expect(req.body.bankId).toBe(3);
    expect(next).toHaveBeenCalled();
  });

  it('does not change body for super_admin', () => {
    const req = { user: { role: 'super_admin', bank_id: null }, body: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    forceBankId(req, res, next);
    expect(req.body.bankId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('checkBankAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks request without user', () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    checkBankAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows super_admin', () => {
    const req = { user: { role: 'super_admin', bank_id: null }, params: { bankId: '5' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    checkBankAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows bank user accessing own bank', () => {
    const req = { user: { role: 'bank', bank_id: 5 }, params: { bankId: '5' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    checkBankAccess(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks bank user accessing other bank', () => {
    const req = { user: { role: 'bank', bank_id: 5 }, params: { bankId: '10' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    checkBankAccess(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
