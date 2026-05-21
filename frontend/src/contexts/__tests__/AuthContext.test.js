import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

const mockLoginApi = jest.fn();
jest.mock('../../services/api', () => ({
  authAPI: { login: (...args) => mockLoginApi(...args) },
  __esModule: true,
  default: {},
}));

const TestComponent = () => {
  const { user, loading, isAuthenticated, mustChangePassword, login, logout, clearMustChangePassword, error } = useAuth();
  if (loading) return <div>Loading...</div>;
  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'Logged in' : 'Logged out'}</div>
      <div data-testid="must-change">{mustChangePassword ? 'true' : 'false'}</div>
      <div data-testid="error">{error || ''}</div>
      <button onClick={() => login({ username: 'admin', password: 'pass' })}>Login</button>
      <button onClick={logout}>Logout</button>
      <button onClick={clearMustChangePassword}>ClearMustChange</button>
    </div>
  );
};

const renderWithProvider = () => render(<AuthProvider><TestComponent /></AuthProvider>);

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('shows logged out after loading', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('auth-status')).toHaveTextContent('Logged out');
  });

  it('authenticates on successful login', async () => {
    mockLoginApi.mockResolvedValue({
      data: { data: { token: 't', user: { id: 1, username: 'admin', role: 'super_admin' }, must_change_password: false } },
    });
    renderWithProvider();
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Logged in');
    });
  });

  it('sets mustChangePassword on login when flag is true', async () => {
    mockLoginApi.mockResolvedValue({
      data: { data: { token: 't', user: { id: 1, username: 'admin' }, must_change_password: true } },
    });
    renderWithProvider();
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => {
      expect(screen.getByTestId('must-change')).toHaveTextContent('true');
    });
  });

  it('restores mustChangePassword from localStorage', async () => {
    localStorage.setItem('token', 't');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin' }));
    localStorage.setItem('must_change_password', 'true');
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('must-change')).toHaveTextContent('true');
    });
  });

  it('clears auth state on logout', async () => {
    localStorage.setItem('token', 't');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin' }));
    renderWithProvider();
    await screen.findByTestId('auth-status');
    fireEvent.click(screen.getByText('Logout'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Logged out');
    });
  });

  it('clears mustChangePassword', async () => {
    localStorage.setItem('token', 't');
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin' }));
    localStorage.setItem('must_change_password', 'true');
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('must-change')).toHaveTextContent('true');
    });
    fireEvent.click(screen.getByText('ClearMustChange'));
    await waitFor(() => {
      expect(screen.getByTestId('must-change')).toHaveTextContent('false');
    });
    expect(localStorage.getItem('must_change_password')).toBe('false');
  });

  it('returns error on failed login', async () => {
    mockLoginApi.mockRejectedValue({ response: { data: { message: 'Invalide' } } });
    renderWithProvider();
    fireEvent.click(screen.getByText('Login'));
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Invalide');
    });
  });

  it('useAuth throws outside provider', () => {
    const Test = () => { useAuth(); return null; };
    expect(() => render(<Test />)).toThrow('useAuth must be used within AuthProvider');
  });
});
