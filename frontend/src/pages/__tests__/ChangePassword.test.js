import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ChangePassword from '../ChangePassword';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: jest.fn() }),
}));

const mockPut = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { put: (...args) => mockPut(...args) },
}));

const renderChangePassword = () => render(<BrowserRouter><ChangePassword /></BrowserRouter>);

describe('ChangePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the form', () => {
    renderChangePassword();
    expect(screen.getByText('Changement de mot de passe requis')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe actuel')).toBeInTheDocument();
    expect(screen.getByLabelText('Nouveau mot de passe')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmer le mot de passe')).toBeInTheDocument();
    expect(screen.getByText('Changer le mot de passe')).toBeInTheDocument();
  });

  it('shows validation error for short password', async () => {
    renderChangePassword();
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText('Le mot de passe doit contenir au moins 8 caractères')).toBeInTheDocument();
    });
  });

  it('shows validation error for mismatched passwords', async () => {
    renderChangePassword();
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'different' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    });
  });

  it('shows validation error for same password', async () => {
    renderChangePassword();
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'samepass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'samepass' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'samepass' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText("Le nouveau mot de passe doit être différent de l'actuel")).toBeInTheDocument();
    });
  });

  it('shows success and redirects on successful change', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    renderChangePassword();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText('Mot de passe changé avec succès')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    }, { timeout: 3000 });
  });

  it('shows error from API on failure', async () => {
    mockPut.mockRejectedValue({
      response: { data: { message: 'Mot de passe actuel incorrect' } }
    });
    renderChangePassword();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'wrongold' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText('Mot de passe actuel incorrect')).toBeInTheDocument();
    });
  });
});
