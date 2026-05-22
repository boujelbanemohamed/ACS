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

jest.mock('lucide-react', () => ({
  Clock: () => null,
  PlayCircle: () => null,
  RefreshCw: () => null,
  Settings: () => null,
  Save: () => null,
  Power: () => null,
  Trash2: () => null,
}));
jest.mock('../CronManager.css', () => ({}));

const scannerStatus = { isScanning: false, timezone: 'Africa/Tunis', lastScan: '2025-01-15T10:00:00Z', nextScan: '2025-01-15T10:05:00Z' };
const scannerLogs = [
  { id: 1, scan_time: '2025-01-15T10:00:00Z', banks_scanned: 3, files_found: 10, files_processed: 10, errors_count: 0 },
  { id: 2, scan_time: '2025-01-15T09:00:00Z', banks_scanned: 3, files_found: 8, files_processed: 7, errors_count: 1 },
];
const settingsData = { cron_schedule: '*/5 * * * *', cron_enabled: 'true' };

let CronManager;
beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation((url) => {
    if (url === '/scanner/status') return Promise.resolve({ data: { data: scannerStatus } });
    if (url === '/scanner/logs?limit=10') return Promise.resolve({ data: { data: scannerLogs } });
    if (url === '/settings') return Promise.resolve({ data: { data: settingsData } });
    return Promise.resolve({ data: { data: [] } });
  });
  CronManager = require('../CronManager').default;
});

describe('CronManager', () => {
  it('shows loading state initially', async () => {
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
  });

  it('renders title and action buttons', async () => {
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    expect(screen.getByText('Config')).toBeInTheDocument();
    expect(screen.getAllByText('Activé').length).toBeGreaterThan(0);
    expect(screen.getByText('Scan')).toBeInTheDocument();
  });

  it('renders status card and history', async () => {
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    expect(screen.getByText('Statut')).toBeInTheDocument();
    expect(screen.getByText('Historique')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
  });

  it('shows scan logs in history table', async () => {
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    expect(screen.getByText('Banques')).toBeInTheDocument();
    expect(screen.getByText('Trouvés')).toBeInTheDocument();
    expect(screen.getByText('Traités')).toBeInTheDocument();
  });

  it('shows settings panel when Config is clicked', async () => {
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Config'));
    expect(screen.getByText('Fréquence')).toBeInTheDocument();
    expect(screen.getByText('Expression personnalisée')).toBeInTheDocument();
    expect(screen.getByText('Sauvegarder')).toBeInTheDocument();
  });

  it('shows cron schedule presets in settings', async () => {
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Config'));
    expect(screen.getByText('Toutes les minutes')).toBeInTheDocument();
    expect(screen.getByText('Toutes les 5 min')).toBeInTheDocument();
    expect(screen.getByText('Toutes les heures')).toBeInTheDocument();
    expect(screen.getByText('Chaque jour à 8h')).toBeInTheDocument();
  });

  it('saves settings when Sauvegarder is clicked', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Config'));
    fireEvent.click(screen.getByText('Sauvegarder'));
    await waitFor(() => { expect(mockPost).toHaveBeenCalled(); });
  });

  it('shows empty state when no logs', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/scanner/status') return Promise.resolve({ data: { data: scannerStatus } });
      if (url === '/scanner/logs?limit=10') return Promise.resolve({ data: { data: [] } });
      if (url === '/settings') return Promise.resolve({ data: { data: settingsData } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Aucun scan')).toBeInTheDocument(); });
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
  });

  it('triggers scan API call when Scan button is clicked', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Scan'));
    await waitFor(() => { expect(mockPost).toHaveBeenCalledWith('/scanner/trigger'); });
  });

  it('changes cron schedule when a preset is selected', async () => {
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Config'));
    const presetSelect = screen.getByDisplayValue('Toutes les 5 min');
    fireEvent.change(presetSelect, { target: { value: '0 * * * *' } });
    const customInput = screen.getByPlaceholderText('*/5 * * * *');
    expect(customInput.value).toBe('0 * * * *');
  });

  it('toggles cron enabled/disabled via toggle button', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><CronManager /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Scan Automatique')).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole('button', { name: 'Activé' }));
    await waitFor(() => { expect(mockPut).toHaveBeenCalledWith('/settings/cron_enabled', { value: 'false' }); });
  });
});
