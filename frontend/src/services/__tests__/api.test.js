const mockAxiosInstance = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  patch: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
}));

const api = require('../api').default;
const { authAPI, banksAPI, processingAPI, dashboardAPI } = require('../api');
const axios = require('axios');

const axiosCreateConfig = axios.create.mock.calls[0][0];
const [[requestHandler, requestErrorHandler]] = mockAxiosInstance.interceptors.request.use.mock.calls;
const [[responseHandler, responseErrorHandler]] = mockAxiosInstance.interceptors.response.use.mock.calls;

const originalLocation = window.location;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

afterAll(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    configurable: true,
    writable: true,
  });
});

describe('api service', () => {
  it('calls get with the correct URL', async () => {
    await api.get('/test-endpoint');
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test-endpoint');
  });

  it('calls post with URL and data', async () => {
    const data = { key: 'value' };
    await api.post('/test-endpoint', data);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/test-endpoint', data);
  });

  it('calls put with URL and data', async () => {
    const data = { key: 'value' };
    await api.put('/test-endpoint', data);
    expect(mockAxiosInstance.put).toHaveBeenCalledWith('/test-endpoint', data);
  });

  it('calls delete with URL', async () => {
    await api.delete('/test-endpoint');
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/test-endpoint');
  });

  it('rejects with error response when API fails', async () => {
    const errorResponse = { response: { data: { message: 'Server error' } } };
    mockAxiosInstance.get.mockRejectedValue(errorResponse);
    await expect(api.get('/test-endpoint')).rejects.toEqual(errorResponse);
  });

  it('rejects with error message when no response', async () => {
    const networkError = new Error('Network Error');
    mockAxiosInstance.get.mockRejectedValue(networkError);
    await expect(api.get('/test-endpoint')).rejects.toThrow('Network Error');
  });
});

