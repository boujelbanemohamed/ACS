import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), post: (...args) => mockPost(...args), put: (...args) => mockPut(...args), delete: (...args) => mockDelete(...args) },
}));

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('lucide-react', () => ({
  Activity: () => null,
  RefreshCw: () => null,
  Filter: () => null,
  Search: () => null,
  Download: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
}));
jest.mock('../AuditLogs.css', () => ({}));

const { useAuth } = require('../../contexts/AuthContext');

const auditLogsData = [
  { id: 1, action: 'LOGIN_SUCCESS', username: 'admin', user_role: 'super_admin', bank_name: null, ip_address: '127.0.0.1', created_at: '2025-01-15T10:00:00Z', new_data: null },
  { id: 2, action: 'UPDATE_USER', username: 'user1', user_role: 'bank', bank_name: 'BT', ip_address: '192.168.1.1', created_at: '2025-01-15T11:00:00Z', new_data: '{"key":"value"}' },
];

const actionsData = ['LOGIN_SUCCESS', 'UPDATE_USER', 'LOGIN_FAILED'];

let AuditLogs;
beforeEach(() => {
  jest.clearAllMocks();
  AuditLogs = require('../AuditLogs').default;
});

describe('AuditLogs', () => {
  it('shows loading state for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/audit-logs/actions') return Promise.resolve({ data: { data: actionsData } });
      if (url === '/audit-logs') return Promise.resolve({ data: { data: auditLogsData, total: 2 } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByText('Journal d\'activité')).toBeInTheDocument(); });
  });

  it('renders title and filters for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/audit-logs/actions') return Promise.resolve({ data: { data: actionsData } });
      if (url === '/audit-logs') return Promise.resolve({ data: { data: auditLogsData, total: 2 } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Journal d\'activité')).toBeInTheDocument(); });
    expect(screen.getByText('Actualiser')).toBeInTheDocument();
    expect(screen.getByText('Filtrer')).toBeInTheDocument();
    expect(screen.getByText('Réinitialiser')).toBeInTheDocument();
  });

  it('renders audit log entries', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/audit-logs/actions') return Promise.resolve({ data: { data: actionsData } });
      if (url === '/audit-logs') return Promise.resolve({ data: { data: auditLogsData, total: 2 } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Journal d\'activité')).toBeInTheDocument(); });
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('user1')).toBeInTheDocument();
    expect(screen.getAllByText('Connexion réussie').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Modification utilisateur').length).toBeGreaterThan(0);
  });

  it('shows empty state when no logs', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/audit-logs/actions') return Promise.resolve({ data: { data: actionsData } });
      if (url === '/audit-logs') return Promise.resolve({ data: { data: [], total: 0 } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Aucune activité enregistrée')).toBeInTheDocument(); });
  });

  it('shows access denied for bank user (no filter section)', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank' } });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Journal d\'activité')).toBeInTheDocument(); });
    expect(screen.queryByText('Filtrer')).not.toBeInTheDocument();
  });

  it('handles filter button click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/audit-logs/actions') return Promise.resolve({ data: { data: actionsData } });
      if (url === '/audit-logs') return Promise.resolve({ data: { data: auditLogsData, total: 2 } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Journal d\'activité')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Filtrer'));
    await waitFor(() => { expect(mockGet).toHaveBeenCalledWith('/audit-logs', expect.any(Object)); });
  });

  it('displays filter select options', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/audit-logs/actions') return Promise.resolve({ data: { data: actionsData } });
      if (url === '/audit-logs') return Promise.resolve({ data: { data: auditLogsData, total: 2 } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Journal d\'activité')).toBeInTheDocument(); });
    expect(screen.getByText('Toutes les actions')).toBeInTheDocument();
    expect(screen.getByText('Tous les profils')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nom d\'utilisateur...')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/audit-logs/actions') return Promise.reject(new Error('Network error'));
      if (url === '/audit-logs') return Promise.reject(new Error('Network error'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><AuditLogs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Journal d\'activité')).toBeInTheDocument(); });
    expect(screen.getByText('Aucune activité enregistrée')).toBeInTheDocument();
  });
});
