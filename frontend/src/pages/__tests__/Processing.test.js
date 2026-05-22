import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockConfirm = jest.fn().mockReturnValue(true);
const mockAlert = jest.fn();

window.confirm = mockConfirm;
window.alert = mockAlert;

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), post: (...args) => mockPost(...args) },
  banksAPI: { getAll: (...args) => mockGet(...args) },
  processingAPI: {
    callExternalApi: jest.fn(),
    uploadFile: jest.fn(),
    processUrl: jest.fn(),
    validateManualEntries: jest.fn(),
    processManualEntries: jest.fn(),
    downloadTemplate: jest.fn(),
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
  const { processingAPI } = require('../../services/api');
  processingAPI.callExternalApi.mockResolvedValue({ data: { success: true, data: { validRows: [], errors: [], stats: {} } } });
  processingAPI.uploadFile.mockResolvedValue({ data: { success: true, data: { errors: [], validRecords: [] } } });
  processingAPI.processUrl.mockResolvedValue({ data: { success: true, data: { errors: [], validRecords: [] } } });
  processingAPI.validateManualEntries.mockResolvedValue({ data: { data: { entries: [] } } });
  processingAPI.processManualEntries.mockResolvedValue({ data: { message: 'Traitement termine avec succes !', success: true } });
  processingAPI.downloadTemplate.mockResolvedValue({ data: 'csv,template' });
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
      data: {
        success: true,
        data: {
          errors: [],
          validRecords: [
            {
              rowNumber: 1, language: 'fr', firstName: 'Mohamed',
              lastName: 'Ben Ali', pan: '4111111111111111',
              expiry: '202512', phone: '21624080852',
              behaviour: 'otp', action: 'update',
            },
          ],
          stats: { totalRows: 1, validRows: 1, invalidRows: 0, duplicateRows: 0 },
        },
      },
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
      data: {
        success: true,
        data: { errors: [], validRecords: [], stats: { totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0 } },
      },
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
});