describe('axios instance configuration', () => {
  it('sets baseURL from environment or default', () => {
    expect(axiosCreateConfig.baseURL).toEqual(expect.any(String));
  });

  it('sets Content-Type to application/json', () => {
    expect(axiosCreateConfig.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('request interceptor', () => {
  it('adds Authorization header when token exists in localStorage', () => {
    const token = 'test-token-xyz';
    localStorage.setItem('token', token);
    const config = { headers: {} };
    const result = requestHandler(config);
    expect(result.headers.Authorization).toBe('Bearer ' + token);
  });

  it('does not add Authorization header when no token in localStorage', () => {
    const config = { headers: {} };
    const result = requestHandler(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('rejects the promise when request interceptor itself fails', async () => {
    const error = new Error('Request config error');
    await expect(requestErrorHandler(error)).rejects.toThrow('Request config error');
  });
});

describe('response interceptor', () => {
  describe('success handler', () => {
    it('returns the response object unchanged', () => {
      const response = { config: {}, data: { message: 'OK' }, status: 200 };
      const result = responseHandler(response);
      expect(result).toEqual(response);
    });

    it('sets must_change_password flag on login response when indicated', () => {
      const response = {
        config: { url: '/auth/login' },
        data: { data: { must_change_password: true } },
      };
      responseHandler(response);
      expect(localStorage.getItem('must_change_password')).toBe('true');
    });

    it('does not set must_change_password flag on non-login responses', () => {
      const response = {
        config: { url: '/banks' },
        data: { data: { must_change_password: true } },
      };
      responseHandler(response);
      expect(localStorage.getItem('must_change_password')).toBeNull();
    });
  });

  describe('error handler', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: '', pathname: '/dashboard' },
        configurable: true,
      });
    });

    it('clears auth data and redirects to /login on 401', async () => {
      localStorage.setItem('token', 'test-token');
      localStorage.setItem('user', 'test-user');
      const error = { response: { status: 401, data: {} } };

      await expect(responseErrorHandler(error)).rejects.toEqual(error);
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('does not redirect on 401 when already on /login page', async () => {
      window.location.pathname = '/login';
      localStorage.setItem('token', 'test-token');
      const error = { response: { status: 401, data: {} } };

      await expect(responseErrorHandler(error)).rejects.toEqual(error);
      expect(localStorage.getItem('token')).toBe('test-token');
    });

    it('rejects with the original error for non-401 status codes', async () => {
      const error = { response: { status: 500, data: { message: 'Server Error' } } };
      await expect(responseErrorHandler(error)).rejects.toEqual(error);
    });

    it('rejects with network error when error has no response', async () => {
      const error = new Error('Network Error');
      await expect(responseErrorHandler(error)).rejects.toThrow('Network Error');
    });
  });
});

describe('authAPI', () => {
  it('login calls api.post with credentials', () => {
    const credentials = { email: 'test@test.com', password: 'pass' };
    authAPI.login(credentials);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/login', credentials);
  });

  it('register calls api.post with userData', () => {
    const userData = { name: 'Test', email: 'test@test.com' };
    authAPI.register(userData);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/auth/register', userData);
  });

  it('getMe calls api.get', () => {
    authAPI.getMe();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
  });

  it('changePassword calls api.put with passwords', () => {
    const passwords = { currentPassword: 'old', newPassword: 'new' };
    authAPI.changePassword(passwords);
    expect(mockAxiosInstance.put).toHaveBeenCalledWith('/auth/change-password', passwords);
  });
});

describe('banksAPI', () => {
  it('getAll calls api.get', () => {
    banksAPI.getAll();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/banks');
  });

  it('getOne calls api.get with id', () => {
    banksAPI.getOne(1);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/banks/1');
  });

  it('create calls api.post with bankData', () => {
    const bankData = { name: 'BT', code: 'BT' };
    banksAPI.create(bankData);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/banks', bankData);
  });

  it('update calls api.put with id and bankData', () => {
    const bankData = { name: 'BIAT' };
    banksAPI.update(2, bankData);
    expect(mockAxiosInstance.put).toHaveBeenCalledWith('/banks/2', bankData);
  });

  it('delete calls api.delete with id', () => {
    banksAPI.delete(3);
    expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/banks/3');
  });

  it('getStats calls api.get with id', () => {
    banksAPI.getStats(1);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/banks/1/stats');
  });
});

describe('processingAPI', () => {
  it('processUrl calls api.post with data', () => {
    const data = { bankId: 1, url: 'https://example.com' };
    processingAPI.processUrl(data);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/processing/process-url', data);
  });

  it('uploadFile calls api.post with formData and content-type header', () => {
    const formData = new FormData();
    processingAPI.uploadFile(formData);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/processing/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  });

  it('getErrors calls api.get with fileLogId', () => {
    processingAPI.getErrors(42);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/processing/errors/42');
  });

  it('resolveError calls api.patch with errorId and correctedValue', () => {
    processingAPI.resolveError(10, 'corrected-value');
    expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/processing/errors/10/resolve', {
      correctedValue: 'corrected-value',
    });
  });

  it('getLogs calls api.get with params', () => {
    const params = { page: 1, limit: 10 };
    processingAPI.getLogs(params);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/processing/logs', { params });
  });

  it('downloadCorrected calls api.get with fileLogId and blob responseType', () => {
    processingAPI.downloadCorrected(42);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/processing/download/42', { responseType: 'blob' });
  });

  it('reprocess calls api.post with fileLogId', () => {
    processingAPI.reprocess(42);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/processing/reprocess/42');
  });

  it('validateManualEntries calls api.post with data', () => {
    const data = { entries: [] };
    processingAPI.validateManualEntries(data);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/processing/validate-manual', data);
  });

  it('processManualEntries calls api.post with data', () => {
    const data = { entries: [] };
    processingAPI.processManualEntries(data);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/processing/process-manual', data);
  });

  it('downloadTemplate calls api.get with blob responseType', () => {
    processingAPI.downloadTemplate();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/processing/template', { responseType: 'blob' });
  });

  it('callExternalApi calls api.post with data', () => {
    const data = { url: 'https://api.example.com', method: 'GET' };
    processingAPI.callExternalApi(data);
    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/processing/call-api', data);
  });
});

describe('dashboardAPI', () => {
  it('getStats calls api.get', () => {
    dashboardAPI.getStats();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/dashboard/stats');
  });

  it('getUnresolvedErrors calls api.get', () => {
    dashboardAPI.getUnresolvedErrors();
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/dashboard/errors/unresolved');
  });

  it('getRecentRecords calls api.get with limit param', () => {
    dashboardAPI.getRecentRecords(5);
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/dashboard/records/recent', { params: { limit: 5 } });
  });
});
