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
  Download: () => null,
  Search: () => null,
  Filter: () => null,
  Trash2: () => null,
  FileText: () => null,
  FileCode: () => null,
  CheckCircle: () => null,
  XCircle: () => null,
  Clock: () => null,
  RefreshCw: () => null,
  X: () => null,
  Eye: () => null,
  Upload: () => null,
  AlertCircle: () => null,
  History: () => null,
}));
jest.mock('../Records.css', () => ({}));

const { useAuth } = require('../../contexts/AuthContext');

const recordsData = [
  { id: 1, bank_code: 'BT', first_name: 'Ahmed', last_name: 'BenAli', pan: '4000056655665556', expiry: '12/28', phone: '21699123456', language: 'fr', behaviour: 'otp', action: 'create', file_name: 'test.csv', processed_at: '2025-01-15T10:00:00Z', enrollment_status: 'success' },
];

const banksData = [
  { id: 1, code: 'BT', name: 'Banque de Tunisie' },
];

let Records;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
  mockGet.mockImplementation((url) => {
    if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
    if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
    if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
    if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
    if (url === '/enrollment/logs') return Promise.resolve({ data: { data: [] } });
    if (url === '/enrollment/stats') return Promise.resolve({ data: { data: { enrolled_success: 0, enrolled_error: 0, pending: 0 } } });
    return Promise.resolve({ data: { data: [] } });
  });
  Records = require('../Records').default;
});

describe('Records', () => {
  it('shows loading state initially', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
  });

  it('renders title and tabs for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(screen.getByText('Enregistrements CSV')).toBeInTheDocument();
    expect(screen.getByText('Fichiers XML')).toBeInTheDocument();
    expect(screen.getByText('Rapport Enrolement')).toBeInTheDocument();
  });

  it('hides enrollment tab for bank user', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(screen.getByText('Enregistrements CSV')).toBeInTheDocument();
    expect(screen.queryByText('Rapport Enrolement')).not.toBeInTheDocument();
  });

  it('shows loading and then data in CSV tab', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(screen.getByText('Ahmed')).toBeInTheDocument();
    expect(screen.getByText('BenAli')).toBeInTheDocument();
    expect(screen.getByText('test.csv')).toBeInTheDocument();
  });

  it('switches to XML tab', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getAllByText('Succes').length).toBeGreaterThan(0); });
    expect(screen.getByText('Aucun fichier XML genere')).toBeInTheDocument();
  });

  it('shows empty state in CSV tab', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Aucun enregistrement trouve')).toBeInTheDocument(); });
  });

  it('shows API error gracefully', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.reject(new Error('Network error'));
      if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(screen.queryByText('Chargement...')).not.toBeInTheDocument();
  });

  it('renders filter elements', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(screen.getByPlaceholderText('Rechercher (nom, PAN, telephone)...')).toBeInTheDocument();
    expect(screen.getByText('Toutes les banques')).toBeInTheDocument();
    expect(screen.getByText('Actualiser')).toBeInTheDocument();
  });
});
