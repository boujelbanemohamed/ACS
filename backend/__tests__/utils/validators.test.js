const { authSchemas, bankSchemas, userSchemas, processingSchemas, notificationSchemas, apiKeySchemas, validate, validateParams, idSchema } = require('../../utils/validators');

const mockReq = (body) => ({ body, params: {} });
const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const mockNext = jest.fn();

describe('authSchemas.login', () => {
  it('passes with valid username and password', () => {
    const { error, value } = authSchemas.login.validate({ username: 'admin', password: 'test123' });
    expect(error).toBeUndefined();
  });

  it('fails when username is missing', () => {
    const { error } = authSchemas.login.validate({ password: 'test123' });
    expect(error).toBeTruthy();
    expect(error.details[0].path[0]).toBe('username');
  });

  it('fails when username is too short', () => {
    const { error } = authSchemas.login.validate({ username: 'ad', password: 'test123' });
    expect(error).toBeTruthy();
  });

  it('fails when password is missing', () => {
    const { error } = authSchemas.login.validate({ username: 'admin' });
    expect(error).toBeTruthy();
    expect(error.details[0].path[0]).toBe('password');
  });
});

describe('bankSchemas.create', () => {
  const validBank = {
    code: 'BK01',
    name: 'Banque Test',
    source_url: 'http://source.com',
    destination_url: 'http://dest.com',
    old_url: 'http://old.com',
    xml_output_url: 'http://xml.com'
  };

  it('passes with valid full bank data', () => {
    const { error } = bankSchemas.create.validate(validBank);
    expect(error).toBeUndefined();
  });

  it('fails when code is missing', () => {
    const { error } = bankSchemas.create.validate({ ...validBank, code: undefined });
    expect(error).toBeTruthy();
    expect(error.details[0].path[0]).toBe('code');
  });

  it('defaults is_active to true', () => {
    const { value } = bankSchemas.create.validate(validBank);
    expect(value.is_active).toBe(true);
  });
});

describe('bankSchemas.update', () => {
  it('passes with empty object (all fields optional)', () => {
    const { error } = bankSchemas.update.validate({});
    expect(error).toBeUndefined();
  });

  it('passes with partial update (just name)', () => {
    const { error, value } = bankSchemas.update.validate({ name: 'Updated Bank' });
    expect(error).toBeUndefined();
    expect(value.name).toBe('Updated Bank');
  });
});

describe('userSchemas.create', () => {
  const validUser = {
    username: 'newuser',
    email: 'user@test.com',
    password: 'password123'
  };

  it('passes with valid user data', () => {
    const { error } = userSchemas.create.validate(validUser);
    expect(error).toBeUndefined();
  });

  it('fails with invalid email', () => {
    const { error } = userSchemas.create.validate({ ...validUser, email: 'notanemail' });
    expect(error).toBeTruthy();
  });

  it('fails with short password', () => {
    const { error } = userSchemas.create.validate({ ...validUser, password: '12345' });
    expect(error).toBeTruthy();
  });

  it('fails with invalid role', () => {
    const { error } = userSchemas.create.validate({ ...validUser, role: 'invalid_role' });
    expect(error).toBeTruthy();
  });

  it('defaults role to "bank"', () => {
    const { value } = userSchemas.create.validate(validUser);
    expect(value.role).toBe('bank');
  });
});

describe('userSchemas.update', () => {
  it('passes with partial update', () => {
    const { error, value } = userSchemas.update.validate({ email: 'new@test.com' });
    expect(error).toBeUndefined();
    expect(value.email).toBe('new@test.com');
  });
});

describe('processingSchemas.processUrl', () => {
  it('passes with valid bankId and baseUrl', () => {
    const { error } = processingSchemas.processUrl.validate({ bankId: 1, baseUrl: 'http://example.com' });
    expect(error).toBeUndefined();
  });

  it('fails when bankId is missing', () => {
    const { error } = processingSchemas.processUrl.validate({ baseUrl: 'http://example.com' });
    expect(error).toBeTruthy();
  });
});

