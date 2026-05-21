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

const banksData = [
  { id: 1, code: 'BT', name: 'Banque de Tunisie', is_active: true, source_url: 'sftp://bt/source', destination_url: 'sftp://bt/dest', old_url: 'sftp://bt/archive', xml_output_url: 'sftp://bt/xml', total_records: 500, total_files_processed: 10 },
  { id: 2, code: 'BIAT', name: 'BIAT', is_active: false, source_url: 'sftp://biat/source', destination_url: 'sftp://biat/dest', old_url: 'sftp://biat/archive', xml_output_url: 'sftp://biat/xml', total_records: 200, total_files_processed: 5 },
];

let Banks;
beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockImplementation((url) => {
    if (url.startsWith('/banks')) return Promise.resolve({ data: { data: banksData } });
    if (url.includes('/stats')) return Promise.resolve({ data: { data: { successful_files: 8, failed_files: 2 } } });
    return Promise.resolve({ data: { data: [] } });
  });
  Banks = require('../Banks').default;
});

describe('Banks', () => {
  it('renders bank cards for super_admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Banques')).toBeInTheDocument(); });
    expect(screen.getByText('Banque de Tunisie')).toBeInTheDocument();
    expect(screen.getByText('Nouvelle Banque')).toBeInTheDocument();
  });

  it('shows Ma Banque for bank user', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Ma Banque')).toBeInTheDocument(); });
    expect(screen.getByText('Banque de Tunisie')).toBeInTheDocument();
    expect(screen.queryByText('Nouvelle Banque')).not.toBeInTheDocument();
  });

  it('opens creation modal for admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvelle Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvelle Banque'));
    await waitFor(() => { expect(screen.getAllByText('Nouvelle banque').length).toBeGreaterThanOrEqual(1); });
  });

  it('calls API to create a bank', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvelle Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvelle Banque'));
    await waitFor(() => { expect(screen.getByPlaceholderText('Ex: ATB')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Ex: ATB'), { target: { value: 'ATB' } });
    fireEvent.change(screen.getByPlaceholderText('Arab Tunisian Bank'), { target: { value: 'Arab Tunisian Bank' } });
    const urlInputs = screen.getAllByPlaceholderText(/https/);
    urlInputs.forEach(input => fireEvent.change(input, { target: { value: 'https://server/ACS/ATB/test' } }));
    fireEvent.click(screen.getByText('Creer'));
    await waitFor(() => { expect(mockPost).toHaveBeenCalled(); });
  });

  it('shows view modal for bank user', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Ma Banque')).toBeInTheDocument(); });
    const viewBtns = screen.getAllByText('Voir');
    fireEvent.click(viewBtns[0]);
    await waitFor(() => { expect(screen.getByText('Configuration des repertoires')).toBeInTheDocument(); });
  });
});
