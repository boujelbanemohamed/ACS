import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), post: (...args) => mockPost(...args), put: (...args) => mockPut(...args), delete: (...args) => mockDelete(...args) },
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockUser = { role: 'super_admin', bank_id: null };
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
  AuthProvider: ({ children }) => <>{children}</>,
}));

jest.mock('lucide-react', () => ({
  Activity: () => null,
  Database: () => null,
  Mail: () => null,
  Clock: () => null,
  Server: () => null,
  CheckCircle: () => null,
  XCircle: () => null,
  AlertTriangle: () => null,
  RefreshCw: () => null,
  Cpu: () => null,
  HardDrive: () => null,
  Settings: () => null,
  Bug: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
}));
jest.mock('../Monitor.css', () => ({}));

const healthData = {
  globalStatus: 'up',
  checkedAt: '2025-01-15T10:00:00Z',
  components: {
    database: { status: 'up', latency: '5ms' },
    smtp: { status: 'disabled', host: 'smtp.example.com' },
    cron: { status: 'up', schedule: '*/5 * * * *', description: 'Toutes les 5 min', nextRun: '2025-01-15T10:05:00Z', lastScan: '2025-01-15T10:00:00Z' },
  },
  system: { nodeVersion: '18.0.0', uptime: '5d 12h', env: 'production', memory: { used: '256MB', total: '512MB', rss: '128MB' } },
};

let Monitor;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockNavigate.mockClear();
  mockGet.mockResolvedValue({ data: { data: healthData } });
  Monitor = require('../Monitor').default;
});

