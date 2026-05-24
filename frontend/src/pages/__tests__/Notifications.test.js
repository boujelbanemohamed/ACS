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

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  Mail: () => null,
  Settings: () => null,
  Send: () => null,
  Plus: () => null,
  Trash2: () => null,
  ToggleLeft: () => null,
  ToggleRight: () => null,
  TestTube: () => null,
  RefreshCw: () => null,
  CheckCircle: () => null,
  XCircle: () => null,
  Clock: () => null,
  Calendar: () => null,
}));

jest.mock('../Notifications.css', () => ({}));

const { useAuth } = require('../../contexts/AuthContext');
const Notifications = require('../Notifications').default;

const defaultMockGet = (url) => {
  if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
  if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
  if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
  if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
  if (url.includes('emails')) return Promise.resolve({ data: { data: [] } });
  return Promise.resolve({ data: { data: [] } });
};

describe('Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation(defaultMockGet);
  });

  it('shows access denied for non super_admin', () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    expect(screen.getByText('Acces refuse')).toBeInTheDocument();
  });

  it('renders the full page for super_admin', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Notifications Email')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Configuration SMTP/).length).toBeGreaterThan(0);
    expect(screen.getByText('Historique des envois')).toBeInTheDocument();
  });

  it('displays loading state initially', () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockImplementation(() => new Promise(() => {}));
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    expect(screen.getByText('Chargement...')).toBeInTheDocument();
  });

  it('saves SMTP configuration on form submit', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.change(screen.getByPlaceholderText('smtp.example.com'), { target: { value: 'smtp.gmail.com' } });
    fireEvent.change(screen.getByDisplayValue(587), { target: { value: '465' } });
    fireEvent.change(screen.getByPlaceholderText('user@example.com'), { target: { value: 'admin@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('noreply@example.com'), { target: { value: 'noreply@test.com' } });
    fireEvent.change(screen.getByDisplayValue('ACS Banking System'), { target: { value: 'Test Sender' } });

    fireEvent.click(screen.getByText('Sauvegarder'));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/smtp', expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        username: 'admin@test.com',
        from_email: 'noreply@test.com',
        from_name: 'Test Sender',
      }));
    });
  });

  it('tests SMTP connection and shows result', async () => {
    mockPost.mockResolvedValue({ data: { success: true, message: 'Connexion reussie' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Tester connexion'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/smtp/test');
    });
    await waitFor(() => {
      expect(screen.getByText('Connexion reussie')).toBeInTheDocument();
    });
  });

  it('pre-fills SMTP form with existing config', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: { host: 'smtp.gmail.com', port: 465, username: 'admin@test.com', from_email: 'noreply@test.com', from_name: 'Custom Name', enabled: true } } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByDisplayValue('smtp.gmail.com')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(465)).toBeInTheDocument();
    expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('noreply@test.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Custom Name')).toBeInTheDocument();
  });

  it('adds a notification email', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.change(screen.getByPlaceholderText('Ajouter un email...'), { target: { value: 'newbank@test.com' } });
    fireEvent.click(screen.getByText('Ajouter'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/emails/1', { email: 'newbank@test.com' });
    });
  });

  it('deletes a notification email after confirmation', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [{ id: 1, email: 'test@test.com', is_active: true }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('test@test.com')).toBeInTheDocument(); });

    fireEvent.click(screen.getByTitle('Supprimer'));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/notifications/emails/1');
    });
  });

  it('toggles notification email active status', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [{ id: 1, email: 'test@test.com', is_active: true }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('test@test.com')).toBeInTheDocument(); });

    fireEvent.click(screen.getByTitle('Desactiver'));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/emails/1/toggle');
    });
  });

  it('sends daily report for selected bank', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer rapport'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/send/1');
    });
  });

  it('sends report to all banks after confirmation', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer a toutes les banques'));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/notifications/send-all');
    });
  });

  it('saves cron schedule configuration', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.change(screen.getByDisplayValue('08'), { target: { value: '12' } });
    fireEvent.change(screen.getByDisplayValue('00'), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Sauvegarder la planification'));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/cron-config', {
        schedule: '30 12 * * *',
        enabled: true,
      });
    });
  });

  it('toggles cron enabled/disabled', async () => {
    const { container } = render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(container.querySelector('.toggle-btn'));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith('/notifications/cron-config', {
        schedule: '00 08 * * *',
        enabled: false,
      });
    });
  });

  it('shows empty SMTP form when no config exists', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    expect(screen.getByDisplayValue(587)).toBeInTheDocument();
    expect(screen.getByDisplayValue('ACS Banking System')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('smtp.example.com')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.queryByText('Chargement...')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Notifications Email')).toBeInTheDocument();
  });

  it('renders logs table with data', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [{ id: 1, sent_at: '2025-01-15T10:00:00Z', bank_name: 'BT', email: 'test@test.com', subject: 'Rapport Quotidien', status: 'sent' }, { id: 2, sent_at: '2025-01-15T09:00:00Z', bank_name: 'ATB', email: 'admin@test.com', subject: 'Rapport', status: 'failed' }] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Historique des envois')).toBeInTheDocument(); });

    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Banque')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Sujet')).toBeInTheDocument();
    expect(screen.getByText('Statut')).toBeInTheDocument();
    expect(screen.getByText('Rapport Quotidien')).toBeInTheDocument();
    expect(screen.getByText('Envoye')).toBeInTheDocument();
    expect(screen.getByText('Echec')).toBeInTheDocument();
  });

  it('opens email preview modal', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Apercu du template'));
    await waitFor(() => {
      expect(screen.getByText('Aperçu du Template Email')).toBeInTheDocument();
    });
  });

  it('closes email preview modal via close button', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Apercu du template'));
    await waitFor(() => {
      expect(screen.getByText('Aperçu du Template Email')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('×'));
    await waitFor(() => {
      expect(screen.queryByText('Aperçu du Template Email')).not.toBeInTheDocument();
    });
  });

  it('closes email preview modal via overlay click', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Apercu du template'));
    await waitFor(() => {
      expect(screen.getByText('Aperçu du Template Email')).toBeInTheDocument();
    });

    const overlay = document.querySelector('.modal-overlay');
    fireEvent.click(overlay);
    await waitFor(() => {
      expect(screen.queryByText('Aperçu du Template Email')).not.toBeInTheDocument();
    });
  });

  it('shows alert when saving SMTP fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockPut.mockRejectedValue({ response: { data: { message: 'SMTP error' } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Sauvegarder'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('SMTP error'));
    });
  });

  it('shows error message when SMTP test fails', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: 'Connection failed' } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Tester connexion'));
    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });
  });

  it('shows alert when adding invalid email (empty)', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Ajouter'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Email invalide');
    });
  });

  it('shows alert when adding invalid email (no @)', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.change(screen.getByPlaceholderText('Ajouter un email...'), { target: { value: 'invalid-email' } });
    fireEvent.click(screen.getByText('Ajouter'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Email invalide');
    });
  });

  it('shows alert when adding email API fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockPost.mockRejectedValue({ response: { data: { message: 'API error' } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.change(screen.getByPlaceholderText('Ajouter un email...'), { target: { value: 'test@test.com' } });
    fireEvent.click(screen.getByText('Ajouter'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('API error'));
    });
  });

  it('shows alert when deleting email API fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [{ id: 1, email: 'test@test.com', is_active: true }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    mockDelete.mockRejectedValue({ response: { data: { message: 'Delete error' } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('test@test.com')).toBeInTheDocument(); });

    fireEvent.click(screen.getByTitle('Supprimer'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Delete error'));
    });
  });

  it('shows alert when toggling email API fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [{ id: 1, email: 'test@test.com', is_active: true }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    mockPut.mockRejectedValue({ response: { data: { message: 'Toggle error' } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('test@test.com')).toBeInTheDocument(); });

    fireEvent.click(screen.getByTitle('Desactiver'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Toggle error'));
    });
  });

  it('shows alert when send report returns success: false', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockPost.mockResolvedValue({ data: { success: false, message: 'No data to send' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer rapport'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('No data to send'));
    });
  });

  it('shows alert when send report API fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockPost.mockResolvedValue({ data: { success: false, message: 'Erreur' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer rapport'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Erreur'));
    });
  });

  it('shows alert when send all reports returns success: false', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost.mockResolvedValue({ data: { success: false, message: 'All failed' } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer a toutes les banques'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('All failed'));
    });
  });

  it('shows alert when send all reports API fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost.mockRejectedValue({ response: { data: { message: 'Network error' } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer a toutes les banques'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });
  });

  it('shows alert when saving cron config API fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockPut.mockRejectedValue({ response: { data: { message: 'Cron error' } } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Sauvegarder la planification'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Cron error'));
    });
  });

  it('shows alert when toggling cron API fails', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    const { container } = render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });
    mockPut.mockRejectedValue({ response: { data: { message: 'Toggle cron error' } } });

    fireEvent.click(container.querySelector('.toggle-btn'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Toggle cron error'));
    });
  });

  it('fetches bank emails on bank select change', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }, { id: 2, name: 'ATB' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [{ id: 1, email: 'test@test.com', is_active: true }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    const bankSelect = screen.getByDisplayValue('BT');
    fireEvent.change(bankSelect, { target: { value: '2' } });
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/notifications/emails/2');
    });
  });

  it('renders cron config with existing data', async () => {
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: { host: 'smtp.gmail.com', port: 465, username: 'admin@test.com', from_email: 'noreply@test.com', from_name: 'Custom', enabled: true } } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: { schedule: '0 12 * * *', enabled: true } } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/12:00/)).toBeInTheDocument();
    });
  });

  it('shows empty logs state when no logs', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });
    expect(screen.getByText('Aucun envoi')).toBeInTheDocument();
  });

  it('deletes email early return when confirm cancelled', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.resolve({ data: { data: [{ id: 1, email: 'test@test.com', is_active: true }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('test@test.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Supprimer'));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('sends all reports early return when confirm cancelled', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer a toutes les banques'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('checks test SMTP result shows error from network error', async () => {
    mockPost.mockRejectedValue(new Error('Network failure'));
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Tester connexion'));
    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  it('logs error when fetchBankEmails fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet.mockImplementation((url) => {
      if (url.includes('smtp')) return Promise.resolve({ data: { data: null } });
      if (url.includes('logs')) return Promise.resolve({ data: { data: [] } });
      if (url.includes('cron')) return Promise.resolve({ data: { data: null } });
      if (url.includes('banks')) return Promise.resolve({ data: { data: [{ id: 1, name: 'BT' }] } });
      if (url.includes('emails')) return Promise.reject(new Error('Network error'));
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error fetching bank emails:', expect.any(Error));
    });
    consoleSpy.mockRestore();
  });

  it('handles send report success path', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer rapport'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Rapport envoye avec succes!');
    });
    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(5);
    });
  });

  it('handles send all reports success path', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Envoyer a toutes les banques'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Rapports envoyes!');
    });
    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(5);
    });
  });

  it('handles save cron config success', async () => {
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    const cronData = { schedule: '30 12 * * *', enabled: true, nextRun: '2025-06-01T10:00:00Z' };
    mockPut.mockResolvedValue({ data: { success: true, data: cronData } });
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.change(screen.getByDisplayValue('08'), { target: { value: '12' } });
    fireEvent.change(screen.getByDisplayValue('00'), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Sauvegarder la planification'));
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Configuration du cron sauvegardee!');
    });
  });

  it('handles toggle cron success', async () => {
    const { container } = render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    mockPut.mockResolvedValue({ data: { success: true, data: { schedule: '00 08 * * *', enabled: false, nextRun: null } } });

    fireEvent.click(container.querySelector('.toggle-btn'));
    await waitFor(() => {
      expect(screen.getByText('Inactif')).toBeInTheDocument();
    });
  });

  it('changes secure select value', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    const secureSelect = screen.getByDisplayValue('Non');
    fireEvent.change(secureSelect, { target: { value: 'true' } });
    expect(screen.getByDisplayValue('Oui')).toBeInTheDocument();
  });

  it('fills password field', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    fireEvent.change(screen.getByPlaceholderText('Laisser vide pour ne pas changer'), { target: { value: 'newpassword' } });
    expect(screen.getByDisplayValue('newpassword')).toBeInTheDocument();
  });

  it('toggles enabled checkbox', async () => {
    render(<MemoryRouter><Notifications /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Notifications Email')).toBeInTheDocument(); });

    const checkbox = screen.getByLabelText('Activer les notifications email');
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
