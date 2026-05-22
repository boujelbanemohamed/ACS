const mockAxiosInstance = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
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
