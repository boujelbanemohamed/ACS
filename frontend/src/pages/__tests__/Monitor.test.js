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

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
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
    expect(screen.getAllByText('Fonctionnel').length).toBeGreaterThan(0);
    expect(screen.getByText('Base de Données')).toBeInTheDocument();
    expect(screen.getByText('Serveur SMTP')).toBeInTheDocument();
    expect(screen.getByText('Tâche Planifiée')).toBeInTheDocument();
    expect(screen.getByText('Serveur Backend')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Mémoire Serveur')).toBeInTheDocument();
  });

  it('shows SMTP as disabled', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    expect(screen.getByText('Désactivé')).toBeInTheDocument();
    expect(screen.getByText('Configurer SMTP')).toBeInTheDocument();
  });

  it('displays auto-refresh checkbox and interval selector', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('15s')).toBeInTheDocument();
  });

  it('hides interval selector when auto-refresh is off', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Auto'));
    expect(screen.queryByText('5s')).not.toBeInTheDocument();
  });

  it('shows global status section', async () => {
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
    expect(screen.getByText(/production/)).toBeInTheDocument();
  });

  it('changes refresh interval', async () => {
    render(<MemoryRouter><Monitor /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Monitoring Plateforme')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Auto'));
    fireEvent.click(screen.getByText('Auto'));
    expect(screen.getByText('15s')).toBeInTheDocument();
  });
});
