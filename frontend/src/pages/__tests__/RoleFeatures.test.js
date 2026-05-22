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
jest.mock('lucide-react', () => ({
  Shield: () => null, Check: () => null, X: () => null, RefreshCw: () => null,
  Building2: () => null, Users: () => null, AlertCircle: () => null, Info: () => null,
}));

const { useAuth } = require('../../contexts/AuthContext');

const defaultFeatures = {
  roles: { bank_admin: { dashboard: true, banks: true, users: true, permissions: true }, bank: { dashboard: true, banks: true } },
};

const banksData = [
  { id: 1, name: 'BT', code: 'BT', is_active: true },
  { id: 2, name: 'BIAT', code: 'BIAT', is_active: true },
];

const usersData = [
  { id: 1, username: 'user1', role: 'bank', bank_name: 'BT' },
  { id: 2, username: 'user2', role: 'bank', bank_name: 'BIAT' },
];

let RoleFeaturesPage;
beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation((url) => {
    if (url === '/role-features/banks') return Promise.resolve({ data: { data: banksData } });
    if (url === '/role-features') return Promise.resolve({ data: { data: defaultFeatures } });
    if (url.includes('/role-features/bank/')) return Promise.resolve({ data: { data: {} } });
    if (url.includes('/role-features/user/')) return Promise.resolve({ data: { data: {} } });
    if (url.includes('/role-features/users')) return Promise.resolve({ data: { data: usersData } });
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

  it('shows features table in roles tab for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Dashboard')).toBeInTheDocument(); });
    expect(screen.getByText('Permissions')).toBeInTheDocument();
  });

  it('switches to banks tab and shows bank select', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Banque'));
    await waitFor(() => {
      expect(screen.getByText(/Sélectionnez une banque/)).toBeInTheDocument();
    });
  });

  it('shows feature toggles when bank selected', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Banque'));
    await waitFor(() => { expect(screen.getByText(/Sélectionnez une banque/)).toBeInTheDocument(); });
    const select = document.querySelector('select');
    if (select) {
      fireEvent.change(select, { target: { value: '1' } });
    }
    await waitFor(() => {
      expect(screen.getByText('Default Rôle')).toBeInTheDocument();
      expect(screen.getByText('Surcharge Banque')).toBeInTheDocument();
    });
  });

  it('renders for bank_admin without error', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin', bank_id: 1 } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Permissions')).toBeInTheDocument(); });
  });

  it('shows bank name for bank_admin in banks tab', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin', bank_id: 1 } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Banque'));
    await waitFor(() => { expect(screen.getByText('BT')).toBeInTheDocument(); });
  });

  it('switches to users tab', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Utilisateur')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Utilisateur'));
    await waitFor(() => {
      expect(screen.getByText(/Sélectionnez.*utilisateur/)).toBeInTheDocument();
    });
  });

  it('selects a bank in users tab and loads users', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Utilisateur')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Utilisateur'));
    await waitFor(() => { expect(screen.getByText(/Toutes les banques/)).toBeInTheDocument(); });
    const selects = document.querySelectorAll('select');
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: '1' } });
    }
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/role-features/users?bankId=1');
    });
  });

  it('toggles role feature on/off', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Permissions')).toBeInTheDocument(); });
    const toggleBtn = document.querySelector('.feature-toggle');
    if (toggleBtn) {
      fireEvent.click(toggleBtn);
    }
    await waitFor(() => { expect(mockPut).toHaveBeenCalled(); });
  });

  it('toggles bank feature override on', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Banque'));
    await waitFor(() => { expect(screen.getByText(/Sélectionnez une banque/)).toBeInTheDocument(); });
    const select = document.querySelector('select');
    if (select) fireEvent.change(select, { target: { value: '1' } });
    await waitFor(() => { expect(screen.getByText('Default Rôle')).toBeInTheDocument(); });
    const toggles = document.querySelectorAll('.feature-toggle');
    if (toggles.length > 0) {
      fireEvent.click(toggles[0]);
    }
    await waitFor(() => { expect(mockPut).toHaveBeenCalled(); });
  });

  it('deletes bank override when toggling an active override', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/role-features/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/role-features') return Promise.resolve({ data: { data: defaultFeatures } });
      if (url.includes('/role-features/bank/')) return Promise.resolve({ data: { data: { dashboard: true } } });
      if (url.includes('/role-features/user/')) return Promise.resolve({ data: { data: {} } });
      if (url.includes('/role-features/users')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: {} } });
    });
    mockDelete.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Par Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Par Banque'));
    await waitFor(() => { expect(screen.getByText(/Sélectionnez une banque/)).toBeInTheDocument(); });
    const select = document.querySelector('select');
    if (select) fireEvent.change(select, { target: { value: '1' } });
    await waitFor(() => { expect(screen.getByText('Default Rôle')).toBeInTheDocument(); });
    const toggles = document.querySelectorAll('.feature-toggle');
    if (toggles.length > 0) {
      fireEvent.click(toggles[0]);
    }
    await waitFor(() => { expect(mockDelete).toHaveBeenCalled(); });
  });

  it('handles fetch error gracefully', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/role-features/banks') return Promise.reject(new Error('Erreur de chargement'));
      return Promise.resolve({ data: { data: {} } });
    });
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Erreur de chargement')).toBeInTheDocument();
    });
  });

  it('handles 403 forbidden error', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/role-features/banks') return Promise.reject({ response: { status: 403 } });
      return Promise.resolve({ data: { data: {} } });
    });
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Accès refusé.')).toBeInTheDocument();
    });
  });

  it('dismisses error banner', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/role-features/banks') return Promise.reject(new Error('Erreur de chargement'));
      return Promise.resolve({ data: { data: {} } });
    });
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Erreur de chargement')).toBeInTheDocument(); });
    const dismissBtn = document.querySelector('.dismiss-btn');
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
    }
    await waitFor(() => {
      expect(screen.queryByText('Erreur de chargement')).not.toBeInTheDocument();
    });
  });

  it('shows loading state initially', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><RoleFeaturesPage /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });
});
