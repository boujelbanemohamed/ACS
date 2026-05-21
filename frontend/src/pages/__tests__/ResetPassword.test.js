import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = jest.fn();
const mockPost = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams('token=abc123')],
}));
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { post: (...args) => mockPost(...args) },
}));

let ResetPassword;
beforeEach(() => {
  jest.clearAllMocks();
  ResetPassword = require('../ResetPassword').default;
});

describe('ResetPassword', () => {
  it('renders the form with token', () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    expect(screen.getAllByText('Nouveau mot de passe').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByPlaceholderText('Minimum 6 caractères')).toBeInTheDocument();
  });

  it('validates password length', async () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Minimum 6 caractères'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('Réinitialiser le mot de passe'));
    await waitFor(() => {
      expect(screen.getByText('Le mot de passe doit contenir au moins 6 caractères')).toBeInTheDocument();
    });
  });

  it('validates password match', async () => {
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Minimum 6 caractères'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Répétez le mot de passe'), { target: { value: 'different' } });
    fireEvent.click(screen.getByText('Réinitialiser le mot de passe'));
    await waitFor(() => {
      expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    });
  });

  it('shows success on valid reset', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><ResetPassword /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Minimum 6 caractères'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByPlaceholderText('Répétez le mot de passe'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByText('Réinitialiser le mot de passe'));
    await waitFor(() => {
      expect(screen.getByText('Mot de passe réinitialisé avec succès !')).toBeInTheDocument();
    });
  });
});
