import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockConfirm = jest.fn().mockReturnValue(true);
window.confirm = mockConfirm;

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), put: (...args) => mockPut(...args), post: (...args) => mockPost(...args), delete: (...args) => mockDelete(...args) },
}));

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

jest.mock('lucide-react', () => ({
  Mail: () => null, Settings: () => null, Send: () => null, Plus: () => null,
  Trash2: () => null, ToggleLeft: () => null, ToggleRight: () => null,
  TestTube: () => null, RefreshCw: () => null, CheckCircle: () => null,
  XCircle: () => null, Clock: () => null, Calendar: () => null,
}));

jest.mock('../Notifications.css', () => ({}));

const { useAuth } = require('../../contexts/AuthContext');

const smtpData = {
  host: 'smtp.gmail.com', port: 587, secure: false,
  username: 'admin@acs.com', from_email: 'noreply@acs.com',
  from_name: 'ACS Banking', enabled: true
};

const banksData = [{ id: 1, code: 'BT', name: 'Banque de Tunisie', is_active: true }];

const bankEmailsData = [
  { id: 1, email: 'user1@bank.com', is_active: true },
  { id: 2, email: 'user2@bank.com', is_active: false }
];

const cronData = { schedule: '30 8 * * *', enabled: true, nextRun: '2025-06-01T08:30:00Z' };

const logsData = [
  { id: 1, bank_name: 'BT', email: 'user@bank.com', subject: 'Rapport Quotidien', status: 'sent', sent_at: '2025-05-22T08:00:00Z' },
  { id: 2, bank_name: 'BIAT', email: 'admin@biat.com', subject: 'Rapport Journalier', status: 'failed', sent_at: '2025-05-21T08:00:00Z' }
];

let Notifications;
beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockReturnValue(true);
  mockGet.mockImplementation((url) => {
    if (url.includes('smtp')) return Promise.resolve({ data: { data: smtpData } });
    if (url.includes('banks')) return Promise.resolve({ data: { data: banksData } });
    if (url.includes('logs')) return Promise.resolve({ data: { data: logsData } });
    if (url.includes('cron-config')) return Promise.resolve({ data: { data: cronData } });
    if (url.includes('/notifications/emails/')) return Promise.resolve({ data: { data: bankEmailsData } });
    return Promise.resolve({ data: { data: [] } });
  });
  Notifications = require('../Notifications').default;
});

describe('Notifications', () => {
  it('renders loading state initially', () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });

  it('super_admin can see full page', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    expect(screen.getByText('Configuration SMTP')).toBeInTheDocument();
    expect(screen.getByText('Emails par banque')).toBeInTheDocument();
    expect(screen.getByText('Envoi Automatique')).toBeInTheDocument();
    expect(screen.getByText('Historique des envois')).toBeInTheDocument();
  });

  it('blocks non-super_admin', () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    expect(screen.getByText('Acces refuse')).toBeInTheDocument();
  });

  it('SMTP form: fetches and pre-fills existing config', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.gmail.com')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('587')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Non')).toBeInTheDocument();
    expect(screen.getByDisplayValue('admin@acs.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('noreply@acs.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ACS Banking')).toBeInTheDocument();
  });

  it('SMTP form: saves config on Sauvegarder click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.gmail.com')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('smtp.gmail.com'), { target: { value: 'smtp.outlook.com' } });
    fireEvent.click(screen.getByText('Sauvegarder'));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/smtp', expect.objectContaining({ host: 'smtp.outlook.com' }));
    });
  });

  it('SMTP form: tests connection on Tester connexion click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockPost.mockResolvedValue({ data: { success: true, message: 'Connexion SMTP reussie!' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Tester connexion'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/smtp/test');
    });
    await waitFor(() => {
      expect(screen.getByText('Connexion SMTP reussie!')).toBeInTheDocument();
    });
  });

  it('Email management: adds email via Ajouter', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Ajouter un email...'), { target: { value: 'new@test.com' } });
    fireEvent.click(screen.getByText('Ajouter'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/emails/1', { email: 'new@test.com' });
    });
  });

  it('Email management: deletes email via trash icon', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    const deleteBtns = await screen.findAllByTitle('Supprimer');
    fireEvent.click(deleteBtns[0]);
    expect(mockConfirm).toHaveBeenCalledWith('Supprimer cet email?');
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/notifications/emails/1');
    });
  });

  it('Email management: toggles email active/inactive', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    const toggleBtn = await screen.findByTitle('Desactiver');
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/emails/1/toggle');
    });
  });

  it('Send report: sends to single bank', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Envoyer rapport'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/send/1');
    });
  });

  it('Send report: sends to all banks', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Envoyer a toutes les banques'));
    expect(mockConfirm).toHaveBeenCalledWith('Envoyer les rapports a toutes les banques?');
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/send-all');
    });
  });

  it('Cron config: loads and displays current schedule', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByDisplayValue('08')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    expect(screen.getByText(/Prochaine execution/)).toBeInTheDocument();
  });

  it('Cron config: saves new schedule on Sauvegarder la planification click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockPut.mockResolvedValue({ data: { success: true, data: { schedule: '45 14 * * *', enabled: true, nextRun: null } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('08'), { target: { value: '14' } });
    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '45' } });
    fireEvent.click(screen.getByText('Sauvegarder la planification'));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/cron-config', { schedule: '45 14 * * *', enabled: true });
    });
  });

  it('Cron config: toggles cron enabled/disabled', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockPut.mockResolvedValue({ data: { success: true, data: { schedule: '30 8 * * *', enabled: false, nextRun: null } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    expect(screen.getByText('Actif')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Actif').nextElementSibling);
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/cron-config', { schedule: '30 08 * * *', enabled: false });
    });
  });

  it('Logs: loads and displays notification logs table', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    expect(screen.getByText('Rapport Quotidien')).toBeInTheDocument();
    expect(screen.getByText('Rapport Journalier')).toBeInTheDocument();
    expect(screen.getByText('Envoye')).toBeInTheDocument();
    expect(screen.getByText('Echec')).toBeInTheDocument();
  });

  it('Logs: empty state when no logs', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: smtpData } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: banksData } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron-config')) return Promise.resolve({ data: { data: cronData } });
      if (url.includes('/notifications/emails/')) return Promise.resolve({ data: { data: bankEmailsData } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    expect(screen.getByText('Aucun envoi')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.queryByText('Chargement...')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Configuration SMTP')).toBeInTheDocument();
  });

  it('Email preview modal opens on Apercu du template click', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Apercu du template'));
    await waitFor(() => {
      expect(screen.getByText('Aperçu du Template Email')).toBeInTheDocument();
    });
  });
});
