import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'admin', role: 'super_admin', bank_name: null, email: 'admin@test.com' } }),
}));

const mockGet = jest.fn();
const mockPut = jest.fn();
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args), put: (...args) => mockPut(...args) },
}));

describe('Profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      data: { success: true, data: { email: 'admin@test.com', phone: '+21612345678' } },
    });
  });

  it('renders profile page', async () => {
    const Profile = require('../Profile').default;
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Mon Profil')).toBeInTheDocument(); });
  });

  it('displays user info', async () => {
    const Profile = require('../Profile').default;
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('admin')).toBeInTheDocument(); });
    expect(screen.getByText('Super Administrateur')).toBeInTheDocument();
  });

  it('shows profile form fields from API', async () => {
    const Profile = require('../Profile').default;
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument(); });
    expect(screen.getByDisplayValue('+21612345678')).toBeInTheDocument();
  });

  it('updates profile on submit', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    const Profile = require('../Profile').default;
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Enregistrer'));
    await waitFor(() => {
      expect(screen.getByText('Profil mis a jour avec succes!')).toBeInTheDocument();
    });
  });

  it('validates password mismatch', async () => {
    const Profile = require('../Profile').default;
    render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Informations personnelles')).toBeInTheDocument(); });
    const allInputs = document.querySelectorAll('input[type="password"]');
    if (allInputs.length >= 2) {
      fireEvent.change(allInputs[1], { target: { value: 'newpass123' } });
    }
    const passwordSubmitBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Changer le mot de passe'));
    if (passwordSubmitBtn) fireEvent.click(passwordSubmitBtn);
    await waitFor(() => {
      expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    });
  });
});
