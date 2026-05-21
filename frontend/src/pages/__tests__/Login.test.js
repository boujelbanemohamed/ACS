import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../Login';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockLogin = jest.fn();
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

const renderLogin = () => render(<BrowserRouter><Login /></BrowserRouter>);

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form', () => {
    renderLogin();
    expect(screen.getByText('Banking CSV Processor')).toBeInTheDocument();
    expect(screen.getByLabelText("Nom d'utilisateur")).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
  });

  it('displays forgot password link', () => {
    renderLogin();
    expect(screen.getByText('Mot de passe oublié ?')).toBeInTheDocument();
  });

  it('navigates to dashboard on successful login', async () => {
    mockLogin.mockResolvedValue({ success: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Admin@123' } });
    fireEvent.click(screen.getByText('Se connecter'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('navigates to change-password when required', async () => {
    mockLogin.mockResolvedValue({ success: true, must_change_password: true });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'Admin@123' } });
    fireEvent.click(screen.getByText('Se connecter'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/change-password');
    });
  });

  it('shows error message on failed login', async () => {
    mockLogin.mockResolvedValue({ success: false, error: 'Identifiants invalides' });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Se connecter'));

    await waitFor(() => {
      expect(screen.getByText('Identifiants invalides')).toBeInTheDocument();
    });
  });

  it('disables inputs and button while loading', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}));
    renderLogin();

    fireEvent.click(screen.getByText('Se connecter'));

    await waitFor(() => {
      expect(screen.getByText('Connexion...')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });
});
