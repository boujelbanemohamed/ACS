import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../Layout';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Outlet: () => <div data-testid="outlet">Content</div>,
}));

const mockLogout = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: {} } }) },
}));

const { useAuth } = require('../../contexts/AuthContext');

const defaultFeatures = {
  cron: false, monitoring: false, notifications: false,
  api_tester: false, permissions: false,
};

const baseAuth = {
  user: { username: 'admin', role: 'super_admin', bank_name: null },
  logout: mockLogout,
  mustChangePassword: false,
};

const renderLayout = (overrides = {}) => {
  useAuth.mockReturnValue({ ...baseAuth, ...overrides });
  const api = require('../../services/api').default;
  api.get.mockResolvedValue({ data: { data: defaultFeatures } });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Layout />
    </MemoryRouter>
  );
};

describe('Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue(baseAuth);
    const api = require('../../services/api').default;
    api.get.mockResolvedValue({ data: { data: defaultFeatures } });
  });

  it('renders sidebar with app title', () => {
    renderLayout();
    expect(screen.getByText('ACS Banking')).toBeInTheDocument();
    expect(screen.getByText('CSV Processor')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('shows all nav links for super_admin', () => {
    renderLayout();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Banques')).toBeInTheDocument();
    expect(screen.getByText('Traitement')).toBeInTheDocument();
    expect(screen.getByText('Enregistrements')).toBeInTheDocument();
    expect(screen.getByText('Historique')).toBeInTheDocument();
    expect(screen.getByText('Test API')).toBeInTheDocument();
    expect(screen.getByText("Journal d'activité")).toBeInTheDocument();
    expect(screen.getByText('Utilisateurs')).toBeInTheDocument();
    expect(screen.getByText('Scan Automatique')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
  });

  const withFeatures = (features) => {
    const api = require('../../services/api').default;
    api.get.mockResolvedValue({ data: { data: { ...defaultFeatures, ...features } } });
  };

  it('shows relevant links for bank_admin once its features are loaded', async () => {
    useAuth.mockReturnValue({ ...baseAuth, user: { username: 'ba', role: 'bank_admin', bank_name: 'BT' } });
    withFeatures({ banks: true, users: true });
    render(<MemoryRouter initialEntries={['/']}><Layout /></MemoryRouter>);

    expect(await screen.findByText('Banques')).toBeInTheDocument();
    expect(screen.getByText('Utilisateurs')).toBeInTheDocument();
    expect(screen.queryByText('Test API')).not.toBeInTheDocument();
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('shows Ma Banque for bank user', async () => {
    useAuth.mockReturnValue({ ...baseAuth, user: { username: 'bu', role: 'bank', bank_name: 'BT' } });
    withFeatures({ banks: true, users: true });
    render(<MemoryRouter initialEntries={['/']}><Layout /></MemoryRouter>);

    expect(await screen.findByText('Ma Banque')).toBeInTheDocument();
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument();
    expect(screen.queryByText('Permissions')).not.toBeInTheDocument();
  });

  it('hides restricted menus when the features cannot be loaded (deny by default)', async () => {
    useAuth.mockReturnValue({ ...baseAuth, user: { username: 'bu', role: 'bank', bank_name: 'BT' } });
    const api = require('../../services/api').default;
    api.get.mockRejectedValue(new Error('network'));
    render(<MemoryRouter initialEntries={['/']}><Layout /></MemoryRouter>);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/role-features/me'));
    expect(screen.queryByText('Ma Banque')).not.toBeInTheDocument();
    expect(screen.queryByText('Utilisateurs')).not.toBeInTheDocument();
  });

  it('renders user info in footer', () => {
    renderLayout({ user: { username: 'ba', role: 'bank_admin', bank_name: 'BIAT' } });
    expect(screen.getByText('ba')).toBeInTheDocument();
    expect(screen.getByText('BIAT')).toBeInTheDocument();
  });

  it('calls logout and navigates on logout click', () => {
    renderLayout();
    fireEvent.click(screen.getByText('Déconnexion'));
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('redirects to change-password when mustChangePassword is true', () => {
    useAuth.mockReturnValue({ ...baseAuth, mustChangePassword: true });
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/change-password', { replace: true });
  });
});
