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
  Clock: () => null,
  Upload: () => null,
  Globe: () => null,
  Edit3: () => null,
  CheckCircle: () => null,
  XCircle: () => null,
  AlertTriangle: () => null,
  FileText: () => null,
  FileCode: () => null,
  Download: () => null,
  Eye: () => null,
  RefreshCw: () => null,
  Filter: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  Archive: () => null,
}));
jest.mock('../History.css', () => ({}));

const { useAuth } = require('../../contexts/AuthContext');

const historyData = [
  { id: 1, status: 'success', bank_code: 'BT', file_name: 'data.csv', source_type: 'upload', valid_rows: 90, total_rows: 100, processed_at: '2025-01-15T10:00:00Z', original_path: '/data/input/data.csv', destination_path: '/data/output/data.csv', xml_file_name: 'output.xml', xml_entries_count: 85, archive_path: '/data/archive/data.zip' },
];

const banksData = [
  { id: 1, code: 'BT', name: 'Banque de Tunisie' },
];

const statsData = { total: 100, upload_count: 50, url_count: 20, manual_count: 30, success_count: 80, error_count: 20 };

let History;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
  mockGet.mockImplementation((url) => {
    if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
    if (url.startsWith('/history/stats')) return Promise.resolve({ data: { data: statsData } });
    if (url.startsWith('/history')) return Promise.resolve({ data: { data: historyData, pagination: { total: 1 } } });
    return Promise.resolve({ data: { data: [] } });
  });
  History = require('../History').default;
});

describe('History', () => {
  it('shows loading state initially', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
  });

  it('renders title and stats cards', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Uploads')).toBeInTheDocument();
    expect(screen.getAllByText('URL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Manuel').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Succes').length).toBeGreaterThan(0);
    expect(screen.getByText('Erreurs')).toBeInTheDocument();
  });

  it('renders history table with data', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
    expect(screen.getByText('data.csv')).toBeInTheDocument();
    expect(screen.getByText('90/100')).toBeInTheDocument();
  });

  it('filters by source type', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Total'));
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
  });

  it('shows empty state when no history', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
      if (url.startsWith('/history/stats')) return Promise.resolve({ data: { data: statsData } });
      if (url.startsWith('/history')) return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Aucun historique trouve')).toBeInTheDocument(); });
  });

  it('filters by status and type dropdowns work', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
    expect(screen.getByText('Tous les types')).toBeInTheDocument();
    expect(screen.getByText('Tous les statuts')).toBeInTheDocument();
    expect(screen.getByText('Toutes les banques')).toBeInTheDocument();
    expect(screen.getByText('Reinitialiser')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/banks')) return Promise.reject(new Error('Network error'));
      if (url.startsWith('/history/stats')) return Promise.resolve({ data: { data: statsData } });
      if (url.startsWith('/history')) return Promise.resolve({ data: { data: historyData, pagination: { total: 1 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
  });

  it('shows correct number of stats cards for bank user', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });
    expect(screen.getByText('Total')).toBeInTheDocument();
  });
});
