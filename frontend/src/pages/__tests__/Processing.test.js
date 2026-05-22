import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockConfirm = jest.fn().mockReturnValue(true);

window.confirm = mockConfirm;

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), post: (...args) => mockPost(...args) },
  banksAPI: { getAll: (...args) => mockGet(...args) },
  processingAPI: {
    callExternalApi: jest.fn().mockResolvedValue({ data: { success: true, data: { validRows: [], errors: [], stats: {} } } }),
    uploadFile: jest.fn().mockResolvedValue({ data: { success: true, data: { errors: [], validRecords: [] } } }),
    processUrl: jest.fn().mockResolvedValue({ data: { success: true, data: { errors: [], validRecords: [] } } }),
    validateManualEntries: jest.fn().mockResolvedValue({ data: { data: { entries: [] } } }),
    processManualEntries: jest.fn().mockResolvedValue({ data: { message: 'Traitement termine avec succes !', success: true } }),
    downloadTemplate: jest.fn().mockResolvedValue({ data: 'csv,template' }),
  }
}));

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const { useAuth } = require('../../contexts/AuthContext');

jest.mock('lucide-react', () => ({
  Upload: () => null,
  Link: () => null,
  PlayCircle: () => null,
  Download: () => null,
  RefreshCw: () => null,
  AlertTriangle: () => null,
  CheckCircle: () => null,
  X: () => null,
  Check: () => null,
  FileText: () => null,
  Send: () => null,
  ArrowRight: () => null,
  PenLine: () => null,
  Plus: () => null,
  Trash2: () => null,
  Globe: () => null,
}));

jest.mock('../Processing.css', () => ({}));

const banksData = [
  { id: 1, code: 'BT', name: 'Banque de Tunisie', is_active: true, source_url: 'sftp://bt/source', destination_url: 'sftp://bt/dest', old_url: 'sftp://bt/archive', xml_output_url: 'sftp://bt/xml' },
  { id: 2, code: 'BIAT', name: 'BIAT', is_active: true, source_url: 'sftp://biat/source', destination_url: 'sftp://biat/dest', old_url: 'sftp://biat/archive', xml_output_url: 'sftp://biat/xml' },
];

const apiKeysData = [
  { id: 1, name: 'Production Client A', api_key: 'sk-prod-a1b2c3d4e5f6g7h8i9j0', institution: 'Banque Centrale', is_active: true },
  { id: 2, name: 'Test API', api_key: 'sk-test-x1y2z3w4v5u6t7s8r9q0', institution: 'BIAT', is_active: true },
];

let Processing;

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
  mockGet.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('api-keys')) return Promise.resolve({ data: { data: apiKeysData } });
    return Promise.resolve({ data: { data: banksData } });
  });
  Processing = require('../Processing').default;
});

describe('Processing', () => {
  it('renders main heading and default upload tab content', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument();
    });
  });

  it('shows bank options in dropdown after banks load', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('-- Choisir une banque --')).toBeInTheDocument();
    });
    expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
    expect(screen.getByText('BIAT (BIAT)')).toBeInTheDocument();
  });

  it('switches to URL processing tab', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => {
      expect(screen.getByText('Traitement par URL')).toBeInTheDocument();
    });
  });

  it('switches to manual entry tab', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => {
      expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('switches to API external tab', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => {
      expect(screen.getByText('Configuration API Externe')).toBeInTheDocument();
    });
  });

  it('switches to API internal tab with documentation', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => {
      expect(screen.getByText('Documentation API')).toBeInTheDocument();
    });
    expect(screen.getByText('/api/v1/banks')).toBeInTheDocument();
    expect(screen.getByText('/api/v1/cards/register')).toBeInTheDocument();
  });

  it('renders with bank user role and auto-selects bank', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument();
    });
    expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
  });

  it('opens API key creation modal in internal API tab', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => {
      expect(screen.getByText('Nouvelle Cle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => {
      expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Ex: API Production Client X')).toBeInTheDocument();
  });
});
