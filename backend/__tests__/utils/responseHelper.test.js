const { sendSuccess, sendError, sendValidationError, sendNotFound, sendUnauthorized, sendForbidden } = require('../../utils/responseHelper');

const mockRes = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn()
});

describe('sendSuccess', () => {
  it('returns status 200 with success, message, data, timestamp', () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 }, 'Créé avec succès');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Créé avec succès',
      data: { id: 1 },
      timestamp: expect.any(String)
    });
  });

  it('returns null data when not provided', () => {
    const res = mockRes();
    sendSuccess(res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: null
    }));
  });
});

describe('sendError', () => {
  it('returns status 500 with success false and message', () => {
    const res = mockRes();
    sendError(res, 'Erreur serveur');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Erreur serveur',
      timestamp: expect.any(String)
    });
  });

  it('includes errors array when provided', () => {
    const res = mockRes();
    sendError(res, 'Validation failed', 400, ['field error']);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Validation failed',
      errors: ['field error'],
      timestamp: expect.any(String)
    });
  });
});

describe('sendValidationError', () => {
  it('returns status 400 with errors wrapped in array if single string', () => {
    const res = mockRes();
    sendValidationError(res, 'Le champ est requis');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Erreur de validation',
      errors: ['Le champ est requis'],
      timestamp: expect.any(String)
    });
  });

  it('passes through array errors', () => {
    const res = mockRes();
    sendValidationError(res, ['err1', 'err2']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      errors: ['err1', 'err2']
    }));
  });
});

describe('sendNotFound', () => {
  it('returns status 404 with message including resource name', () => {
    const res = mockRes();
    sendNotFound(res, 'Banque');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Banque non trouvé(e)',
      timestamp: expect.any(String)
    });
  });

  it('uses default resource name "Ressource"', () => {
    const res = mockRes();
    sendNotFound(res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Ressource non trouvé(e)'
    }));
  });
});

describe('sendUnauthorized', () => {
  it('returns status 401 with default message', () => {
    const res = mockRes();
    sendUnauthorized(res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Non autorisé',
      timestamp: expect.any(String)
    });
  });

  it('returns status 401 with custom message', () => {
    const res = mockRes();
    sendUnauthorized(res, 'Token requis');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Token requis'
    }));
  });
});

describe('sendForbidden', () => {
  it('returns status 403 with default message', () => {
    const res = mockRes();
    sendForbidden(res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Accès refusé',
      timestamp: expect.any(String)
    });
  });

  it('returns status 403 with custom message', () => {
    const res = mockRes();
    sendForbidden(res, 'Rôle insuffisant');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Rôle insuffisant'
    }));
  });
});
