import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
const mockConfirm = jest.fn().mockReturnValue(true);
window.confirm = mockConfirm;

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), post: (...args) => mockPost(...args), put: (...args) => mockPut(...args), delete: (...args) => mockDelete(...args) },
}));

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const { useAuth } = require('../../contexts/AuthContext');

const usersData = [
  { id: 1, username: 'admin', email: 'admin@test.com', role: 'super_admin', bank_name: null, is_active: true, last_login: '2026-05-20T10:00:00Z' },
  { id: 2, username: 'bankadmin', email: 'ba@bt.com', role: 'bank_admin', bank_name: 'BT', is_active: true, last_login: null },
  { id: 3, username: 'bankuser', email: 'user@bt.com', role: 'bank', bank_name: 'BT', is_active: false, last_login: null },
];

let UsersPage;
beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation((url) => {
    if (url === '/users') return Promise.resolve({ data: { data: usersData } });
    if (url === '/banks') return Promise.resolve({ data: { data: [{ id: 1, name: 'BT', code: 'BT' }] } });
    return Promise.resolve({ data: { data: [] } });
  });
  UsersPage = require('../Users').default;
});

describe('Users', () => {
  it('renders users list', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Utilisateurs')).toBeInTheDocument(); });
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('bankadmin')).toBeInTheDocument();
    expect(screen.getByText('bankuser')).toBeInTheDocument();
  });

  it('filters users by search term', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Rechercher par nom, email ou banque...'), { target: { value: 'bankadmin' } });
    expect(screen.getByText('bankadmin')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });

  it('opens creation modal', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvel Utilisateur')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvel Utilisateur'));
    await waitFor(() => { expect(screen.getByText("Nouvel utilisateur")).toBeInTheDocument(); });
  });

  it('creates a new user', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvel Utilisateur')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvel Utilisateur'));
    await waitFor(() => { expect(screen.getByText("Nouvel utilisateur")).toBeInTheDocument(); });
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'newuser' } });
    fireEvent.change(inputs[1], { target: { value: 'new@test.com' } });
    const passInputs = screen.getAllByDisplayValue('');
    if (passInputs.length > 0) {
      fireEvent.change(passInputs[passInputs.length - 1], { target: { value: 'pass123' } });
    }
    fireEvent.click(screen.getByText('Creer'));
    await waitFor(() => { expect(mockPost).toHaveBeenCalled(); });
  });
});
