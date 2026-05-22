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
  Building2: () => null, Plus: () => null, Edit2: () => null, Trash2: () => null,
  Eye: () => null, Check: () => null, RefreshCw: () => null, FileText: () => null,
  ArrowRight: () => null, ToggleLeft: () => null, ToggleRight: () => null,
}));

const { useAuth } = require('../../contexts/AuthContext');

const banksData = [
  { id: 1, code: 'BT', name: 'Banque de Tunisie', is_active: true, source_url: 'sftp://bt/source', destination_url: 'sftp://bt/dest', old_url: 'sftp://bt/archive', xml_output_url: 'sftp://bt/xml', enrollment_report_url: '', total_records: 500, total_files_processed: 10 },
  { id: 2, code: 'BIAT', name: 'BIAT', is_active: false, source_url: 'sftp://biat/source', destination_url: 'sftp://biat/dest', old_url: 'sftp://biat/archive', xml_output_url: 'sftp://biat/xml', enrollment_report_url: '', total_records: 200, total_files_processed: 5 },
];

let Banks;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  mockGet.mockImplementation((url) => {
    if (url.startsWith('/banks') && !url.includes('/stats')) return Promise.resolve({ data: { data: banksData } });
    if (url.includes('/stats')) return Promise.resolve({ data: { data: { successful_files: 8, failed_files: 2, validation_errors: 1, total_valid_rows: 450, total_invalid_rows: 30, total_duplicate_rows: 20 } } });
    return Promise.resolve({ data: { data: [] } });
  });
  Banks = require('../Banks').default;
});

describe('Banks', () => {
  const renderBanks = async (user) => {
    useAuth.mockReturnValue({ user });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Chargement...')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Chargement...')).not.toBeInTheDocument());
  };

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

  it('displays bank card with name, code and active status', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Banque de Tunisie')).toBeInTheDocument(); });
    expect(screen.getByText('BT')).toBeInTheDocument();
    const biatEls = screen.getAllByText('BIAT');
    expect(biatEls.length).toBe(2);
  });

  it('shows inactive status for inactive banks', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin', bank_id: null } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => {
      const inactiveEls = screen.getAllByText('Inactive');
      expect(inactiveEls.length).toBeGreaterThanOrEqual(1);
    });
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

  it('submits edit bank form successfully', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Banques')).toBeInTheDocument(); });
    const editBtns = document.querySelectorAll('.bank-actions .btn-secondary');
    fireEvent.click(editBtns[1]);
    await waitFor(() => { expect(screen.getByText('Modifier la banque')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Arab Tunisian Bank'), { target: { value: 'Banque de Tunisie Modifiee' } });
    const submitBtn = document.querySelector('.modal-content .btn-primary');
    fireEvent.click(submitBtn);
    await waitFor(() => { expect(mockPut).toHaveBeenCalled(); });
  });

  it('toggles bank active/inactive', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Banques')).toBeInTheDocument(); });
    const toggleBtns = document.querySelectorAll('.btn-toggle');
    fireEvent.click(toggleBtns[0]);
    await waitFor(() => { expect(mockPut).toHaveBeenCalled(); });
  });

  it('activates an inactive bank', async () => {
    mockPut.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Banques')).toBeInTheDocument(); });
    const toggleBtns = document.querySelectorAll('.btn-toggle');
    expect(toggleBtns.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(toggleBtns[1]);
    await waitFor(() => { expect(mockPut).toHaveBeenCalledWith('/banks/2', { is_active: true }); });
  });

  it('deletes bank with confirmation', async () => {
    mockDelete.mockResolvedValue({ data: { success: true } });
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Banques')).toBeInTheDocument(); });
    const deleteBtns = document.querySelectorAll('.btn-danger');
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  it('cancels delete when confirm returns false', async () => {
    window.confirm.mockReturnValueOnce(false);
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Banques')).toBeInTheDocument(); });
    const deleteBtns = document.querySelectorAll('.btn-danger');
    fireEvent.click(deleteBtns[0]);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('handles API error on fetch gracefully', async () => {
    mockGet.mockImplementation(() => Promise.reject(new Error('Network error')));
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Chargement...')).toBeInTheDocument(); });
  });

  it('handles API error on bank creation gracefully', async () => {
    mockPost.mockRejectedValue({ response: { data: { message: 'Duplicate code' } } });
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
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
    await waitFor(() => { expect(alertSpy).toHaveBeenCalled(); });
    alertSpy.mockRestore();
  });

  it('closes modal on cancel', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Nouvelle Banque')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Nouvelle Banque'));
    await waitFor(() => { expect(screen.getAllByText('Nouvelle banque').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getByText('Annuler'));
    await waitFor(() => { expect(screen.queryByText('Nouvelle banque')).not.toBeInTheDocument(); });
  });

  it('shows stats in view modal', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Gestion des Banques')).toBeInTheDocument(); });
    const viewBtns = screen.getAllByText('Voir');
    fireEvent.click(viewBtns[0]);
    await waitFor(() => { expect(screen.getByText('Fichiers reussis')).toBeInTheDocument(); });
    expect(screen.getByText('Fichiers echoues')).toBeInTheDocument();
  });

  it('renders documentation section for admin', async () => {
    useAuth.mockReturnValue({ user: { role: 'super_admin' } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Documentation')).toBeInTheDocument(); });
    expect(screen.getByText('Structure typique des dossiers')).toBeInTheDocument();
  });

  it('hides documentation for bank user', async () => {
    useAuth.mockReturnValue({ user: { role: 'bank', bank_id: 1 } });
    render(<MemoryRouter><Banks /></MemoryRouter>);
    await waitFor(() => { expect(screen.getByText('Ma Banque')).toBeInTheDocument(); });
    expect(screen.queryByText('Documentation')).not.toBeInTheDocument();
  });
});
