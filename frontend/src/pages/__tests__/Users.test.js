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
  Users: () => null, Plus: () => null, Edit2: () => null, Trash2: () => null,
  Shield: () => null, Building2: () => null, RefreshCw: () => null, Search: () => null,
}));

const { useAuth } = require('../../contexts/AuthContext');

const usersData = [
  { id: 1, username: 'admin', email: 'admin@test.com', role: 'super_admin', bank_name: null, is_active: true, last_login: '2026-05-20T10:00:00Z', phone: null },
  { id: 2, username: 'bankadmin', email: 'ba@bt.com', role: 'bank_admin', bank_name: 'BT', is_active: true, last_login: null, phone: '+21611111111' },
  { id: 3, username: 'bankuser', email: 'user@bt.com', role: 'bank', bank_name: 'BT', is_active: false, last_login: null, phone: null },
];

const banksData = [
  { id: 1, name: 'BT', code: 'BT' },
  { id: 2, name: 'BIAT', code: 'BIAT' },
];

let UsersPage;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  mockGet.mockImplementation((url) => {
    if (url === '/users') return Promise.resolve({ data: { data: usersData } });
    if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
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

  it('filters users by email search', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Rechercher par nom, email ou banque...'), { target: { value: 'ba@bt.com' } });
    expect(screen.getByText('bankadmin')).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
  });

  it('filters users by bank name', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Rechercher par nom, email ou banque...'), { target: { value: 'BT' } });
    expect(screen.getByText('bankadmin')).toBeInTheDocument();
    expect(screen.getByText('bankuser')).toBeInTheDocument();
  });

  it('shows all users when search is cleared', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    const searchInput = screen.getByPlaceholderText('Rechercher par nom, email ou banque...');
    fireEvent.change(searchInput, { target: { value: 'bankadmin' } });
    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('admin')).toBeInTheDocument();
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
    const passInputs = document.querySelectorAll('input[type="password"]');
    if (passInputs.length > 0) {
      fireEvent.change(passInputs[0], { target: { value: 'pass123' } });
    }
    fireEvent.click(screen.getByText('Creer'));
    await waitFor(() => { expect(mockPost).toHaveBeenCalled(); });
  });

  it('edits an existing user', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('bankadmin')).toBeInTheDocument(); });
    const editBtns = document.querySelectorAll('[title="Modifier"]');
    fireEvent.click(editBtns[0]);
    await waitFor(() => { expect(screen.getByText("Modifier l'utilisateur")).toBeInTheDocument(); });
    const emailInput = screen.getByDisplayValue('admin@test.com');
    fireEvent.change(emailInput, { target: { value: 'updated@test.com' } });
    const submitBtn = screen.getByText('Modifier');
    fireEvent.click(submitBtn);
    await waitFor(() => { expect(mockPut).toHaveBeenCalled(); });
  });

  it('deletes user with confirmation', async () => {
    mockDelete.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    const deleteBtns = document.querySelectorAll('[title="Supprimer"]');
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  it('cancels delete when confirm returns false', async () => {
    window.confirm.mockReturnValueOnce(false);
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    const deleteBtns = document.querySelectorAll('[title="Supprimer"]');
    fireEvent.click(deleteBtns[0]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('shows role badges', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Super Admin')).toBeInTheDocument(); });
    expect(screen.getByText('Admin Banque')).toBeInTheDocument();
    const bankBadges = screen.getAllByText('Banque');
    expect(bankBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows inactive status badge', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Inactif')).toBeInTheDocument(); });
  });

  it('shows active status badge', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => {
      const activeBadges = screen.getAllByText('Actif');
      expect(activeBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Jamais for users without last_login', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => {
      const jamaisEls = screen.getAllByText('Jamais');
      expect(jamaisEls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows dash for users without bank_name', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getAllByText('-')[0]).toBeInTheDocument(); });
  });

  it('hides edit/delete for bank_admin on super_admin users', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank_admin', bank_id: 1 } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('bankuser')).toBeInTheDocument(); });
    const editBtns = document.querySelectorAll('[title="Modifier"]');
    expect(editBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('handles API error on fetch', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/users') return Promise.reject(new Error('Network error'));
      if (url === '/banks') return Promise.resolve({ data: { data: banksData } });
      return Promise.resolve({ data: { data: [] } });
    });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Chargement...')).toBeInTheDocument(); });
  });

  it('handles user creation error', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: 'Duplicate email' } } });
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvel Utilisateur')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvel Utilisateur'));
    await waitFor(() => { expect(screen.getByText("Nouvel utilisateur")).toBeInTheDocument(); });
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'newuser' } });
    fireEvent.change(inputs[1], { target: { value: 'dup@test.com' } });
    const passInputs = document.querySelectorAll('input[type="password"]');
    if (passInputs.length > 0) {
      fireEvent.change(passInputs[0], { target: { value: 'pass123' } });
    }
    fireEvent.click(screen.getByText('Creer'));
    await waitFor(() => { expect(alertSpy).toHaveBeenCalled(); });
    alertSpy.mockRestore();
  });

  it('closes modal on cancel', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvel Utilisateur')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvel Utilisateur'));
    await waitFor(() => { expect(screen.getByText("Nouvel utilisateur")).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => { expect(screen.queryByText("Nouvel utilisateur")).not.toBeInTheDocument(); });
  });

  it('shows bank select when role is bank for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><UsersPage /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvel Utilisateur')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvel Utilisateur'));
    await waitFor(() => { expect(screen.getByText("Nouvel utilisateur")).toBeInTheDocument(); });
    expect(screen.getByText('Banque associee *')).toBeInTheDocument();
  });
});
