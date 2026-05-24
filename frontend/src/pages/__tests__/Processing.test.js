import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockConfirm = jest.fn().mockReturnValue(true);
const mockAlert = jest.fn();

window.confirm = mockConfirm;
window.alert = mockAlert;

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
    put: (...args) => mockPut(...args),
    delete: (...args) => mockDelete(...args),
  },
  banksAPI: { getAll: (...args) => mockGet(...args) },
  processingAPI: {
    callExternalApi: jest.fn(),
    uploadFile: jest.fn(),
    processUrl: jest.fn(),
    validateManualEntries: jest.fn(),
    processManualEntries: jest.fn(),
    downloadTemplate: jest.fn(),
    getJobStatus: jest.fn(),
    getQueueStats: jest.fn(),
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

window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test');
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

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
  const defaultJobResult = { success: true, fileLogId: 1, stats: {}, errors: [], totalValidRows: 0, validRecords: [], validRows: [] };
  const defaultJobResponse = { data: { success: true, data: { status: 'completed', result: defaultJobResult, progress: 100 } } };

  const { processingAPI } = require('../../services/api');
  processingAPI.callExternalApi.mockResolvedValue({ data: { success: true, data: { jobId: 'api-1', status: 'pending' } } });
  processingAPI.uploadFile.mockResolvedValue({ data: { success: true, data: { jobId: 'up-1', status: 'pending' } } });
  processingAPI.processUrl.mockResolvedValue({ data: { success: true, data: { jobId: 'url-1', status: 'pending' } } });
  processingAPI.validateManualEntries.mockResolvedValue({ data: { data: { entries: [] } } });
  processingAPI.processManualEntries.mockResolvedValue({ data: { success: true, data: { jobId: 'man-1', status: 'pending' } } });
  processingAPI.downloadTemplate.mockResolvedValue({ data: 'csv,template' });
  processingAPI.getJobStatus.mockResolvedValue(defaultJobResponse);
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

  it('switches between all 5 processing tabs', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Upload Fichier'));
    await waitFor(() => {
      expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => {
      expect(screen.getByText('Traitement par URL')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => {
      expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2);
    });
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => {
      expect(screen.getByText('Configuration API Externe')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => {
      expect(screen.getByText('Documentation API')).toBeInTheDocument();
    });
  });

  it('changes bank selection via dropdown', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
    });
    const bankSelect = screen.getByDisplayValue('-- Choisir une banque --');
    fireEvent.change(bankSelect, { target: { value: '2' } });
    expect(bankSelect.value).toBe('2');
  });

  it('selects file and submits upload triggering processingAPI.uploadFile', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });

    const file = new File(['test content'], 'test.csv', { type: 'text/csv' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Uploader et traiter'));

    await waitFor(() => {
      const { processingAPI } = require('../../services/api');
      expect(processingAPI.uploadFile).toHaveBeenCalledTimes(1);
    });
    const { processingAPI } = require('../../services/api');
    expect(processingAPI.uploadFile.mock.calls[0][0] instanceof FormData).toBe(true);
  });

  it('enters URL and triggers URL processing API call', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => {
      expect(screen.getByText('Traitement par URL')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://acme-bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));

    await waitFor(() => {
      const { processingAPI } = require('../../services/api');
      expect(processingAPI.processUrl).toHaveBeenCalledTimes(1);
    });
    const { processingAPI } = require('../../services/api');
    expect(processingAPI.processUrl).toHaveBeenCalledWith({
      bankId: '1',
      baseUrl: 'https://acme-bank.com/data',
    });
  });

  it('fills manual entry form and Ajouter adds entry to list', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => {
      expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2);
    });

    const firstNameInput = screen.getByPlaceholderText('MOHAMED');
    const lastNameInput = screen.getByPlaceholderText('BEN ALI');
    const panInput = screen.getByPlaceholderText('4741560171719668');
    const expiryInput = screen.getByPlaceholderText('202512 ou 2512');
    const phoneInput = screen.getByPlaceholderText('21624080852');

    fireEvent.change(firstNameInput, { target: { value: 'MOHAMED' } });
    fireEvent.change(lastNameInput, { target: { value: 'BEN ALI' } });
    fireEvent.change(panInput, { target: { value: '4111111111111111' } });
    fireEvent.change(expiryInput, { target: { value: '202512' } });
    fireEvent.change(phoneInput, { target: { value: '21624080852' } });

    fireEvent.click(screen.getByText('Ajouter a la liste'));

    await waitFor(() => {
      expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument();
    });
    expect(screen.getByText('4111111111111111')).toBeInTheDocument();
  });

  it('shows PAN validation error when adding manual entry with empty PAN', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => {
      expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });

    fireEvent.click(screen.getByText('Ajouter a la liste'));

    await waitFor(() => {
      expect(screen.getByText('PAN obligatoire')).toBeInTheDocument();
    });
  });

  it('removes manual entry from list when Supprimer is clicked', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => {
      expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));

    await waitFor(() => {
      expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Supprimer'));

    await waitFor(() => {
      expect(screen.queryByText('Enregistrements a traiter (1)')).not.toBeInTheDocument();
    });
  });

  it('fills API config and triggers callExternalApi on Appeler l\'API', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => {
      expect(screen.getByText('Configuration API Externe')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText('Banque de Tunisie (BT)').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(
      screen.getByPlaceholderText('https://api.example.com/cards'),
      { target: { value: 'https://api.test.com/v1/cards' } }
    );
    const methodSelect = screen.getByDisplayValue('GET');
    fireEvent.change(methodSelect, { target: { value: 'POST' } });

    fireEvent.click(screen.getByText("Appeler l'API"));

    await waitFor(() => {
      const { processingAPI } = require('../../services/api');
      expect(processingAPI.callExternalApi).toHaveBeenCalledTimes(1);
    });
    const { processingAPI } = require('../../services/api');
    expect(processingAPI.callExternalApi).toHaveBeenCalledWith(
      expect.objectContaining({
        bankId: '1',
        url: 'https://api.test.com/v1/cards',
        method: 'POST',
      })
    );
  });

  it('triggers processingAPI.processManualEntries on Traiter et Generer XML', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => {
      expect(screen.getByText('Traitement par URL')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });

    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-ok', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [
        {
          rowNumber: 1, language: 'fr', firstName: 'Mohamed',
          lastName: 'Ben Ali', pan: '4111111111111111',
          expiry: '202512', phone: '21624080852',
          behaviour: 'otp', action: 'update',
        },
      ], stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 } } } },
    });

    fireEvent.click(screen.getByText('Lancer le traitement'));

    await waitFor(() => {
      expect(screen.getByText('Toutes les lignes sont valides !')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Traiter et Generer XML'));

    await waitFor(() => {
      expect(processingAPI.processManualEntries).toHaveBeenCalledTimes(1);
    });
  });

  it('shows empty state message Aucune ligne valide when no valid rows', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => {
      expect(screen.getByText('Traitement par URL')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });

    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-empty', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [], stats: { totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0 } } } },
    });

    fireEvent.click(screen.getByText('Lancer le traitement'));

    await waitFor(() => {
      expect(screen.getByText('Aucune ligne valide pour le moment.')).toBeInTheDocument();
    });
  });

  it('shows error notification when API rejects', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => {
      expect(screen.getByText('Traitement par URL')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });

    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockRejectedValue({
      response: { data: { message: 'Erreur lors du traitement' } },
    });

    fireEvent.click(screen.getByText('Lancer le traitement'));

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Erreur lors du traitement');
    });
  });

  it('handleReset resets state and shows notification', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reinitialiser'));
    await waitFor(() => expect(screen.getByText('Formulaire reinitialise')).toBeInTheDocument());
  });

  it('handleProcessUrl alerts when URL missing', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    expect(mockAlert).toHaveBeenCalledWith('Veuillez selectionner une banque et entrer une URL de base');
  });

  it('handleFileUpload alerts when file missing', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Uploader et traiter'));
    expect(mockAlert).toHaveBeenCalledWith('Veuillez selectionner une banque et un fichier');
  });

  it('handleFileUpload catches upload error', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.uploadFile.mockRejectedValue({ response: { data: { message: 'Erreur upload' } } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    const file = new File(['content'], 'test.csv', { type: 'text/csv' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Uploader et traiter'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Erreur upload'));
  });

  it('processResponseData handles errors without rowData', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-err2', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [{ rowNumber: 1, field: 'pan', error: 'Invalid', value: '123' }], validRecords: [], stats: { totalRows: 1, validRows: 0, invalidRows: 1, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('1 erreur(s) a corriger')).toBeInTheDocument());
  });

  it('renders API external tab with auth and body sections', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => expect(screen.getByText('Configuration API Externe')).toBeInTheDocument());
    const authSelect = screen.getByDisplayValue('Aucune');
    fireEvent.change(authSelect, { target: { value: 'bearer' } });
    expect(screen.getByPlaceholderText('Bearer token...')).toBeInTheDocument();
    fireEvent.change(authSelect, { target: { value: 'apikey' } });
    expect(screen.getByPlaceholderText('API Key...')).toBeInTheDocument();
    const methodSelect = screen.getByDisplayValue('GET');
    fireEvent.change(methodSelect, { target: { value: 'POST' } });
    expect(screen.getByText('Corps de la requete (JSON)')).toBeInTheDocument();
    fireEvent.change(methodSelect, { target: { value: 'PUT' } });
    expect(screen.getByText('Corps de la requete (JSON)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reinitialiser'));
  });

  it('handleApiCall handles success=false response branch', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => expect(screen.getByText('Configuration API Externe')).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('Banque de Tunisie (BT)').length).toBeGreaterThanOrEqual(1));
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://api.example.com/cards'), { target: { value: 'https://api.test.com/cards' } });
    const { processingAPI } = require('../../services/api');
    processingAPI.callExternalApi.mockResolvedValue({ data: { success: true, data: { jobId: 'api-err', status: 'pending' } } });
    processingAPI.getJobStatus.mockResolvedValue({ data: { success: true, data: { status: 'completed', result: { success: false, message: 'API Error' } } } });
    fireEvent.click(screen.getByText("Appeler l'API"));
    await waitFor(() => expect(screen.getByText('API Error')).toBeInTheDocument());
  });

  it('handleApiCall catch block handles network error', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => expect(screen.getByText('Configuration API Externe')).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('Banque de Tunisie (BT)').length).toBeGreaterThanOrEqual(1));
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://api.example.com/cards'), { target: { value: 'https://api.test.com/cards' } });
    const { processingAPI } = require('../../services/api');
    processingAPI.callExternalApi.mockRejectedValue({ response: { status: 500, data: { message: 'Server Error' } } });
    fireEvent.click(screen.getByText("Appeler l'API"));
    await waitFor(() => expect(screen.getByText('Server Error')).toBeInTheDocument());
  });

  it('fetchApiKeys error handling', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    mockGet.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('api-keys')) return Promise.reject(new Error('Unauthorized'));
      return Promise.resolve({ data: { data: banksData } });
    });
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
  });

  it('handleCreateApiKey alerts when name missing', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Creer la cle'));
    expect(mockAlert).toHaveBeenCalledWith('Veuillez saisir un nom pour la cle API');
  });

  it('handleCreateApiKey success path creates key and shows notification', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { api_key: 'sk-new-secret-key' } } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Ex: API Production Client X'), { target: { value: 'Test Key' } });
    fireEvent.click(screen.getByText('Creer la cle'));
    await waitFor(() => expect(screen.getByText('Cle API creee avec succes!')).toBeInTheDocument());
    expect(screen.getByText('sk-new-secret-key')).toBeInTheDocument();
  });

  it('handleCreateApiKey catches error on failure', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: 'Creation refused' } } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Ex: API Production Client X'), { target: { value: 'Fail Key' } });
    fireEvent.click(screen.getByText('Creer la cle'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Erreur: Creation refused'));
  });

  it('handleToggleApiKey catch block on error', async () => {
    mockPut.mockRejectedValue(new Error('Toggle failed'));
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => expect(screen.getByText('Production Client A')).toBeInTheDocument());
    const toggleBtn = document.querySelector('.api-key-meta > button:first-of-type');
    fireEvent.click(toggleBtn);
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Erreur: Toggle failed'));
  });

  it('handleDeleteApiKey confirms and deletes key', async () => {
    mockConfirm.mockReturnValue(true);
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => expect(screen.getByText('Production Client A')).toBeInTheDocument());
    const deleteBtn = document.querySelector('.api-key-meta .btn-danger');
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(screen.getByText('Cle API supprimee')).toBeInTheDocument());
  });

  it('handleDeleteApiKey catches error on failure', async () => {
    mockConfirm.mockReturnValue(true);
    mockDelete.mockRejectedValue(new Error('Delete failed'));
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => expect(screen.getByText('Production Client A')).toBeInTheDocument());
    const deleteBtn = document.querySelector('.api-key-meta .btn-danger');
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Erreur: Delete failed'));
  });

  it('copyToClipboard copies API key and shows notification', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => expect(screen.getByText('Production Client A')).toBeInTheDocument());
    fireEvent.click(screen.getAllByTitle('Copier')[0]);
    await waitFor(() => expect(screen.getByText('Copie dans le presse-papier!')).toBeInTheDocument());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sk-prod-a1b2c3d4e5f6g7h8i9j0');
  });

  it('fetchBanks error does not break rendering', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    expect(screen.getByText('-- Choisir une banque --')).toBeInTheDocument();
  });

  it('manual form shows PAN must be exactly 16 digits error', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '12345' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('PAN doit contenir exactement 16 chiffres')).toBeInTheDocument());
  });

  it('manual form shows expiry missing error', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Expiration obligatoire')).toBeInTheDocument());
  });

  it('manual form shows expiry bad format error', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '123' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Format: YYMM ou YYYYMM (ex: 2512 ou 202512)')).toBeInTheDocument());
  });

  it('manual form shows phone missing error', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Telephone obligatoire')).toBeInTheDocument());
  });

  it('manual form shows phone invalid format error', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '123' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Numero de telephone invalide (8-15 chiffres)')).toBeInTheDocument());
  });

  it('manual entry shows duplicate PAN notification', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'MOHAMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'BEN ALI' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'AHMED' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'SALAH' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Ce PAN existe deja dans la liste')).toBeInTheDocument());
  });

  it('handleValidateManualEntries alerts when no bank', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'TEST' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Valider les donnees'));
    expect(mockAlert).toHaveBeenCalledWith('Veuillez selectionner une banque');
  });

  it('handleValidateManualEntries success path', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.validateManualEntries.mockResolvedValue({
      data: { data: { entries: [{ id: 'm1', status: 'valid', pan: '4111111111111111', firstName: 'TEST', lastName: 'USER', language: 'fr', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }] } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'TEST' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Valider les donnees'));
    await waitFor(() => expect(screen.getByText(/Validation terminee/)).toBeInTheDocument());
  });

  it('handleValidateManualEntries catches error', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.validateManualEntries.mockRejectedValue({ response: { data: { message: 'Validation error' } } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'TEST' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Valider les donnees'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Validation error'));
  });

  it('handleProcessManualEntries alerts when no valid entries after validation', async () => {
    const { processingAPI } = require('../../services/api');
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'TEST' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument());
    processingAPI.validateManualEntries.mockResolvedValue({
      data: { data: { entries: [{ id: 'm1', status: 'error', pan: '4111111111111111', language: 'fr', firstName: 'TEST', lastName: 'USER', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }] } },
    });
    fireEvent.click(screen.getByText('Valider les donnees'));
    await waitFor(() => expect(screen.getByText(/Validation terminee/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traiter et Generer CSV/XML'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Aucun enregistrement valide a traiter'));
  });

  it('handleProcessManualEntries success path', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'TEST' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traiter et Generer CSV/XML'));
    await waitFor(() => expect(screen.getByText('Traitement termine avec succes !')).toBeInTheDocument());
  });

  it('handleProcessManualEntries catches error', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processManualEntries.mockRejectedValue({ response: { data: { message: 'Process error' } } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('MOHAMED'), { target: { value: 'TEST' } });
    fireEvent.change(screen.getByPlaceholderText('BEN ALI'), { target: { value: 'USER' } });
    fireEvent.change(screen.getByPlaceholderText('4741560171719668'), { target: { value: '4111111111111111' } });
    fireEvent.change(screen.getByPlaceholderText('202512 ou 2512'), { target: { value: '202512' } });
    fireEvent.change(screen.getByPlaceholderText('21624080852'), { target: { value: '21624080852' } });
    fireEvent.click(screen.getByText('Ajouter a la liste'));
    await waitFor(() => expect(screen.getByText('Enregistrements a traiter (1)')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traiter et Generer CSV/XML'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Process error'));
  });

  it('handleResolveError with PAN duplicate shows error notification', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-dup', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [{ rowNumber: 1, field: 'pan', error: 'Invalid PAN', value: '1111111111111111', rowData: { pan: '1111111111111111' } }], validRecords: [{ rowNumber: 2, pan: '4111111111111111' }], stats: { totalRows: 2, validRows: 1, invalidRows: 1, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('1 erreur(s) a corriger')).toBeInTheDocument());
    const panInputs = document.querySelectorAll('.error-row-editor input[type="text"]');
    const panInput = panInputs[3];
    fireEvent.change(panInput, { target: { value: '4111111111111111' } });
    fireEvent.click(screen.getByText('Valider la correction'));
    await waitFor(() => expect(screen.getByText(/existe deja/)).toBeInTheDocument());
  });

  it('handleResolveError corrects error and moves to valid rows', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-corr', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [{ rowNumber: 1, field: 'pan', error: 'Invalid PAN', value: '1111111111111111', rowData: { pan: '1111111111111111' } }], validRecords: [], stats: { totalRows: 1, validRows: 0, invalidRows: 1, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('1 erreur(s) a corriger')).toBeInTheDocument());
    const panInputs = document.querySelectorAll('.error-row-editor input[type="text"]');
    const panInput = panInputs[3];
    fireEvent.change(panInput, { target: { value: '4222222222222222' } });
    fireEvent.click(screen.getByText('Valider la correction'));
    await waitFor(() => expect(screen.getByText(/corrigee avec succes/)).toBeInTheDocument());
  });

  it('handleIgnoreError removes error and shows warning notification', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-ign', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [{ rowNumber: 1, field: 'pan', error: 'Invalid PAN', value: '1111111111111111', rowData: { pan: '1111111111111111' } }], validRecords: [], stats: { totalRows: 1, validRows: 0, invalidRows: 1, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('1 erreur(s) a corriger')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ignorer cette ligne'));
    await waitFor(() => expect(screen.getByText(/ignoree/)).toBeInTheDocument());
  });

  it('handleRemoveValidRow removes row from valid list', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-rem', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [{ rowNumber: 1, pan: '4111111111111111', firstName: 'TEST', lastName: 'USER', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }], stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('Toutes les lignes sont valides !')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Telecharger CSV corrige')).toBeInTheDocument());
    const removeBtns = document.querySelectorAll('.valid-row-card .btn-remove');
    if (removeBtns.length > 0) fireEvent.click(removeBtns[0]);
    await waitFor(() => expect(screen.getByText(/retiree/)).toBeInTheDocument());
  });

  it('handleFinalProcess alerts when bank deselected after getting valid rows', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-fin1', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [{ rowNumber: 1, pan: '4111111111111111', firstName: 'T', lastName: 'U', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }], stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('Toutes les lignes sont valides !')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('Banque de Tunisie (BT)'), { target: { value: '' } });
    const processBtns = screen.getAllByText('Traiter et Generer XML');
    fireEvent.click(processBtns[0]);
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Veuillez selectionner une banque et avoir des lignes valides'));
  });

  it('handleFinalProcess success path generates XML', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-fin2', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [{ rowNumber: 1, pan: '4111111111111111', firstName: 'T', lastName: 'U', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }], stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('Toutes les lignes sont valides !')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traiter et Generer XML'));
    await waitFor(() => expect(screen.getByText(/Traitement reussi/)).toBeInTheDocument());
  });

  it('handleFinalProcess handles success=false branch', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-fin3', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [{ rowNumber: 1, pan: '4111111111111111', firstName: 'T', lastName: 'U', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }], stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('Toutes les lignes sont valides !')).toBeInTheDocument());
    processingAPI.processManualEntries.mockResolvedValue({ data: { success: true, data: { jobId: 'man-fin3', status: 'pending' } } });
    processingAPI.getJobStatus.mockResolvedValue({ data: { success: true, data: { status: 'completed', result: { success: false, message: 'XML generation failed' } } } });
    fireEvent.click(screen.getByText('Traiter et Generer XML'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Erreur: XML generation failed'));
  });

  it('handleFinalProcess catch block handles error', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-fin4', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [{ rowNumber: 1, pan: '4111111111111111', firstName: 'T', lastName: 'U', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }], stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 } } } },
    });
    processingAPI.processManualEntries.mockRejectedValue({ response: { data: { message: 'Process failed' } } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('Toutes les lignes sont valides !')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traiter et Generer XML'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Erreur lors du traitement: Process failed'));
  });

  it('handleDownloadCorrected generates CSV and shows notification', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-dl', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [], validRecords: [{ rowNumber: 1, pan: '4111111111111111', firstName: 'T', lastName: 'U', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' }], stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('Toutes les lignes sont valides !')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Telecharger CSV corrige'));
    await waitFor(() => expect(screen.getByText('Fichier CSV telecharge')).toBeInTheDocument());
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it('handleDownloadTemplate error shows notification', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.downloadTemplate.mockRejectedValue(new Error('Download error'));
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Template CSV'));
    await waitFor(() => expect(screen.getByText('Erreur lors du telechargement du template')).toBeInTheDocument());
  });

  it('notification dismiss button clears notification', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Reinitialiser'));
    await waitFor(() => expect(screen.getByText('Formulaire reinitialise')).toBeInTheDocument());
    const dismissBtn = document.querySelector('.notification button');
    fireEvent.click(dismissBtn);
    await waitFor(() => expect(screen.queryByText('Formulaire reinitialise')).not.toBeInTheDocument());
  });

  it('handleApiCall button disabled when URL and bank missing', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => expect(screen.getByText('Configuration API Externe')).toBeInTheDocument());
    const apiBtn = document.querySelector('.form-actions button.btn-primary');
    expect(apiBtn).not.toBeNull();
    expect(apiBtn.hasAttribute('disabled')).toBe(true);
  });

  it('handleToggleApiKey success path toggles and shows notification', async () => {
    mockPut.mockResolvedValue({});
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => expect(screen.getByText('Production Client A')).toBeInTheDocument());
    const toggleBtn = document.querySelector('.api-key-meta > button:first-of-type');
    fireEvent.click(toggleBtn);
    await waitFor(() => expect(screen.getByText('Cle API desactivee')).toBeInTheDocument());
  });

  it('handleDownloadTemplate success downloads template and shows notification', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.downloadTemplate.mockResolvedValue({ data: 'csv,template,content' });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Upload Manuel de Fichier CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Template CSV'));
    await waitFor(() => expect(screen.getByText('Template CSV telecharge')).toBeInTheDocument());
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });

  it('changes language, behaviour and action in manual entry form', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Saisie Manuelle'));
    await waitFor(() => expect(screen.getAllByText('Saisie Manuelle').length).toBeGreaterThanOrEqual(2));

    fireEvent.change(screen.getByDisplayValue('Francais (fr)'), { target: { value: 'en' } });
    expect(screen.getByDisplayValue('Anglais (en)')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('OTP'), { target: { value: 'sms' } });
    expect(screen.getByDisplayValue('SMS')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Update'), { target: { value: 'add' } });
    expect(screen.getByDisplayValue('Add')).toBeInTheDocument();
  });

  it('fills API external tab auth token, headers, body, dataPath and bank select', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Externe'));
    await waitFor(() => expect(screen.getByText('Configuration API Externe')).toBeInTheDocument());

    const authSelect = screen.getByDisplayValue('Aucune');
    fireEvent.change(authSelect, { target: { value: 'bearer' } });
    const tokenInput = screen.getByPlaceholderText('Bearer token...');
    fireEvent.change(tokenInput, { target: { value: 'my-bearer-token' } });
    expect(tokenInput.value).toBe('my-bearer-token');

    const headersInput = screen.getByPlaceholderText('{"Content-Type": "application/json"}');
    fireEvent.change(headersInput, { target: { value: '{"Authorization": "Bearer test"}' } });
    expect(headersInput.value).toBe('{"Authorization": "Bearer test"}');

    const methodSelect = screen.getByDisplayValue('GET');
    fireEvent.change(methodSelect, { target: { value: 'POST' } });
    const bodyInput = screen.getByPlaceholderText('{"filter": "active"}');
    fireEvent.change(bodyInput, { target: { value: '{"test": true}' } });
    expect(bodyInput.value).toBe('{"test": true}');

    const dataPathInput = screen.getByPlaceholderText('data.records');
    fireEvent.change(dataPathInput, { target: { value: 'results.data' } });
    expect(dataPathInput.value).toBe('results.data');

    const apiBankSelect = screen.getByDisplayValue('Selectionnez une banque');
    fireEvent.change(apiBankSelect, { target: { value: '1' } });
    expect(apiBankSelect.value).toBe('1');
  });

  it('modal overlay dismisses API key creation modal', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    const overlay = document.querySelector('.modal-overlay');
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByText('Creer une nouvelle cle API')).not.toBeInTheDocument());
  });

  it('newly created key display copy and close buttons', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { api_key: 'sk-copy-test-key' } } });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('Ex: API Production Client X'), { target: { value: 'Copy Test Key' } });
    fireEvent.click(screen.getByText('Creer la cle'));
    await waitFor(() => expect(screen.getByText('Cle API creee avec succes!')).toBeInTheDocument());
    expect(screen.getByText('sk-copy-test-key')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Copier la cle'));
    await waitFor(() => expect(screen.getByText('Copie dans le presse-papier!')).toBeInTheDocument());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sk-copy-test-key');
    fireEvent.click(screen.getByText('Fermer'));
    await waitFor(() => expect(screen.queryByText('sk-copy-test-key')).not.toBeInTheDocument());
  });

  it('API key form fills institution, bankId and expiresAt fields', async () => {
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('API Interne'));
    await waitFor(() => expect(screen.getByText('Documentation API')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Nouvelle Cle'));
    await waitFor(() => expect(screen.getByText('Creer une nouvelle cle API')).toBeInTheDocument());

    const institutionInput = screen.getByPlaceholderText('Ex: Banque XYZ');
    fireEvent.change(institutionInput, { target: { value: 'My Institution' } });
    expect(institutionInput.value).toBe('My Institution');

    const bankIdSelect = screen.getByDisplayValue('Toutes les banques');
    fireEvent.change(bankIdSelect, { target: { value: '1' } });
    expect(bankIdSelect.value).toBe('1');

    const dateInput = document.querySelector('.modal-content input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } });
    expect(dateInput.value).toBe('2026-12-31');
  });

  it('ErrorRowEditor shows PAN required alert when PAN cleared', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-pan1', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [{ rowNumber: 1, field: 'pan', error: 'Invalid PAN', value: '1111111111111111', rowData: { pan: '1111111111111111', firstName: 'TEST', lastName: 'USER', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' } }], validRecords: [], stats: { totalRows: 1, validRows: 0, invalidRows: 1, duplicateRows: 0 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('1 erreur(s) a corriger')).toBeInTheDocument());
    const panInput = document.querySelectorAll('.error-row-editor input[type="text"]')[3];
    fireEvent.change(panInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Valider la correction'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Le PAN est obligatoire'));
  });

  it('ErrorRowEditor shows duplicate PAN alert when severity is warning', async () => {
    const { processingAPI } = require('../../services/api');
    processingAPI.processUrl.mockResolvedValue({
      data: { success: true, data: { jobId: 'url-pan2', status: 'pending' } },
    });
    processingAPI.getJobStatus.mockResolvedValue({
      data: { success: true, data: { status: 'completed', result: { success: true, errors: [{ rowNumber: 1, field: 'pan', error: 'Duplicate PAN found', value: '4111111111111111', severity: 'warning', rowData: { pan: '4111111111111111', firstName: 'TEST', lastName: 'USER', expiry: '202512', phone: '21624080852', behaviour: 'otp', action: 'update' } }], validRecords: [], stats: { totalRows: 1, validRows: 0, invalidRows: 0, duplicateRows: 1 } } } },
    });
    render(<MemoryRouter><Processing /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Traitement des Fichiers CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Traitement URL'));
    await waitFor(() => expect(screen.getByText('Traitement par URL')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Banque de Tunisie (BT)')).toBeInTheDocument());
    fireEvent.change(screen.getByDisplayValue('-- Choisir une banque --'), { target: { value: '1' } });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/ACS'), { target: { value: 'https://bank.com/data' } });
    fireEvent.click(screen.getByText('Lancer le traitement'));
    await waitFor(() => expect(screen.getByText('DOUBLON PAN')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Valider la correction'));
    await waitFor(() => expect(mockAlert).toHaveBeenCalledWith('Vous devez modifier le PAN pour resoudre le doublon'));
  });
});
