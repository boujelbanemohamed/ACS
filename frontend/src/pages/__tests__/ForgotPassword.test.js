import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ForgotPassword from '../ForgotPassword';

const mockPost = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { post: (...args) => mockPost(...args) },
}));

describe('ForgotPassword', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('renders the form', () => {
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    expect(screen.getByText('Mot de passe oublié ?')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse email')).toBeInTheDocument();
    expect(screen.getByText('Envoyer le lien')).toBeInTheDocument();
  });

  it('shows success message on valid email', async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByText('Envoyer le lien'));
    await waitFor(() => {
      expect(screen.getByText(/un lien de réinitialisation a été envoyé/)).toBeInTheDocument();
    });
  });

  it('shows error on API failure', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: 'Email non trouvé' } } });
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'bad@example.com' } });
    fireEvent.click(screen.getByText('Envoyer le lien'));
    await waitFor(() => {
      expect(screen.getByText('Email non trouvé')).toBeInTheDocument();
    });
  });

  it('shows loading state while submitting', async () => {
    mockPost.mockImplementation(() => new Promise(() => {}));
    render(<MemoryRouter><ForgotPassword /></MemoryRouter>);
    fireEvent.click(screen.getByText('Envoyer le lien'));
    await waitFor(() => {
      expect(screen.getByText('Envoi...')).toBeInTheDocument();
    });
  });
});
