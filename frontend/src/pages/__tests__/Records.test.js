import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    put: (...args) => mockPut(...args),
    delete: (...args) => mockDelete(...args),
    defaults: { baseURL: 'http://localhost:5000' },
  },
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

const xmlLogsData = [
  { id: 1, status: 'success', bank_code: 'BT', xml_file_name: 'output.xml', source_file_name: 'source.csv', records_count: 10, xml_entries_count: 10, created_at: '2025-01-15T10:00:00Z', processed_at: '2025-01-15T10:05:00Z', error_message: null },
];

const csvFileContent = [
  { firstName: 'Ahmed', lastName: 'BenAli', pan: '4000056655665556', status: 'success' },
];

let Records;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
  mockGet.mockImplementation((url) => {
    if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
    if (url && url.startsWith('/records/history/')) return Promise.resolve({ data: { data: { summary: { totalAttempts: 3, currentStatus: 'SUCCESS', firstAttempt: '2025-01-01T10:00:00Z', lastAttempt: '2025-01-15T10:00:00Z' }, attempts: [{ id: 1, attempt_number: 1, status: 'SUCCESS', processed_at: '2025-01-15T10:00:00Z', source_type: 'upload', username: 'admin', data_received: null, details: [] }] } } });
    if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
    if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
    if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
    if (url === '/records/file-content/byname') return Promise.resolve({ data: { data: csvFileContent } });
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
    expect(screen.getAllByText('test.csv')[0]).toBeInTheDocument();
  });

  it('switches to XML tab', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getAllByText('Succes').length).toBeGreaterThan(0); });
    expect(screen.queryByText('Aucun fichier XML genere')).not.toBeInTheDocument();
    expect(screen.getByText('output.xml')).toBeInTheDocument();
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
    expect(screen.getByText('Aucun enregistrement trouve')).toBeInTheDocument();
  });

  it('renders filter elements', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(screen.getByPlaceholderText('Rechercher (nom, PAN, telephone)...')).toBeInTheDocument();
    expect(screen.getByText('Toutes les banques')).toBeInTheDocument();
    expect(screen.getByText('Actualiser')).toBeInTheDocument();
  });

  it('renders CSV tab data columns for file preview modal', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('test.csv')[0]);
    await waitFor(() => { expect(screen.getByText('Telecharger')).toBeInTheDocument(); });
    expect(screen.getByText('firstName')).toBeInTheDocument();
    expect(screen.getByText('lastName')).toBeInTheDocument();
    expect(screen.getByText('pan')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
  });

  it('renders XML stats cards with correct values', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('Entrees XML')).toBeInTheDocument(); });
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders enrollment upload section for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('Importer un rapport d enrolement')).toBeInTheDocument(); });
    expect(screen.getByText('Choisir un fichier XML')).toBeInTheDocument();
    expect(screen.getByText('Importer et traiter')).toBeInTheDocument();
  });

  it('opens file preview modal on file name click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('test.csv')[0]);
    await waitFor(() => { expect(screen.getByText('Telecharger')).toBeInTheDocument(); });
    expect(screen.getAllByText('test.csv').length).toBeGreaterThanOrEqual(2);
  });

  it('closes file preview modal on overlay click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    const { container } = render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('test.csv')[0]);
    await waitFor(() => { expect(screen.getByText('Telecharger')).toBeInTheDocument(); });
    const overlay = container.querySelector('.modal-overlay');
    fireEvent.click(overlay);
    await waitFor(() => { expect(screen.queryByText('Telecharger')).not.toBeInTheDocument(); });
  });

  it('triggers Blob creation on file download', async () => {
    const mockCreateObjectURL = jest.fn(() => 'blob:mock');
    const mockRevokeObjectURL = jest.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('test.csv')[0]);
    await waitFor(() => { expect(screen.getByText('Telecharger')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Telecharger'));
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('deletes record with confirmation dialog', async () => {
    window.confirm = jest.fn(() => true);
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const deleteButtons = screen.getAllByTitle('Supprimer');
    fireEvent.click(deleteButtons[0]);
    expect(window.confirm).toHaveBeenCalledWith('Etes-vous sur de vouloir supprimer cet enregistrement ?');
    await waitFor(() => { expect(mockDelete).toHaveBeenCalledWith('/records/1'); });
  });

  it('skips delete when confirmation is cancelled', async () => {
    window.confirm = jest.fn(() => false);
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const deleteButtons = screen.getAllByTitle('Supprimer');
    fireEvent.click(deleteButtons[0]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('opens PAN history modal on PAN click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet
      .mockImplementationOnce(() => Promise.resolve({ data: { data: banksData } }))
      .mockImplementationOnce(() => Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } }));
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const panCell = screen.getByText('4000056655665556');
    fireEvent.click(panCell);
    await waitFor(() => { expect(screen.getByText('Historique du PAN 4000056655665556')).toBeInTheDocument(); });
  });

  it('shows Precedent and Suivant pagination buttons', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 100 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(screen.getByText('Precedent')).toBeDisabled();
    expect(screen.getByText('Suivant')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Suivant'));
    await waitFor(() => { expect(screen.getByText('Precedent')).not.toBeDisabled(); });
    fireEvent.click(screen.getByText('Precedent'));
    await waitFor(() => { expect(screen.getByText('Precedent')).toBeDisabled(); });
  });

  it('triggers re-fetch on search input', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const recordsCallsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    const searchInput = screen.getByPlaceholderText('Rechercher (nom, PAN, telephone)...');
    fireEvent.change(searchInput, { target: { value: 'Ahmed' } });
    await waitFor(() => {
      expect(mockGet.mock.calls.filter(c => c[0] === '/records').length).toBe(recordsCallsBefore + 1);
    });
  });

  it('triggers window.open on CSV export', async () => {
    window.open = jest.fn();
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Exporter CSV'));
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('/records/export/csv'), '_blank');
  });

  it('handles enrollment upload and displays result', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockPost.mockResolvedValue({
      data: {
        success: true,
        message: 'Traitement reussi',
        totalRecords: 100,
        successCount: 95,
        errorCount: 5,
        updatedRecords: 50,
        errorDetails: [],
        notFoundIds: [],
      },
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('Importer un rapport d enrolement')).toBeInTheDocument(); });
    const fileInput = screen.getByLabelText('Choisir un fichier XML');
    fireEvent.change(fileInput, { target: { files: [new File(['<xml/>'], 'rapport.xml', { type: 'text/xml' })] } });
    fireEvent.click(screen.getByText('Importer et traiter'));
    await waitFor(() => { expect(mockPost).toHaveBeenCalled(); });
    await waitFor(() => { expect(screen.getByText(/Traitement reussi/)).toBeInTheDocument(); });
    expect(screen.getByText(/Total: 100/)).toBeInTheDocument();
  });

  it('displays error notification on upload failure', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockPost.mockRejectedValue({
      response: { data: { message: 'Echec du traitement' } },
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('Importer un rapport d enrolement')).toBeInTheDocument(); });
    const fileInput = screen.getByLabelText('Choisir un fichier XML');
    fireEvent.change(fileInput, { target: { files: [new File(['<xml/>'], 'bad.xml', { type: 'text/xml' })] } });
    fireEvent.click(screen.getByText('Importer et traiter'));
    await waitFor(() => { expect(screen.getByText('Echec du traitement')).toBeInTheDocument(); });
  });

  it('handles banks fetch error with console.error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.reject(new Error('API error'));
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching banks:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('handles enrollment data fetch error with console.error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
      if (url === '/enrollment/logs') return Promise.reject(new Error('Enrollment error'));
      if (url === '/enrollment/stats') return Promise.reject(new Error('Enrollment error'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(consoleSpy).toHaveBeenCalledWith('Error fetching enrollment data:', expect.any(Error)); });
    consoleSpy.mockRestore();
  });

  it('shows alert when history fetch fails', async () => {
    window.alert = jest.fn();
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url && url.startsWith('/records/history/')) return Promise.reject(new Error('History error'));
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('4000056655665556'));
    await waitFor(() => { expect(window.alert).toHaveBeenCalledWith('Erreur lors du chargement de l\'historique'); });
  });

  it('handles XML logs fetch error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.reject(new Error('XML error'));
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('Aucun fichier XML genere')).toBeInTheDocument(); });
    expect(consoleSpy).toHaveBeenCalledWith('Error fetching XML logs:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('handles XML stats fetch error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.reject(new Error('Stats error'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(consoleSpy).toHaveBeenCalledWith('Error fetching XML stats:', expect.any(Error)); });
    consoleSpy.mockRestore();
  });

  it('shows alert when export fails', async () => {
    window.alert = jest.fn();
    window.open = jest.fn(() => { throw new Error('Export error'); });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Exporter CSV'));
    await waitFor(() => { expect(window.alert).toHaveBeenCalledWith('Erreur lors de l\'export'); });
  });

  it('shows alert when delete fails', async () => {
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
    mockDelete.mockRejectedValue(new Error('Delete error'));
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByTitle('Supprimer')[0]);
    await waitFor(() => { expect(window.alert).toHaveBeenCalledWith('Erreur lors de la suppression'); });
  });

  it('renders history with different attempt statuses and source types', async () => {
    const historyData = {
      summary: { totalAttempts: 4, currentStatus: 'PARTIAL', firstAttempt: '2025-01-01T10:00:00Z', lastAttempt: '2025-01-15T10:00:00Z' },
      attempts: [
        { id: 1, attempt_number: 1, status: 'SUCCESS', processed_at: '2025-01-15T10:00:00Z', source_type: 'upload', username: 'admin', data_received: null, details: [] },
        { id: 2, attempt_number: 2, status: 'REJECTED', processed_at: '2025-01-16T10:00:00Z', source_type: 'manual', username: 'user1', data_received: null, details: [] },
        { id: 3, attempt_number: 3, status: 'PARTIAL', processed_at: '2025-01-17T10:00:00Z', source_type: 'correction', username: 'user2', data_received: null, details: [] },
        { id: 4, attempt_number: 4, status: 'OTHER', processed_at: '2025-01-18T10:00:00Z', source_type: 'api', username: 'user3', data_received: null, details: [] },
      ],
    };
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url && url.startsWith('/records/history/')) return Promise.resolve({ data: { data: historyData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('4000056655665556'));
    await waitFor(() => { expect(screen.getByText(/Historique du PAN/)).toBeInTheDocument(); });
    expect(screen.getByText('Rejeté')).toBeInTheDocument();
    expect(screen.getByText('Saisie manuelle')).toBeInTheDocument();
    expect(screen.getByText('Correction')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('OTHER')).toBeInTheDocument();
  });

  it('renders XML table with various statuses', async () => {
    const variedXmlLogs = [
      { id: 1, status: 'success', bank_code: 'BT', xml_file_name: 'a.xml', source_file_name: 's.csv', records_count: 10, xml_entries_count: 10, created_at: '2025-01-15T10:00:00Z', processed_at: '2025-01-15T10:05:00Z', error_message: null },
      { id: 2, status: 'error', bank_code: 'ATB', xml_file_name: 'b.xml', source_file_name: null, records_count: 5, xml_entries_count: 3, created_at: '2025-01-16T10:00:00Z', processed_at: null, error_message: 'Processing error' },
      { id: 3, status: 'pending', bank_code: 'BH', xml_file_name: 'c.xml', source_file_name: 's2.csv', records_count: 8, xml_entries_count: 8, created_at: '2025-01-17T10:00:00Z', processed_at: '2025-01-17T10:05:00Z', error_message: null },
      { id: 4, status: 'unknown', bank_code: 'UBC', xml_file_name: 'd.xml', source_file_name: 's3.csv', records_count: 3, xml_entries_count: 3, created_at: '2025-01-18T10:00:00Z', processed_at: '2025-01-18T10:05:00Z', error_message: 'Error msg' },
    ];
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: variedXmlLogs, pagination: { total: 4 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 4, success_count: 1, error_count: 1, pending_count: 1, total_entries: 24 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getAllByText('En attente').length).toBeGreaterThan(0); });
    expect(screen.getByText(/Processing error/)).toBeInTheDocument();
    expect(screen.getByText(/Error msg/)).toBeInTheDocument();
  });

  it('shows error when file content fetch fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      if (url === '/records/file-content/byname') return Promise.reject({ response: { data: { message: 'Fichier introuvable' } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('test.csv')[0]);
    await waitFor(() => { expect(screen.getByText('Fichier introuvable')).toBeInTheDocument(); });
  });

  it('downloads XML file from preview', async () => {
    const mockCreateObjectURL = jest.fn(() => 'blob:mock');
    window.URL.createObjectURL = mockCreateObjectURL;
    HTMLAnchorElement.prototype.click = jest.fn();
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      if (url === '/records/file-content/byname') return Promise.resolve({ data: { data: '<xml>content</xml>' } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('output.xml')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('output.xml')[0]);
    await waitFor(() => { expect(screen.getByText('Telecharger')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Telecharger'));
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('fetches XML logs with bankId for bank user', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => {
      const logCalls = mockGet.mock.calls.filter(c => c[0] === '/xml-logs');
      expect(logCalls.length).toBeGreaterThan(0);
      expect(logCalls[logCalls.length - 1][1].params.bankId).toBe('1');
    });
    await waitFor(() => {
      const statsCalls = mockGet.mock.calls.filter(c => c[0] && c[0].startsWith('/xml-logs/stats/summary'));
      expect(statsCalls.length).toBeGreaterThan(0);
    });
  });

  it('sorts records by column header click', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    fireEvent.click(screen.getByText('Nom'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/records');
      expect(calls.length).toBe(callsBefore + 1);
      expect(calls[calls.length - 1][1].params.sortBy).toBe('last_name');
      expect(calls[calls.length - 1][1].params.sortOrder).toBe('ASC');
    });
  });

  it('paginates XML logs', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 100 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 100, success_count: 50, error_count: 30, pending_count: 20, total_entries: 500 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('Suivant')).not.toBeDisabled(); });
    expect(screen.getByText('Precedent')).toBeDisabled();
    fireEvent.click(screen.getByText('Suivant'));
    await waitFor(() => { expect(screen.getByText('Precedent')).not.toBeDisabled(); });
    fireEvent.click(screen.getByText('Precedent'));
    await waitFor(() => { expect(screen.getByText('Precedent')).toBeDisabled(); });
  });

  it('filters by bank in CSV tab', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    fireEvent.change(screen.getByDisplayValue('Toutes les banques'), { target: { value: '1' } });
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/records');
      expect(calls.length).toBe(callsBefore + 1);
    });
  });

  it('filters XML by status', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('Tous les statuts')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/xml-logs').length;
    fireEvent.change(screen.getByDisplayValue('Tous les statuts'), { target: { value: 'error' } });
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/xml-logs');
      expect(calls.length).toBe(callsBefore + 1);
    });
  });

  it('opens enrollment detail modal with errors and not found IDs', async () => {
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    HTMLAnchorElement.prototype.click = jest.fn();
    const enrollmentLogsWithDetails = [{
      id: 1, file_name: 'enrolment.xml', processed_at: '2025-01-15T10:00:00Z', bank_code: 'BT', bank_name: 'Banque de Tunisie', total_records: 100, success_count: 90, error_count: 5,
      not_found_ids: '["NF1","NF2","NF3"]',
      error_details: '[{"xmlId":"X1","errorCode":"ERR01","errorDescription":"Invalid data"}]',
    }];
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
      if (url === '/enrollment/logs') return Promise.resolve({ data: { data: enrollmentLogsWithDetails } });
      if (url === '/enrollment/stats') return Promise.resolve({ data: { data: { enrolled_success: 5, enrolled_error: 5, pending: 0 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('enrolment.xml')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Voir'));
    await waitFor(() => { expect(screen.getByText(/Rapport d'Import/)).toBeInTheDocument(); });
    expect(screen.getByText('Invalid data')).toBeInTheDocument();
    expect(screen.getByText(/NF1/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Telecharger CSV'));
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('displays enrollment result with error details and not found IDs', async () => {
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    HTMLAnchorElement.prototype.click = jest.fn();
    mockPost.mockResolvedValue({
      data: {
        success: true,
        message: 'Reussi',
        totalRecords: 100,
        successCount: 90,
        errorCount: 10,
        updatedRecords: 50,
        errorDetails: [{ xmlId: 'E1', errorCode: 'ERR', errorDescription: 'Bad data' }],
        notFoundIds: ['NF1', 'NF2'],
      },
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('Importer un rapport d enrolement')).toBeInTheDocument(); });
    const fileInput = screen.getByLabelText('Choisir un fichier XML');
    fireEvent.change(fileInput, { target: { files: [new File(['<xml/>'], 'r.xml', { type: 'text/xml' })] } });
    fireEvent.click(screen.getByText('Importer et traiter'));
    await waitFor(() => { expect(screen.getByText(/Details des erreurs/)).toBeInTheDocument(); });
    expect(screen.getByText(/IDs non trouves dans l application/)).toBeInTheDocument();
    expect(screen.getByText(/NF1/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Telecharger CSV')[0]);
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('renders history with data received and validation details', async () => {
    const historyWithDetails = {
      summary: { totalAttempts: 1, currentStatus: 'SUCCESS', firstAttempt: '2025-01-15T10:00:00Z', lastAttempt: '2025-01-15T10:00:00Z' },
      attempts: [{
        id: 1, attempt_number: 1, status: 'SUCCESS', processed_at: '2025-01-15T10:00:00Z', source_type: 'cron', username: 'admin', file_name: 'f.csv', xml_id: 'XML001',
        data_received: { firstName: 'Ahmed', lastName: 'BenAli', pan: '4000056655665556', rowNumber: 1 },
        details: [
          { field_name: 'pan', field_value: '4000056655665556', is_valid: true, error_message: null },
          { field_name: 'phone', field_value: '', is_valid: false, error_message: 'Numero invalide' },
        ],
      }],
    };
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url && url.startsWith('/records/history/')) return Promise.resolve({ data: { data: historyWithDetails } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('4000056655665556'));
    await waitFor(() => { expect(screen.getByText('Données reçues')).toBeInTheDocument(); });
    expect(screen.getByText('Validation des champs')).toBeInTheDocument();
    expect(screen.getByText('XML001')).toBeInTheDocument();
    expect(screen.getByText('Numero invalide')).toBeInTheDocument();
    expect(screen.queryByText('rowNumber')).not.toBeInTheDocument();
  });

  it('shows history loading state then resolves', async () => {
    let resolveHistory;
    const historyPromise = new Promise((resolve) => { resolveHistory = resolve; });
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url && url.startsWith('/records/history/')) return historyPromise;
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('4000056655665556'));
    expect(screen.getByText("Chargement de l'historique...")).toBeInTheDocument();
    resolveHistory({ data: { data: { summary: { totalAttempts: 0 }, attempts: [] } } });
    await waitFor(() => { expect(screen.getByText('Aucun historique disponible')).toBeInTheDocument(); });
  });

  it('clicks CSV tab from XML tab', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('Suivant')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Enregistrements CSV'));
    await waitFor(() => { expect(screen.getByText('Exporter CSV')).toBeInTheDocument(); });
  });

  it('changes bank filter in XML tab', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('Tous les statuts')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/xml-logs').length;
    fireEvent.change(screen.getByDisplayValue('Toutes les banques'), { target: { value: '1' } });
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/xml-logs');
      expect(calls.length).toBe(callsBefore + 1);
    });
  });

  it('clicks refresh in XML tab', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('Suivant')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/xml-logs').length;
    fireEvent.click(screen.getByText('Actualiser'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/xml-logs');
      expect(calls.length).toBe(callsBefore + 1);
    });
  });

  it('clicks Reinitialiser in enrollment tab', async () => {
    mockPost.mockResolvedValue({ data: { success: true, message: 'OK', totalRecords: 1, successCount: 1, errorCount: 0, updatedRecords: 0, errorDetails: [], notFoundIds: [] } });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('Importer un rapport d enrolement')).toBeInTheDocument(); });
    const fileInput = screen.getByLabelText('Choisir un fichier XML');
    fireEvent.change(fileInput, { target: { files: [new File(['<xml/>'], 'r.xml', { type: 'text/xml' })] } });
    fireEvent.click(screen.getByText('Importer et traiter'));
    await waitFor(() => { expect(screen.getByText('Reinitialiser')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Reinitialiser'));
    await waitFor(() => { expect(screen.queryByText('Reinitialiser')).not.toBeInTheDocument(); });
  });

  it('downloads errors CSV in enrollment detail modal', async () => {
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    HTMLAnchorElement.prototype.click = jest.fn();
    const enrollmentLogsWithErrors = [{
      id: 1, file_name: 'e.xml', processed_at: '2025-01-15T10:00:00Z', bank_code: 'BT', bank_name: 'Banque de Tunisie', total_records: 100, success_count: 90, error_count: 5,
      not_found_ids: null,
      error_details: '[{"xmlId":"X1","errorCode":"ERR01","errorDescription":"Invalid"}]',
    }];
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
      if (url === '/enrollment/logs') return Promise.resolve({ data: { data: enrollmentLogsWithErrors } });
      if (url === '/enrollment/stats') return Promise.resolve({ data: { data: { enrolled_success: 5, enrolled_error: 5, pending: 0 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('e.xml')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Voir'));
    await waitFor(() => { expect(screen.getByText(/Rapport d'Import/)).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Telecharger erreurs CSV'));
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('shows empty state when history has no data', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url && url.startsWith('/records/history/')) return Promise.resolve({ data: { data: { summary: { totalAttempts: 0, currentStatus: null, firstAttempt: null, lastAttempt: null }, attempts: [] } } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('4000056655665556'));
    await waitFor(() => { expect(screen.getByText('Aucun historique disponible')).toBeInTheDocument(); });
  });

  it('renders bank filter with bank-specific options for bank user', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    mockGet.mockImplementation((url) => {
      if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: xmlLogsData, pagination: { total: 1 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 10, success_count: 5, error_count: 3, pending_count: 2, total_entries: 50 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.getByText('Banque de Tunisie')).toBeInTheDocument(); });
    expect(screen.queryByText('Toutes les banques')).not.toBeInTheDocument();
  });

  it('sorts by ID column', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    fireEvent.click(screen.getByText('ID'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/records');
      expect(calls.length).toBe(callsBefore + 1);
      expect(calls[calls.length - 1][1].params.sortBy).toBe('id');
    });
  });

  it('sorts by Banque column', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    fireEvent.click(screen.getByText('Banque'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/records');
      expect(calls.length).toBe(callsBefore + 1);
      expect(calls[calls.length - 1][1].params.sortBy).toBe('bank_name');
    });
  });

  it('sorts by Prenom column', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    fireEvent.click(screen.getByText('Prenom'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/records');
      expect(calls.length).toBe(callsBefore + 1);
      expect(calls[calls.length - 1][1].params.sortBy).toBe('first_name');
    });
  });

  it('sorts by PAN column', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    fireEvent.click(screen.getByText('PAN'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/records');
      expect(calls.length).toBe(callsBefore + 1);
      expect(calls[calls.length - 1][1].params.sortBy).toBe('pan');
    });
  });

  it('sorts by Date column', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    const callsBefore = mockGet.mock.calls.filter(c => c[0] === '/records').length;
    fireEvent.click(screen.getByText('Date'));
    await waitFor(() => {
      const calls = mockGet.mock.calls.filter(c => c[0] === '/records');
      expect(calls.length).toBe(callsBefore + 1);
      expect(calls[calls.length - 1][1].params.sortBy).toBe('processed_at');
    });
  });

  it('opens history via history action button', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByTitle("Voir l'historique"));
    await waitFor(() => { expect(screen.getByText(/Historique du PAN/)).toBeInTheDocument(); });
  });

  it('opens file preview for source file in XML tab', async () => {
    render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Fichiers XML'));
    await waitFor(() => { expect(screen.getByText('output.xml')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('source.csv'));
    await waitFor(() => { expect(screen.getByText('Telecharger')).toBeInTheDocument(); });
  });

  it('closes enrollment log detail modal on overlay click', async () => {
    const enrollmentLogsWithDetails = [{
      id: 1, file_name: 'enrolment.xml', processed_at: '2025-01-15T10:00:00Z', bank_code: 'BT', bank_name: 'Banque de Tunisie', total_records: 100, success_count: 90, error_count: 5,
      not_found_ids: '["NF1"]',
      error_details: '[{"xmlId":"X1","errorCode":"ERR01","errorDescription":"Invalid"}]',
    }];
    mockGet.mockImplementation((url) => {
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      if (url === '/records') return Promise.resolve({ data: { data: recordsData, pagination: { total: 1 } } });
      if (url === '/xml-logs') return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
      if (url === '/xml-logs/stats/summary') return Promise.resolve({ data: { data: { total_xml: 0, success_count: 0, error_count: 0, pending_count: 0 } } });
      if (url === '/enrollment/logs') return Promise.resolve({ data: { data: enrollmentLogsWithDetails } });
      if (url === '/enrollment/stats') return Promise.resolve({ data: { data: { enrolled_success: 5, enrolled_error: 5, pending: 0 } } });
      return Promise.resolve({ data: { data: [] } });
    });
    const { container } = render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Rapport Enrolement'));
    await waitFor(() => { expect(screen.getByText('enrolment.xml')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Voir'));
    await waitFor(() => { expect(screen.getByText(/Rapport d'Import/)).toBeInTheDocument(); });
    const overlay = container.querySelector('.modal-overlay');
    fireEvent.click(overlay);
    await waitFor(() => { expect(screen.queryByText(/Rapport d'Import/)).not.toBeInTheDocument(); });
  });

  it('closes history modal on overlay click', async () => {
    const { container } = render(<MemoryRouter><Records /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Enregistrements')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('4000056655665556'));
    await waitFor(() => { expect(screen.getByText(/Historique du PAN/)).toBeInTheDocument(); });
    const overlay = container.querySelector('.modal-overlay');
    fireEvent.click(overlay);
    await waitFor(() => { expect(screen.queryByText(/Historique du PAN/)).not.toBeInTheDocument(); });
  });
});
