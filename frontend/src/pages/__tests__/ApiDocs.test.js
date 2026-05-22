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
jest.mock('../ApiDocs.css', () => ({}));

const { useAuth } = require('../../contexts/AuthContext');

const mockApiData = {
  version: '1.0.0',
  baseUrl: '/api/v1',
  description: 'API de gestion des cartes bancaires',
  groups: {
    cards: {
      title: 'Cartes Bancaires',
      description: 'Gestion des cartes',
      basePath: '/api/v1/cards',
      endpoints: [
        { method: 'GET', path: '/list', description: 'Liste des cartes', auth: 'jwt', roles: ['admin'] },
        { method: 'POST', path: '/create', description: 'Créer une carte', auth: 'jwt', roles: ['admin'] },
      ],
    },
  },
};

let ApiDocs;
beforeEach(() => {
  jest.clearAllMocks();
  ApiDocs = require('../ApiDocs').default;
});

describe('ApiDocs', () => {
  it('shows access denied for non super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank' } });
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    expect(screen.getByText('Accès réservé')).toBeInTheDocument();
    expect(screen.getByText('Cette section est accessible uniquement aux super administrateurs.')).toBeInTheDocument();
  });

  it('shows loading state for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    expect(screen.getByText('Chargement de la documentation...')).toBeInTheDocument();
  });

  it('renders API documentation when data loads', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockResolvedValue({ data: { data: mockApiData } });
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Documentation API')).toBeInTheDocument(); });
    expect(screen.getAllByText('Cartes Bancaires').length).toBeGreaterThan(0);
    expect(screen.getByText('Liste des cartes')).toBeInTheDocument();
    expect(screen.getByText('Créer une carte')).toBeInTheDocument();
  });

  it('shows search input and endpoint count', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockResolvedValue({ data: { data: mockApiData } });
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Documentation API')).toBeInTheDocument(); });
    expect(screen.getByPlaceholderText('Rechercher un endpoint, une ressource...')).toBeInTheDocument();
    expect(screen.getByText('2 endpoints')).toBeInTheDocument();
  });

  it('filters endpoints by search', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockResolvedValue({ data: { data: mockApiData } });
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Documentation API')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Rechercher un endpoint, une ressource...'), { target: { value: 'Créer' } });
    expect(screen.getByText('Créer une carte')).toBeInTheDocument();
  });

  it('shows no results when search has no matches', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockResolvedValue({ data: { data: mockApiData } });
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Documentation API')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Rechercher un endpoint, une ressource...'), { target: { value: 'zzzzz' } });
    expect(screen.getByText(/Aucun endpoint trouvé/)).toBeInTheDocument();
  });

  it('shows error when API call fails', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockRejectedValue({ response: { data: { message: 'Erreur serveur' } } });
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Erreur serveur')).toBeInTheDocument(); });
  });

  it('renders API version and base URL', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    mockGet.mockResolvedValue({ data: { data: mockApiData } });
    render(<MemoryRouter><ApiDocs /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Documentation API')).toBeInTheDocument(); });
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('/api/v1')).toBeInTheDocument();
  });
});
