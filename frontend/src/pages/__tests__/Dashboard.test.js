import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'super_admin', username: 'admin', bank_id: null } }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

const mockGet = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args) },
}));

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => <div>Bar</div>,
  XAxis: () => <div>XAxis</div>,
  YAxis: () => <div>YAxis</div>,
  CartesianGrid: () => <div>CartesianGrid</div>,
  Tooltip: () => <div>Tooltip</div>,
  Legend: () => <div>Legend</div>,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => <div>Pie</div>,
  Cell: () => <div>Cell</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => <div>Line</div>,
}));

describe('Dashboard', () => {
  beforeEach(() => {
    mockGet.mockClear();
  });

  it('shows loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });

  it('renders welcome message after data loads', async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { totalBanks: 10, totalRecords: 500, todayFiles: 3, pendingErrors: 2, recentActivity: [], bankStats: [] } },
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Bonjour/)).toBeInTheDocument());
  });

  it('renders welcome message even after API error', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Bonjour/)).toBeInTheDocument());
  });
});
