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

beforeAll(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.open = jest.fn();
});

const { useAuth } = require('../../contexts/AuthContext');

const historyData = [
  { id: 1, status: 'success', bank_code: 'BT', file_name: 'data.csv', source_type: 'upload', valid_rows: 90, total_rows: 100, processed_at: '2025-01-15T10:00:00Z', original_path: '/data/input/data.csv', destination_path: '/data/output/data.csv', xml_file_name: 'output.xml', xml_entries_count: 85, archive_path: '/data/archive/data.zip' },
];

const detailHistoryData = [
  {
    id: 1, status: 'success', bank_code: 'BT', file_name: 'data.csv',
    source_type: 'upload', valid_rows: 90, total_rows: 100,
    invalid_rows: 5, duplicate_rows: 3,
    processed_at: '2025-01-15T10:00:00Z',
    original_path: '/data/input/data.csv',
    destination_path: '/data/output/data.csv',
    xml_file_name: 'output.xml', xml_entries_count: 85, xml_status: 'success',
    archive_path: '/data/archive/data.zip', archive_status: 'Archived',
    pending_errors: 2, resolved_errors: 1,
  },
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

  it('expands row details showing file paths, statuses, and step labels', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
      if (url.startsWith('/history/stats')) return Promise.resolve({ data: { data: statsData } });
      if (url.startsWith('/history')) return Promise.resolve({ data: { data: detailHistoryData, pagination: { total: 1 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('data.csv'));

    await waitFor(() => {
      expect(screen.getByText('1. Source')).toBeInTheDocument();
      expect(screen.getByText('2. Validation')).toBeInTheDocument();
      expect(screen.getByText('3. CSV')).toBeInTheDocument();
      expect(screen.getByText('4. XML')).toBeInTheDocument();
      expect(screen.getByText('5. Archive')).toBeInTheDocument();
    });

    expect(screen.getByText('/data/input/data.csv')).toBeInTheDocument();
    expect(screen.getByText('/data/output/data.csv')).toBeInTheDocument();
    expect(screen.getByText('output.xml')).toBeInTheDocument();
    expect(screen.getByText('/data/archive/data.zip')).toBeInTheDocument();
  });

  it('calls view file API when Voir button is clicked in expanded detail', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
      if (url.startsWith('/history/stats')) return Promise.resolve({ data: { data: statsData } });
      if (url.startsWith('/history')) return Promise.resolve({ data: { data: detailHistoryData, pagination: { total: 1 } } });
      if (url.startsWith('/records/file-content')) return Promise.resolve({ data: { data: [{ col: 'val' }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('data.csv'));

    await waitFor(() => { expect(screen.getByText('1. Source')).toBeInTheDocument(); });

    fireEvent.click(screen.getAllByText('Voir')[0]);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/records/file-content/byname', expect.objectContaining({
        params: expect.objectContaining({ fileName: 'data.csv', type: 'csv' }),
      }));
    });
  });

  it('calls download API when Telecharger button is clicked in expanded detail', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
      if (url.startsWith('/history/stats')) return Promise.resolve({ data: { data: statsData } });
      if (url.startsWith('/history')) return Promise.resolve({ data: { data: detailHistoryData, pagination: { total: 1 } } });
      if (url.startsWith('/records/file-content')) return Promise.resolve({ data: { data: [{ col: 'val' }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('data.csv'));

    await waitFor(() => { expect(screen.getByText('1. Source')).toBeInTheDocument(); });

    fireEvent.click(screen.getAllByText('Telecharger')[0]);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/records/file-content/byname', expect.objectContaining({
        params: expect.objectContaining({ fileName: 'data.csv', type: 'csv' }),
      }));
    });
  });

  it('calls API with date filters when date inputs change', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    const { container } = render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    const dateInputs = container.querySelectorAll('input[type="date"]');

    fireEvent.change(dateInputs[0], { target: { value: '2025-01-01' } });

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.dateFrom).toBe('2025-01-01');
    });

    fireEvent.change(dateInputs[1], { target: { value: '2025-01-31' } });

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.dateTo).toBe('2025-01-31');
    });
  });

  it('re-fetches history when filter dropdowns change', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.change(screen.getByDisplayValue('Tous les types'), { target: { value: 'upload' } });

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.sourceType).toBe('upload');
    });

    fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'success' } });

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.status).toBe('success');
    });
  });

  it('resets filters when Reinitialiser button is clicked', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.change(screen.getByDisplayValue('Tous les types'), { target: { value: 'upload' } });

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.sourceType).toBe('upload');
    });

    fireEvent.click(screen.getByText('Reinitialiser'));

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.sourceType).toBe('');
      expect(params.status).toBe('');
      expect(params.bankId).toBe('');
      expect(params.dateFrom).toBe('');
      expect(params.dateTo).toBe('');
    });
  });

  it('changes pagination offset when Suivant and Precedent are clicked', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
      if (url.startsWith('/history/stats')) return Promise.resolve({ data: { data: statsData } });
      if (url.startsWith('/history')) return Promise.resolve({ data: { data: historyData, pagination: { total: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Suivant'));

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.offset).toBe(20);
    });

    fireEvent.click(screen.getByText('Precedent'));

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.offset).toBe(0);
    });
  });

  it('filters by sourceType when Uploads stat card is clicked', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Uploads'));

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.sourceType).toBe('upload');
      expect(params.status).toBe('');
    });
  });

  it('removes filter when already-active stat card is clicked again', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><History /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des Traitements')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Uploads'));

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.sourceType).toBe('upload');
    });

    fireEvent.click(screen.getByText('Uploads'));

    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(call => call[0] === '/history');
      const params = calls[calls.length - 1][1].params;
      expect(params.sourceType).toBe('');
    });
  });
});
