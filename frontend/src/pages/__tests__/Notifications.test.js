import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Notifications from '../Notifications';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockGet = jest.fn().mockImplementation((url) => {
  if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
  if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
  if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
  if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
  return Promise.resolve({ data: { data: [] } });
});

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
    put: jest.fn().mockResolvedValue({ data: { success: true } }),
    post: jest.fn().mockResolvedValue({ data: { success: true } }),
    delete: jest.fn().mockResolvedValue({}),
  },
}));

const { useAuth } = require('../../contexts/AuthContext');

describe('Notifications', () => {
  beforeEach(() => {
    useAuth.mockClear();
    mockGet.mockClear();
  });

  it('shows access denied for non super_admin', () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    expect(screen.getByText('Acces refuse')).toBeInTheDocument();
  });

  it('renders the full page for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Configuration SMTP/).length).toBeGreaterThan(0);
    expect(screen.getByText('Historique des envois')).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation(() => new Promise(() => {}));
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });
});
