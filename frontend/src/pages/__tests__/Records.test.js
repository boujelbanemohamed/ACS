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
});
