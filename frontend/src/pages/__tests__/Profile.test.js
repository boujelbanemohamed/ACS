import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockPut = jest.fn();

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), put: (...args) => mockPut(...args) },
}));

jest.mock('../../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('lucide-react', () => ({
  User: () => null, Mail: () => null, Phone: () => null,
  Lock: () => null, Save: () => null, Eye: () => null, EyeOff: () => null,
}));

const { useAuth } = require('../../contexts/AuthContext');

let Profile;
beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: { username: 'admin', role: 'super_admin', bank_name: null, email: 'admin@test.com' } });
  mockGet.mockResolvedValue({
    data: { success: true, data: { email: 'admin@test.com', phone: '+21612345678' } },
  });
  Profile = require('../Profile').default;
});

describe('Profile', () => {
  it('renders profile page', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Mon Profil')).toBeInTheDocument(); });
  });

  it('displays user info from auth context', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    expect(screen.getByText('Super Administrateur')).toBeInTheDocument();
  });

  it('shows profile form fields from API', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument(); });
    expect(screen.getByDisplayValue('+21612345678')).toBeInTheDocument();
  });

  it('displays bank name for bank user', async () => {
    useAuth.mockReturnValue({ user: { username: 'bankuser', role: 'bank', bank_name: 'BT', email: 'user@bt.com' } });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Utilisateur Banque')).toBeInTheDocument(); });
    expect(screen.getByText('Banque: BT')).toBeInTheDocument();
  });

  it('updates profile on submit', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => {
      expect(screen.getByText('Profil mis a jour avec succes!')).toBeInTheDocument();
    });
  });

  it('handles profile update error', async () => {
    mockPut.mockRejectedValue({ response: { data: { message: 'Email invalide' } } });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => {
      expect(screen.getByText('Email invalide')).toBeInTheDocument();
    });
  });

  it('handles profile update network error', async () => {
    mockPut.mockRejectedValue(new Error('Network error'));
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => {
      expect(screen.getByText('Erreur lors de la mise a jour')).toBeInTheDocument();
    });
  });

  it('validates password mismatch', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Informations personnelles')).toBeInTheDocument(); });
    const passInputs = document.querySelectorAll('input[type="password"]');
    if (passInputs.length >= 3) {
      fireEvent.change(passInputs[1], { target: { value: 'newpass123' } });
      fireEvent.change(passInputs[2], { target: { value: 'different456' } });
    }
    const pwBtns = screen.getAllByText('Changer le mot de passe');
    const submitBtn = pwBtns[pwBtns.length - 1];
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    });
  });

  it('validates password length requirement', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Informations personnelles')).toBeInTheDocument(); });
    const passInputs = document.querySelectorAll('input[type="password"]');
    if (passInputs.length >= 3) {
      fireEvent.change(passInputs[0], { target: { value: 'oldpass' } });
      fireEvent.change(passInputs[1], { target: { value: '12' } });
      fireEvent.change(passInputs[2], { target: { value: '12' } });
    }
    const pwBtns = screen.getAllByText('Changer le mot de passe');
    const submitBtn = pwBtns[pwBtns.length - 1];
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText('Le mot de passe doit contenir au moins 6 caracteres')).toBeInTheDocument();
    });
  });

  it('submits change password successfully', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Informations personnelles')).toBeInTheDocument(); });
    const passInputs = document.querySelectorAll('input[type="password"]');
    if (passInputs.length >= 3) {
      fireEvent.change(passInputs[0], { target: { value: 'oldpass' } });
      fireEvent.change(passInputs[1], { target: { value: 'newpass123' } });
      fireEvent.change(passInputs[2], { target: { value: 'newpass123' } });
    }
    const pwBtns = screen.getAllByText('Changer le mot de passe');
    const submitBtn = pwBtns[pwBtns.length - 1];
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText('Mot de passe modifie avec succes!')).toBeInTheDocument();
    });
  });

  it('handles change password error', async () => {
    mockPut.mockRejectedValue({ response: { data: { message: 'Ancien mot de passe incorrect' } } });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Informations personnelles')).toBeInTheDocument(); });
    const passInputs = document.querySelectorAll('input[type="password"]');
    if (passInputs.length >= 3) {
      fireEvent.change(passInputs[0], { target: { value: 'wrongold' } });
      fireEvent.change(passInputs[1], { target: { value: 'newpass123' } });
      fireEvent.change(passInputs[2], { target: { value: 'newpass123' } });
    }
    const pwBtns = screen.getAllByText('Changer le mot de passe');
    const submitBtn = pwBtns[pwBtns.length - 1];
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText('Ancien mot de passe incorrect')).toBeInTheDocument();
    });
  });

  it('shows disabled username field', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Mon Profil')).toBeInTheDocument(); });
    const usernameInput = screen.getByDisplayValue('admin');
    expect(usernameInput).toBeDisabled();
  });

  it('updates email field on change', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument(); });
    const emailInput = screen.getByDisplayValue('admin@test.com');
    fireEvent.change(emailInput, { target: { value: 'new@test.com' } });
    expect(screen.getByDisplayValue('new@test.com')).toBeInTheDocument();
  });

  it('renders both form sections', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('Informations personnelles')).toBeInTheDocument();
      const pwHeadings = screen.getAllByText('Changer le mot de passe');
      expect(pwHeadings.length).toBeGreaterThanOrEqual(2);
    });
  });
});
