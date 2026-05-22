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

beforeEach(() => {
  jest.clearAllMocks();
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