describe('Monitor', () => {
  it('shows loading state initially', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
  });

  it('renders title and health components', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.getByText('État Général')).toBeInTheDocument(); });
  });

  it('shows error state when API fails', async () => {
    mockGet.mockRejectedValue({ response: { data: { message: 'Erreur de chargement' } } });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Erreur de chargement')).toBeInTheDocument(); });
    expect(screen.getByText('Réessayer')).toBeInTheDocument();
  });

  it('shows system details', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText(/Node/)).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.getByText(/production/)).toBeInTheDocument(); });
  });

  it('changes refresh interval', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Auto'));
    fireEvent.click(screen.getByText('Auto'));
    expect(screen.getByText('15s')).toBeInTheDocument();
  });

  it('triggers navigation on SMTP config button click', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Configurer SMTP'));
    expect(mockNavigate).toHaveBeenCalledWith('/notifications');
  });

  it('toggles auto-refresh checkbox state', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  it('displays system uptime and memory details', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Uptime: 5d 12h')).toBeInTheDocument();
    });
    expect(screen.getByText('Utilisée: 256MB')).toBeInTheDocument();
    expect(screen.getByText('Allouée: 512MB')).toBeInTheDocument();
  });

  it('shows cron schedule, next run, and last scan details', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.getByText(/Toutes les 5 min/)).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.getByText(/Prochaine exécution/)).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.getByText(/Dernier scan/)).toBeInTheDocument(); });
  });

  it('renders with mixed statuses: healthy global, down database, not_configured smtp, stopped cron', async () => {
    const mixedHealth = {
      globalStatus: 'healthy',
      checkedAt: '2025-01-15T10:00:00Z',
      components: {
        database: { status: 'down', latency: '5ms', error: 'Connection refused' },
        smtp: { status: 'not_configured' },
        cron: { status: 'stopped', schedule: '0 8 * * *', description: 'Arrêté' },
      },
      system: { nodeVersion: '18.0.0', uptime: '5d 12h', env: 'production', memory: { used: '256MB', total: '512MB', rss: '128MB' } },
    };
    mockGet.mockResolvedValue({ data: { data: mixedHealth } });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    await waitFor(() => {
      expect(screen.getByText('HS')).toBeInTheDocument();
    });
    await waitFor(() => { expect(screen.getByText('Non configuré')).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.getByText('Arrêté')).toBeInTheDocument(); });
    expect(screen.getByText('Configurer SMTP')).toBeInTheDocument();
    expect(screen.getByText('Voir Scan Automatique')).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Voir Scan Automatique'));
    expect(mockNavigate).toHaveBeenCalledWith('/cron');
  });

  it('renders with error status and disabled smtp', async () => {
    const errorHealth = {
      globalStatus: 'error',
      checkedAt: '2025-01-15T10:00:00Z',
      components: {
        database: { status: 'error', latency: '5ms', error: 'DB crash' },
        smtp: { status: 'disabled', host: 'smtp.example.com' },
        cron: { status: 'up', schedule: '*/5 * * * *', description: 'Toutes les 5 min', nextRun: '2025-01-15T10:05:00Z' },
      },
      system: { nodeVersion: '18.0.0', uptime: '5d 12h', env: 'production', memory: { used: '256MB', total: '512MB', rss: '128MB' } },
    };
    mockGet.mockResolvedValue({ data: { data: errorHealth } });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getAllByText('Erreur').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('Désactivé')).toBeInTheDocument();
    expect(screen.getByText('Configurer SMTP')).toBeInTheDocument();
  });

  it('renders with unknown status using default fallback', async () => {
    const unknownHealth = {
      globalStatus: 'unknown',
      checkedAt: '2025-01-15T10:00:00Z',
      components: {
        database: { status: 'unknown' },
        smtp: { status: 'some_garbage_status' },
        cron: { status: 'up', schedule: '*/5 * * * *', description: 'Toutes les 5 min', nextRun: '2025-01-15T10:05:00Z' },
      },
      system: { nodeVersion: '18.0.0', uptime: '5d 12h', env: 'production', memory: { used: '256MB', total: '512MB', rss: '128MB' } },
    };
    mockGet.mockResolvedValue({ data: { data: unknownHealth } });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('some_garbage_status')).toBeInTheDocument();
  });

  it('manual refresh button calls fetchHealth with loading', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Actualiser'));
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/monitoring/health');
    });
  });

  it('clicking Réessayer retries fetchHealth after error', async () => {
    mockGet.mockImplementation(() => Promise.reject({ response: { data: { message: 'Temporary error' } } }));
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Temporary error')).toBeInTheDocument(); });
    mockGet.mockResolvedValue({ data: { data: healthData } });
    fireEvent.click(screen.getByText('Réessayer'));
    await waitFor(() => { expect(screen.getByText('État Général')).toBeInTheDocument(); });
  });

  it('changes auto-refresh interval via selector', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    const select = screen.getByText('15s').closest('select') || screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '5000' } });
    expect(screen.getByText('5s')).toBeInTheDocument();
  });

  it('debug section: shows loading state on toggle', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('/monitoring/debug')) return new Promise(() => {});
      return Promise.resolve({ data: { data: healthData } });
    });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Debug'));
    expect(screen.getByText('Chargement du diagnostic...')).toBeInTheDocument();
  });

  it('debug section: shows empty state when no data', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('/monitoring/debug')) return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: { data: healthData } });
    });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Debug'));
    await waitFor(() => {
      expect(screen.getByText('Cliquez sur "Actualiser" pour charger le diagnostic.')).toBeInTheDocument();
    });
  });

  it('debug section: fetch error shows error state with retry button', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('/monitoring/debug')) return Promise.reject(new Error('Debug fetch error'));
      return Promise.resolve({ data: { data: healthData } });
    });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Debug'));
    await waitFor(() => {
      expect(screen.getByText('Erreur de chargement du diagnostic')).toBeInTheDocument();
    });
    expect(screen.getByText('Réessayer')).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith('Debug fetch error:', expect.any(Error));
  });

  it('debug section: renders full debug data with summary, validation errors, file errors, and stats', async () => {
    const debugData = {
      summary: {
        unresolved_validation_errors: 5,
        file_processing_errors: 3,
        api_call_errors: 1,
        xml_generation_errors: 2,
        rejected_records: 10,
        failed_notifications: 0,
        scan_errors_total: 1,
        enrollment_errors: 0,
      },
      top_field_validation_errors: [
        { field_name: 'phone', error_type: 'format', error_message: 'Numéro invalide', count: 15 },
        { field_name: 'email', error_type: 'invalid', error_message: 'Email non valide', count: 8 },
      ],
      recent_file_errors: [
        {
          file_name: 'clients_2025.csv',
          bank_code: 'BT',
          status: 'error',
          invalid_rows: 5,
          processed_at: '2025-01-14T10:00:00Z',
          validation_errors: [
            { severity: 'error', field: 'phone', row: 10, message: 'Format invalide', value: '+216!12345', resolved: false },
            { severity: 'warning', field: 'email', row: 15, message: 'Email suspect', value: 'test@', resolved: true },
          ],
        },
        {
          file_name: 'data_2025.csv',
          bank_code: 'BIAT',
          status: 'validation_error',
          invalid_rows: 3,
          processed_at: null,
          error_details: 'Erreur de parsing CSV',
        },
        {
          file_name: 'empty.csv',
          bank_code: 'UBCI',
          status: 'error',
          invalid_rows: 0,
          processed_at: '2025-01-13T10:00:00Z',
          record_history_errors: [
            { severity: 'error', field: 'amount', row: 5, message: 'Montant négatif', value: '-100', resolved: false },
          ],
        },
      ],
      file_errors_by_status: [
        { status: 'error', count: 2, invalid_rows: 5, duplicate_rows: 1 },
        { status: 'validation_error', count: 1, invalid_rows: 3, duplicate_rows: 0 },
      ],
      recent_scan_errors: [
        { scan_time: '2025-01-14T08:00:00Z', errors_count: 3, errors_detail: 'Timeout sur le dossier SFTP' },
        { scan_time: '2025-01-13T08:00:00Z', errors_count: 1, errors_detail: null },
      ],
    };
    mockGet.mockImplementation((url) => {
      if (url.includes('/monitoring/debug')) return Promise.resolve({ data: { data: debugData } });
      return Promise.resolve({ data: { data: healthData } });
    });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Debug'));
    await waitFor(() => {
      expect(screen.getByText('Diagnostic des erreurs')).toBeInTheDocument();
    });
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Erreurs de validation non résolues')).toBeInTheDocument();
    expect(screen.getByText('Fichiers en erreur')).toBeInTheDocument();
    expect(screen.getByText('Appels API en échec')).toBeInTheDocument();
    expect(screen.getByText('Générations XML en échec')).toBeInTheDocument();
    expect(screen.getByText('Enregistrements rejetés')).toBeInTheDocument();
    expect(screen.getByText('Notifications échouées')).toBeInTheDocument();
    expect(screen.getByText('Scans en échec')).toBeInTheDocument();
    expect(screen.getByText("Rapports d'enrôlement en erreur")).toBeInTheDocument();
    expect(screen.getAllByText('phone').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Numéro invalide')).toBeInTheDocument();
    expect(screen.getByText('clients_2025.csv')).toBeInTheDocument();
    expect(screen.getByText('data_2025.csv')).toBeInTheDocument();
    expect(screen.getByText('empty.csv')).toBeInTheDocument();
    expect(screen.getByText('Erreur de parsing CSV')).toBeInTheDocument();
    expect(screen.getByText('Format invalide')).toBeInTheDocument();
    expect(screen.getByText('Montant négatif')).toBeInTheDocument();
    expect(screen.getByText('Erreurs fatales')).toBeInTheDocument();
    expect(screen.getByText('Erreurs de validation')).toBeInTheDocument();
    expect(screen.getByText('Erreurs de scan récentes')).toBeInTheDocument();
    expect(screen.getByText('Timeout sur le dossier SFTP')).toBeInTheDocument();
  });

  it('onClick debug button toggles debug section when already loaded', async () => {
    const debugData = {
      summary: {
        unresolved_validation_errors: 0, file_processing_errors: 0, api_call_errors: 0,
        xml_generation_errors: 0, rejected_records: 0, failed_notifications: 0,
        scan_errors_total: 0, enrollment_errors: 0,
      },
      top_field_validation_errors: [],
      recent_file_errors: [],
      recent_scan_errors: [],
      file_errors_by_status: [],
    };
    mockGet.mockImplementation((url) => {
      if (url.includes('/monitoring/debug')) return Promise.resolve({ data: { data: debugData } });
      return Promise.resolve({ data: { data: healthData } });
    });
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Debug'));
    await waitFor(() => { expect(screen.getByText('Diagnostic des erreurs')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Debug'));
    await waitFor(() => {
      expect(screen.queryByText('Diagnostic des erreurs')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Debug'));
    await waitFor(() => {
      expect(screen.getByText('Diagnostic des erreurs')).toBeInTheDocument();
    });
  });
});
