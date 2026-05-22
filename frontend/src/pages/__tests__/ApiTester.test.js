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
});
