import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ChangePassword from '../ChangePassword';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockLogout = jest.fn();
const mockUpdateToken = jest.fn();
const mockClearMustChange = jest.fn();
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout, updateToken: mockUpdateToken, clearMustChangePassword: mockClearMustChange }),
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
      expect(screen.getByText(/au moins 8 caractères dont une minuscule, une majuscule, un chiffre et un caractère spécial/)).toBeInTheDocument();
    });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('rejects a long password without special character', async () => {
    renderChangePassword();
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'OldPass@1' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'Newpassword123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'Newpassword123' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText(/caractère spécial/)).toBeInTheDocument();
    });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('shows validation error for mismatched passwords', async () => {
    renderChangePassword();
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'oldpass' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'NewPass@123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'Different@123' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    });
  });

  it('shows validation error for same password', async () => {
    renderChangePassword();
    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'SamePass@1' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'SamePass@1' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'SamePass@1' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText("Le nouveau mot de passe doit être différent de l'actuel")).toBeInTheDocument();
    });
  });

  it('keeps the session with the new token and goes to the dashboard', async () => {
    mockPut.mockResolvedValue({ data: { success: true, data: { token: 'new-jwt' } } });
    renderChangePassword();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'OldPass@1' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'NewPass@123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'NewPass@123' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText('Mot de passe changé avec succès')).toBeInTheDocument();
    });
    expect(mockUpdateToken).toHaveBeenCalledWith('new-jwt');
    expect(mockClearMustChange).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    }, { timeout: 3000 });
  });

  it('logs out and redirects to login when no new token is returned', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    renderChangePassword();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'OldPass@1' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'NewPass@123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'NewPass@123' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { passwordChanged: true }, replace: true });
    }, { timeout: 3000 });
  });

  it('shows error from API on failure', async () => {
    mockPut.mockRejectedValue({
      response: { data: { message: 'Mot de passe actuel incorrect' } }
    });
    renderChangePassword();

    fireEvent.change(screen.getByLabelText('Mot de passe actuel'), { target: { value: 'WrongOld@1' } });
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: 'NewPass@123' } });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: 'NewPass@123' } });
    fireEvent.click(screen.getByText('Changer le mot de passe'));

    await waitFor(() => {
      expect(screen.getByText('Mot de passe actuel incorrect')).toBeInTheDocument();
    });
  });
});
