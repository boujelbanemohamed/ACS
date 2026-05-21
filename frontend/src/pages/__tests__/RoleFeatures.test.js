import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), put: (...args) => mockPut(...args), delete: (...args) => mockDelete(...args) },
}));

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const { useAuth } = require('../../contexts/AuthContext');

const defaultFeatures = {
  roles: { bank_admin: { dashboard: true, banks: true, users: true, permissions: true }, bank: { dashboard: true, banks: true } },
};

const banksData = [
  { id: 1, name: 'BT', code: 'BT', is_active: true },
  { id: 2, name: 'BIAT', code: 'BIAT', is_active: true },
];

let RoleFeaturesPage;
beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation((url) => {
    if (url === '/role-features/banks') return Promise.resolve({ data: { data: banksData } });
    if (url === '/role-features') return Promise.resolve({ data: { data: defaultFeatures } });
    if (url.includes('/role-features/bank/')) return Promise.resolve({ data: { data: {} } });
    if (url.includes('/role-features/user/')) return Promise.resolve({ data: { data: {} } });
    if (url.includes('/role-features/users')) return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: {} } });
  });
  RoleFeaturesPage = require('../RoleFeatures').default;
});

describe('RoleFeatures', () => {
  it('renders permission page for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Permissions')).toBeInTheDocument(); });
    expect(screen.getByText('Par Rôle')).toBeInTheDocument();
    expect(screen.getByText('Par Banque')).toBeInTheDocument();
    expect(screen.getByText('Par Utilisateur')).toBeInTheDocument();
  });

  it('shows only banks/users tabs for bank_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin', bank_id: 1 } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Permissions')).toBeInTheDocument(); });
    expect(screen.queryByText('Par Rôle')).not.toBeInTheDocument();
    expect(screen.getByText('Par Banque')).toBeInTheDocument();
    expect(screen.getByText('Par Utilisateur')).toBeInTheDocument();
  });

  it('shows features table in roles tab', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Dashboard')).toBeInTheDocument(); });
    expect(screen.getByText('Permissions')).toBeInTheDocument();
  });

  it('switches to banks tab and shows bank options', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Banque'));
    await waitFor(() => {
      expect(screen.getByText(/BT.*BT/)).toBeInTheDocument();
    });
  });

  it('renders for bank_admin without error', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin', bank_id: 1 } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Permissions')).toBeInTheDocument(); });
  });
});
