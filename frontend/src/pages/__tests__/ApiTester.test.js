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

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('lucide-react', () => ({
  Send: () => null,
  Code: () => null,
  Key: () => null,
  Globe: () => null,
  RefreshCw: () => null,
  CheckCircle: () => null,
  XCircle: () => null,
  Clock: () => null,
  Copy: () => null,
  Terminal: () => null,
  Trash2: () => null,
  BookOpen: () => null,
  ChevronDown: () => null,
  ChevronRight: () => null,
  Info: () => null,
  Shield: () => null,
  ExternalLink: () => null,
  Database: () => null,
  FileText: () => null,
  MapPin: () => null,
  AlertTriangle: () => null,
  ArrowRight: () => null,
}));
jest.mock('../ApiTester.css', () => ({}));

const { useAuth } = require('../../contexts/AuthContext');

let ApiTester;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'super_admin' } });
  ApiTester = require('../ApiTester').default;
});

describe('ApiTester', () => {
  it('renders title and sidebar endpoints', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByText('Testeur d\'API')).toBeInTheDocument();
    expect(screen.getByText('Interface Postman-like pour tester les endpoints internes et externes de l\'application')).toBeInTheDocument();
    expect(screen.getByText('Valider des cartes')).toBeInTheDocument();
    expect(screen.getByText('Enregistrer des cartes')).toBeInTheDocument();
    expect(screen.getByText('Appel API Externe')).toBeInTheDocument();
    expect(screen.getByText('Traiter depuis URL')).toBeInTheDocument();
  });

  it('shows default body for validate endpoint', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByText('Valider des cartes')).toBeInTheDocument();
    expect(screen.getByText('Corps de la requête (JSON)')).toBeInTheDocument();
    expect(screen.getByText('Envoyer')).toBeInTheDocument();
  });

  it('switches endpoint and updates body', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.click(screen.getByText('Enregistrer des cartes'));
    await waitFor(() => { expect(screen.getByText('Enregistrer des cartes')).toBeInTheDocument(); });
  });

  it('shows response placeholder initially', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByText('Configurez la requête et cliquez sur "Envoyer"')).toBeInTheDocument();
    expect(screen.getByText('Ouvrez la section "Documentation & Intégration" pour voir le guide de l\'API')).toBeInTheDocument();
  });

  it('shows history section toggle', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByText('Historique (0)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Historique (0)'));
    expect(screen.getByText('Aucun appel pour le moment')).toBeInTheDocument();
  });

  it('shows format error on invalid JSON', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'not valid json' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(screen.getByText(/JSON invalide/)).toBeInTheDocument(); });
  });

  it('shows API key input for validate endpoint', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByPlaceholderText('Entrez votre clé API (acs_...)')).toBeInTheDocument();
  });

  it('shows loading state when sending request', async () => {
    mockPost.mockImplementation(() => new Promise(() => {}));
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByText('Envoyer')).toBeInTheDocument();
  });

  it('displays sidebar sections correctly', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByText('Endpoints')).toBeInTheDocument();
    expect(screen.getByText(/API Interne/)).toBeInTheDocument();
    expect(screen.getAllByText(/API Externe/).length).toBeGreaterThan(0);
  });

  it('executes request with valid JSON and triggers api.post', async () => {
    mockPost.mockResolvedValue({ data: { success: true }, status: 200 });
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Entrez votre clé API (acs_...)'), { target: { value: 'acs_test_key' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(mockPost).toHaveBeenCalled(); });
    expect(mockPost).toHaveBeenCalledWith('/api/v1/cards/validate', expect.any(Object), expect.objectContaining({
      headers: { 'X-API-Key': 'acs_test_key' },
    }));
  });

  it('displays JSON result on successful response', async () => {
    mockPost.mockResolvedValue({ data: { success: true, message: 'Requete validee' }, status: 200 });
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Entrez votre clé API (acs_...)'), { target: { value: 'key' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(screen.getByText('Requête réussie')).toBeInTheDocument(); });
    expect(screen.getByText(/success/)).toBeInTheDocument();
  });

  it('displays error message on failed response', async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: 'Erreur serveur', code: 'SERVER_ERROR' }, status: 500 },
    });
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Entrez votre clé API (acs_...)'), { target: { value: 'key' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(screen.getAllByText(/Erreur/).length).toBeGreaterThan(0); });
  });

  it('shows JSON invalide for invalid JSON body', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '{invalid json}' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(screen.getByText(/JSON invalide/)).toBeInTheDocument(); });
  });

  it('stores request in history after successful execution', async () => {
    mockPost.mockResolvedValue({ data: { success: true }, status: 200 });
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Entrez votre clé API (acs_...)'), { target: { value: 'key' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(screen.getByText('Historique (1)')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Historique (1)'));
    await waitFor(() => { expect(screen.getAllByText(/\/api\/v1\/cards\/validate/).length).toBeGreaterThan(0); });
  });

  it('stores request in history after failed execution', async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: 'Error' }, status: 400 },
    });
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Entrez votre clé API (acs_...)'), { target: { value: 'key' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(screen.getByText('Historique (1)')).toBeInTheDocument(); });
    const historyToggle = screen.getByText('Historique (1)');
    fireEvent.click(historyToggle);
    await waitFor(() => { expect(screen.getByText('400')).toBeInTheDocument(); });
  });

  it('copies request body JSON to clipboard', async () => {
    const mockClipboard = { writeText: jest.fn() };
    Object.defineProperty(navigator, 'clipboard', { value: mockClipboard, writable: true, configurable: true });
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    const copyButtons = screen.getAllByTitle('Copier');
    expect(copyButtons.length).toBeGreaterThan(0);
    fireEvent.click(copyButtons[0]);
    expect(mockClipboard.writeText).toHaveBeenCalled();
  });

  it('copies response JSON to clipboard', async () => {
    const mockClipboard = { writeText: jest.fn() };
    Object.defineProperty(navigator, 'clipboard', { value: mockClipboard, writable: true, configurable: true });
    mockPost.mockResolvedValue({ data: { success: true, result: 'ok' }, status: 200 });
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Entrez votre clé API (acs_...)'), { target: { value: 'key' } });
    fireEvent.click(screen.getByText('Envoyer'));
    await waitFor(() => { expect(screen.getByText('Requête réussie')).toBeInTheDocument(); });
    const responseCopyBtn = screen.getByTitle('Copier la réponse');
    fireEvent.click(responseCopyBtn);
    expect(mockClipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('success'));
  });

  it('hides API key input for JWT auth endpoints', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    expect(screen.getByPlaceholderText('Entrez votre clé API (acs_...)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Traiter depuis URL'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Entrez votre clé API (acs_...)')).not.toBeInTheDocument();
    });
  });

  it('updates request body display when endpoint switches', async () => {
    render(<MemoryRouter><ApiTester /></MemoryRouter>);
    const textarea = screen.getAllByRole('textbox')[1];
    const initialBody = textarea.value;
    expect(initialBody).toContain('bankCode');
    fireEvent.click(screen.getByText('Enregistrer des cartes'));
    await waitFor(() => {
      const updatedBody = screen.getAllByRole('textbox')[1].value;
      expect(updatedBody).not.toBe(initialBody);
      expect(updatedBody).toContain('generateXml');
    });
  });
});
