const { AppError, createValidationError, createNotFoundError, createUnauthorizedError, createForbiddenError, createConflictError, errorHandler, notFoundHandler, asyncHandler } = require('../../middleware/errorHandler');

let originalNodeEnv;

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  jest.clearAllMocks();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

const req = { method: 'GET', path: '/test' };
const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
const next = jest.fn();

describe('AppError', () => {
  it('creates error with message, statusCode, status fail for 4xx, isOperational=true, errors', () => {
    const err = new AppError('Not found', 404, ['err1']);
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.status).toBe('fail');
    expect(err.isOperational).toBe(true);
    expect(err.errors).toEqual(['err1']);
  });

  it('creates error with status error for 5xx', () => {
    const err = new AppError('Server error', 500);
    expect(err.status).toBe('error');
  });

  it('sets errors to null when not provided', () => {
    const err = new AppError('Error', 400);
    expect(err.errors).toBeNull();
  });
});

describe('createValidationError', () => {
  it('returns AppError with 400 and errors', () => {
    const err = createValidationError(['field is required']);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Erreur de validation');
    expect(err.errors).toEqual(['field is required']);
  });
});

describe('createNotFoundError', () => {
  it('returns AppError with 404 and custom resource message', () => {
    const err = createNotFoundError('Banque');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Banque non trouvé(e)');
  });

  it('uses default resource name', () => {
    const err = createNotFoundError();
    expect(err.message).toBe('Ressource non trouvé(e)');
  });
});

describe('createUnauthorizedError', () => {
  it('returns AppError with 401', () => {
    const err = createUnauthorizedError('Token manquant');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Token manquant');
  });

  it('uses default message', () => {
    const err = createUnauthorizedError();
    expect(err.message).toBe('Non autorisé');
  });
});

describe('createForbiddenError', () => {
  it('returns AppError with 403', () => {
    const err = createForbiddenError('Accès interdit');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Accès interdit');
  });

  it('uses default message', () => {
    const err = createForbiddenError();
    expect(err.message).toBe('Accès refusé');
  });
});

describe('createConflictError', () => {
  it('returns AppError with 409', () => {
    const err = createConflictError('Doublon');
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Doublon');
  });

  it('uses default message', () => {
    const err = createConflictError();
    expect(err.message).toBe('Conflit de données');
  });
});

describe('errorHandler', () => {
  it('handles operational error with statusCode, message, errors, timestamp', () => {
    const err = new AppError('Validation failed', 400, ['field error']);
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors: ['field error'],
      timestamp: expect.any(String)
    });
  });

  it('handles operational error without errors', () => {
    const err = new AppError('Not found', 404);
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Not found',
      timestamp: expect.any(String)
    });
  });

  it('handles MulterError LIMIT_FILE_SIZE', () => {
    const err = new Error('File too large');
    err.name = 'MulterError';
    err.code = 'LIMIT_FILE_SIZE';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Fichier trop volumineux (max 10MB)'
    }));
  });

  it('handles MulterError LIMIT_UNEXPECTED_FILE', () => {
    const err = new Error('Unexpected file');
    err.name = 'MulterError';
    err.code = 'LIMIT_UNEXPECTED_FILE';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Type de fichier non autorisé'
    }));
  });

  it('handles JsonWebTokenError', () => {
    const err = new Error('jwt malformed');
    err.name = 'JsonWebTokenError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Token invalide'
    }));
  });

  it('handles TokenExpiredError', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Token expiré'
    }));
  });

  it('handles PostgreSQL unique violation (23505)', () => {
    const err = new Error('Duplicate key');
    err.code = '23505';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Cette entrée existe déjà'
    }));
  });

  it('handles PostgreSQL foreign key violation (23503)', () => {
    const err = new Error('Foreign key violation');
    err.code = '23503';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Référence invalide'
    }));
  });

  it('handles Joi ValidationError', () => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.isJoi = true;
    err.details = [
      { path: ['username'], message: '"username" is required' },
      { path: ['email'], message: '"email" must be valid' }
    ];
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Erreur de validation',
      errors: [
        { field: 'username', message: '"username" is required' },
        { field: 'email', message: '"email" must be valid' }
      ],
      timestamp: expect.any(String)
    });
  });

  it('handles SyntaxError with status 400 and body', () => {
    const err = new SyntaxError('Unexpected token');
    err.status = 400;
    err.body = '{bad json}';
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'JSON invalide'
    }));
  });

  it('handles unknown error in production with generic message', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Sensitive details');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Erreur serveur interne'
    }));
  });

  it('handles unknown error outside production with actual message', () => {
    delete process.env.NODE_ENV;
    const err = new Error('Database connection failed');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Database connection failed'
    }));
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with message containing method and path', () => {
    const notFoundReq = { method: 'POST', path: '/api/unknown' };
    const notFoundRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    notFoundHandler(notFoundReq, notFoundRes);
    expect(notFoundRes.status).toHaveBeenCalledWith(404);
    expect(notFoundRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Route POST /api/unknown non trouvée',
      timestamp: expect.any(String)
    });
  });

  it('response has success: false and timestamp', () => {
    const notFoundReq = { method: 'GET', path: '/test' };
    const notFoundRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    notFoundHandler(notFoundReq, notFoundRes);
    expect(notFoundRes.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      timestamp: expect.any(String)
    }));
  });
});

describe('asyncHandler', () => {
  it('wraps function, calls next when promise rejects', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('async error'));
    const wrapped = asyncHandler(fn);
    await wrapped(req, res, next);
    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('wraps function, calls function directly when it resolves', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const wrapped = asyncHandler(fn);
    await wrapped(req, res, next);
    expect(fn).toHaveBeenCalledWith(req, res, next);
  });
});