describe('processingSchemas.manualEntry', () => {
  const validEntry = {
    bankId: 1,
    entries: [{
      firstName: 'John',
      lastName: 'Doe',
      pan: '4741000000000006',
      expiry: '12/25',
      phone: '21612345678'
    }]
  };

  it('passes with valid entry', () => {
    const { error } = processingSchemas.manualEntry.validate(validEntry);
    expect(error).toBeUndefined();
  });

  it('fails with invalid PAN format', () => {
    const { error } = processingSchemas.manualEntry.validate({
      ...validEntry,
      entries: [{ ...validEntry.entries[0], pan: '1234' }]
    });
    expect(error).toBeTruthy();
  });

  it('fails with empty entries array', () => {
    const { error } = processingSchemas.manualEntry.validate({ bankId: 1, entries: [] });
    expect(error).toBeTruthy();
  });
});

describe('processingSchemas.callApi', () => {
  it('passes with valid callApi data', () => {
    const { error } = processingSchemas.callApi.validate({
      bankId: 1,
      url: 'http://api.example.com',
      method: 'POST'
    });
    expect(error).toBeUndefined();
  });
});

describe('notificationSchemas.smtp', () => {
  it('passes with valid SMTP config', () => {
    const { error } = notificationSchemas.smtp.validate({
      host: 'smtp.example.com',
      from_email: 'admin@example.com'
    });
    expect(error).toBeUndefined();
  });

  it('fails when host is missing', () => {
    const { error } = notificationSchemas.smtp.validate({ from_email: 'admin@example.com' });
    expect(error).toBeTruthy();
  });

  it('defaults port to 587', () => {
    const { value } = notificationSchemas.smtp.validate({
      host: 'smtp.example.com',
      from_email: 'admin@example.com'
    });
    expect(value.port).toBe(587);
  });
});

describe('notificationSchemas.email', () => {
  it('passes with valid email', () => {
    const { error } = notificationSchemas.email.validate({ email: 'test@example.com' });
    expect(error).toBeUndefined();
  });

  it('fails with invalid email', () => {
    const { error } = notificationSchemas.email.validate({ email: 'invalid' });
    expect(error).toBeTruthy();
  });
});

describe('notificationSchemas.cronConfig', () => {
  it('passes with valid cron expression', () => {
    const { error } = notificationSchemas.cronConfig.validate({ schedule: '0 0 * * *' });
    expect(error).toBeUndefined();
  });

  it('fails with invalid cron', () => {
    const { error } = notificationSchemas.cronConfig.validate({ schedule: 'invalid' });
    expect(error).toBeTruthy();
  });
});

describe('apiKeySchemas.create', () => {
  it('passes with valid API key input', () => {
    const { error } = apiKeySchemas.create.validate({ name: 'Test Key' });
    expect(error).toBeUndefined();
  });

  it('defaults permissions to ["read", "write"]', () => {
    const { value } = apiKeySchemas.create.validate({ name: 'Test Key' });
    expect(value.permissions).toEqual(['read', 'write']);
  });
});

describe('validate middleware', () => {
  beforeEach(() => {
    mockNext.mockClear();
  });

  it('calls next() when validation passes', () => {
    const middleware = validate(authSchemas.login);
    const req = { body: { username: 'admin', password: 'test123' } };
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 with formatted errors when invalid', () => {
    const middleware = validate(authSchemas.login);
    const req = { body: { username: 'ad' } };
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Erreur de validation',
      errors: expect.any(Array),
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('strips unknown fields (stripUnknown: true)', () => {
    const middleware = validate(authSchemas.login);
    const req = { body: { username: 'admin', password: 'test123', extraField: 'shouldBeStripped' } };
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.extraField).toBeUndefined();
    expect(req.body).toEqual({ username: 'admin', password: 'test123' });
  });
});

describe('validateParams middleware', () => {
  it('validates params and calls next', () => {
    const middleware = validateParams(idSchema);
    const req = { params: { id: '1' }, body: {} };
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 400 on invalid params', () => {
    const middleware = validateParams(idSchema);
    const req = { params: { id: 'abc' }, body: {} };
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Paramètres invalides'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('idSchema', () => {
  it('validates positive integer', () => {
    const { error } = idSchema.validate({ id: 5 });
    expect(error).toBeUndefined();
  });

  it('rejects zero', () => {
    const { error } = idSchema.validate({ id: 0 });
    expect(error).toBeTruthy();
  });

  it('rejects negative numbers', () => {
    const { error } = idSchema.validate({ id: -1 });
    expect(error).toBeTruthy();
  });

  it('rejects non-integer values', () => {
    const { error } = idSchema.validate({ id: 1.5 });
    expect(error).toBeTruthy();
  });
});
