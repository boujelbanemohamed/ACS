import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args) },
}));

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('lucide-react', () => ({
  Building2: () => null, FileText: () => null, CheckCircle: () => null,
  Clock: () => null, Database: () => null, Activity: () => null,
  AlertTriangle: () => null, Zap: () => null, BarChart3: () => null,
  ArrowRight: () => null, RefreshCw: () => null, Inbox: () => null,
  ChevronRight: () => null, Calendar: () => null, Filter: () => null,
}));

const { useAuth } = require('../../contexts/AuthContext');

const dashboardResponse = {
  data: {
    success: true,
    data: {
      totalBanks: '5',
      totalRecords: '15000',
      todayFiles: '12',
      pendingErrors: '3',
      recentActivity: [
        { file_name: 'data_2025.csv', bank_code: 'BT', bank_name: 'Banque de Tunisie', status: 'success', processed_at: '2025-05-22T10:00:00Z', valid_rows: 100, invalid_rows: 2 },
        { file_name: 'clients.csv', bank_code: 'BIAT', bank_name: 'BIAT', status: 'error', processed_at: '2025-05-22T09:00:00Z', valid_rows: 50, invalid_rows: 10 },
      ],
      bankStats: [
        { code: 'BT', name: 'Banque de Tunisie', total_records: 8000, total_files: 40 },
      ],
    },
  },
};

let Dashboard;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'super_admin', username: 'admin', bank_id: null } });
  Dashboard = require('../Dashboard').default;
});

describe('Dashboard', () => {
  it('shows loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });

  it('renders welcome message after data loads', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Bonjour/)).toBeInTheDocument());
  });

  it('renders welcome message even after API error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Bonjour/)).toBeInTheDocument());
  });

  it('displays stats cards with data', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Banques')).toBeInTheDocument();
      expect(screen.getByText('Enregistrements')).toBeInTheDocument();
    });
    const twelves = screen.getAllByText('12');
    expect(twelves.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows recent activity list', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Activité Récente')).toBeInTheDocument());
    expect(screen.getByText('data_2025.csv')).toBeInTheDocument();
    expect(screen.getByText('clients.csv')).toBeInTheDocument();
  });

  it('shows recent activity bank badges', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Activité Récente')).toBeInTheDocument());
    const bts = screen.getAllByText('BT');
    expect(bts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty activity state when no activity', async () => {
    const noActivityRes = {
      data: { ...dashboardResponse.data, data: { ...dashboardResponse.data.data, recentActivity: [] } },
    };
    mockGet.mockResolvedValue(noActivityRes);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Aucune activite recente')).toBeInTheDocument());
  });

  it('renders bank statistics section', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Statistiques par Banque')).toBeInTheDocument());
    const btEntries = screen.getAllByText('Banque de Tunisie');
    expect(btEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('renders quick actions section', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Actions Rapides')).toBeInTheDocument());
    expect(screen.getByText('Gérer les Banques')).toBeInTheDocument();
    expect(screen.getByText('Traiter des Fichiers')).toBeInTheDocument();
  });

  it('shows bank-specific stats for bank_admin role', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin', username: 'bankadmin', bank_id: 1 } });
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Bonjour/)).toBeInTheDocument());
    expect(mockGet).toHaveBeenCalledWith('/dashboard?bankId=1');
  });

  it('shows bank-specific stats for bank role', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', username: 'bankuser', bank_id: 2 } });
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Bonjour/)).toBeInTheDocument());
    expect(mockGet).toHaveBeenCalledWith('/dashboard?bankId=2');
  });

  it('shows error warning when pending errors > 0', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/ligne.*en erreur/)).toBeInTheDocument();
    });
  });

  it('shows all clear message when no pending errors', async () => {
    const noErrorsRes = {
      data: { ...dashboardResponse.data, data: { ...dashboardResponse.data.data, pendingErrors: '0' } },
    };
    mockGet.mockResolvedValue(noErrorsRes);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Tout est en ordre/)).toBeInTheDocument();
    });
  });

  it('toggles date filter', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Filtre Date')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Filtre Date'));
    await waitFor(() => {
      expect(screen.getByText('Appliquer')).toBeInTheDocument();
    });
  });

  it('fetches with date filter params', async () => {
    mockGet.mockResolvedValue(dashboardResponse);
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Filtre Date')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Filtre Date'));
    await waitFor(() => { expect(screen.getByText('Appliquer')).toBeInTheDocument(); });
    await waitFor(() => { expect(screen.queryByText('Chargement...')).not.toBeInTheDocument(); });

    const dateInputs = document.querySelectorAll('input[type="date"]');
    if (dateInputs.length >= 2) {
      fireEvent.change(dateInputs[0], { target: { value: '2025-05-01' } });
      await waitFor(() => { expect(screen.queryByText('Chargement...')).not.toBeInTheDocument(); });
      fireEvent.change(dateInputs[1], { target: { value: '2025-05-22' } });
      await waitFor(() => { expect(screen.queryByText('Chargement...')).not.toBeInTheDocument(); });
    }
    fireEvent.click(screen.getByText('Appliquer'));
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith(expect.stringContaining('dateFrom='));
    });
  });
});
