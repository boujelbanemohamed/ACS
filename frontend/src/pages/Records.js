import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Download, Search, Filter, Trash2, FileText, FileCode, CheckCircle, XCircle, Clock, RefreshCw, X, Eye, Upload, AlertCircle } from 'lucide-react';
import api from '../services/api';
import './Records.css';

const Records = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('csv');
  const [records, setRecords] = useState([]);
  const [xmlLogs, setXmlLogs] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    bankId: '',
    search: '',
    sortBy: 'processed_at',
    sortOrder: 'DESC'
  });
  const [xmlFilters, setXmlFilters] = useState({
    bankId: '',
    status: ''
  });
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0
  });
  const [xmlPagination, setXmlPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0
  });
  const [xmlStats, setXmlStats] = useState({
    total_xml: 0,
    success_count: 0,
    error_count: 0,
    pending_count: 0
  });
  const [fileModal, setFileModal] = useState({
    isOpen: false,
    fileName: '',
    fileType: 'csv',
    content: null,
    loading: false,
    error: null
  });
  const [enrollmentFile, setEnrollmentFile] = useState(null);
  const [enrollmentLogDetail, setEnrollmentLogDetail] = useState(null);
  const [showLogDetailModal, setShowLogDetailModal] = useState(false);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState(null);
  const [enrollmentLogs, setEnrollmentLogs] = useState([]);
  const [enrollmentStats, setEnrollmentStats] = useState(null);

  useEffect(() => {
    fetchBanks();
  }, []);

  useEffect(() => {
    if (activeTab === 'csv') {
      fetchRecords();
    } else {
      fetchXmlLogs();
      fetchXmlStats();
    }
  }, [activeTab, filters, pagination.offset, xmlFilters, xmlPagination.offset]);

  const fetchBanks = async () => {
    try {
      let url = '/banks';
      if (user?.role === 'bank' && user?.bank_id) {
        url += '?bankId=' + user.bank_id;
      }
      const response = await api.get(url);
      const banksData = response.data.data || [];
      setBanks(banksData);
      
      // Auto-sélectionner la banque pour les utilisateurs banque
      if (user?.role === 'bank' && user?.bank_id) {
        setFilters(prev => ({ ...prev, bankId: user.bank_id.toString() }));
        setXmlFilters(prev => ({ ...prev, bankId: user.bank_id.toString() }));
      }
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  };

  const fetchEnrollmentData = async () => {
    try {
      const bankParam = user?.role === 'bank' && user?.bank_id ? '?bankId=' + user.bank_id : '';
      const [logsRes, statsRes] = await Promise.all([
        api.get('/enrollment/logs' + bankParam),
        api.get('/enrollment/stats' + bankParam)
      ]);
      setEnrollmentLogs(logsRes.data.data || []);
      setEnrollmentStats(statsRes.data.data);
    } catch (error) {
      console.error('Error fetching enrollment data:', error);
    }
  };

  const viewEnrollmentLogDetail = (log) => {
    setEnrollmentLogDetail(log);
    setShowLogDetailModal(true);
  };

  const downloadNotFoundIds = (ids, fileName) => {
    const csvContent = 'ID XML Non Trouve\n' + ids.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'ids_non_trouves.csv';
    a.click();
  };

  const handleEnrollmentUpload = async () => {
    if (!enrollmentFile) return;
    
    setEnrollmentLoading(true);
    setEnrollmentResult(null);
    
    try {
      const formData = new FormData();
      formData.append('file', enrollmentFile);
      
      const response = await api.post('/enrollment/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setEnrollmentResult(response.data);
      if (response.data.success) {
        fetchRecords();
        fetchEnrollmentData();
        setEnrollmentFile(null);
      }
    } catch (error) {
      setEnrollmentResult({
        success: false,
        message: error.response?.data?.message || 'Erreur lors du traitement'
      });
    } finally {
      setEnrollmentLoading(false);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const bankIdToUse = user?.role === 'bank' && user?.bank_id ? user.bank_id.toString() : filters.bankId;
      const params = {
        ...filters,
        bankId: bankIdToUse,
        limit: pagination.limit,
        offset: pagination.offset
      };
      const response = await api.get('/records', { params });
      setRecords(response.data.data || []);
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0
      }));
    } catch (error) {
      console.error('Error fetching records:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchXmlLogs = async () => {
    setLoading(true);
    try {
      const params = {
        ...xmlFilters,
        limit: xmlPagination.limit,
        offset: xmlPagination.offset
      };
      // Forcer le bankId pour les utilisateurs banque
      if (user?.role === 'bank' && user?.bank_id) {
        params.bankId = user.bank_id.toString();
      }
      const response = await api.get('/xml-logs', { params });
      setXmlLogs(response.data.data || []);
      setXmlPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0
      }));
    } catch (error) {
      console.error('Error fetching XML logs:', error);
      setXmlLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchXmlStats = async () => {
    try {
      let url = '/xml-logs/stats/summary';
      // Filtrer par banque pour les utilisateurs banque
      if (user?.role === 'bank' && user?.bank_id) {
        url += '?bankId=' + user.bank_id;
      }
      const response = await api.get(url);
      setXmlStats(response.data.data || {});
    } catch (error) {
      console.error('Error fetching XML stats:', error);
    }
  };

 const handleViewFile = async (fileName, fileType) => {
    setFileModal({
      isOpen: true,
      fileName: fileName,
      fileType: fileType,
      content: null,
      loading: true,
      error: null
    });

    try {
      const response = await api.get('/records/file-content/byname', {
        params: { type: fileType, fileName: fileName }
      });
      setFileModal(prev => ({
        ...prev,
        content: response.data.data,
        loading: false
      }));
    } catch (error) {
      setFileModal(prev => ({
        ...prev,
        loading: false,
        error: error.response?.data?.message || 'Impossible de charger le contenu du fichier'
      }));
    }
  };

  const handleDownloadFile = (fileName, content, fileType) => {
    let blob;
    let downloadName = fileName;
    
    if (fileType === 'csv') {
      const csvContent = convertToCSV(content);
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    } else {
      blob = new Blob([content], { type: 'application/xml;charset=utf-8;' });
    }
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', downloadName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const convertToCSV = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    let csv = headers.join(';') + '\n';
    data.forEach(row => {
      csv += headers.map(h => row[h] || '').join(';') + '\n';
    });
    return csv;
  };

  const closeFileModal = () => {
    setFileModal({
      isOpen: false,
      fileName: '',
      fileType: 'csv',
      content: null,
      loading: false,
      error: null
    });
  };

  const handleExport = async () => {
    try {
      const params = filters.bankId ? '?bankId=' + filters.bankId : '';
      window.open(api.defaults.baseURL + '/records/export/csv' + params, '_blank');
    } catch (error) {
      alert('Erreur lors de l\'export');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Etes-vous sur de vouloir supprimer cet enregistrement ?')) {
      return;
    }
    try {
      await api.delete('/records/' + id);
      fetchRecords();
    } catch (error) {
      alert('Erreur lors de la suppression');
    }
  };

  const handleSort = (column) => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'ASC' ? 'DESC' : 'ASC'
    }));
  };

  const nextPage = () => {
    if (activeTab === 'csv') {
      setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    } else {
      setXmlPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
    }
  };

  const prevPage = () => {
    if (activeTab === 'csv') {
      setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    } else {
      setXmlPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle size={16} className="status-icon success" />;
      case 'error': return <XCircle size={16} className="status-icon error" />;
      case 'pending': return <Clock size={16} className="status-icon pending" />;
      default: return <Clock size={16} className="status-icon" />;
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      success: { label: 'Succes', class: 'badge-success' },
      error: { label: 'Erreur', class: 'badge-danger' },
      pending: { label: 'En attente', class: 'badge-warning' }
    };
    const statusInfo = statusMap[status] || { label: status, class: 'badge-info' };
    return <span className={'badge ' + statusInfo.class}>{statusInfo.label}</span>;
  };

  const currentPagination = activeTab === 'csv' ? pagination : xmlPagination;

  return (
    <div className="records-page">
      <div className="page-header">
        <h1>Enregistrements</h1>
        {activeTab === 'csv' && (
          <button className="btn btn-primary" onClick={handleExport}>
            <Download size={20} /> Exporter CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <button 
          className={'tab-btn ' + (activeTab === 'csv' ? 'active' : '')}
          onClick={() => setActiveTab('csv')}
        >
          <FileText size={20} />
          <span>Enregistrements CSV</span>
          <span className="tab-count">{pagination.total}</span>
        </button>
        <button 
          className={'tab-btn ' + (activeTab === 'xml' ? 'active' : '')}
          onClick={() => setActiveTab('xml')}
        >
          <FileCode size={20} />
          <span>Fichiers XML</span>
          <span className="tab-count">{xmlStats.total_xml || 0}</span>
        </button>
        {user?.role === 'super_admin' && (
          <button 
            className={'tab-btn ' + (activeTab === 'enrollment' ? 'active' : '')}
            onClick={() => { setActiveTab('enrollment'); fetchEnrollmentData(); }}
          >
            <Upload size={20} />
            <span>Rapport Enrolement</span>
          </button>
        )}
      </div>

      {/* XML Stats Cards */}
      {activeTab === 'xml' && (
        <div className="xml-stats-grid">
          <div className="xml-stat-card success">
            <CheckCircle size={24} />
            <div>
              <span className="stat-value">{xmlStats.success_count || 0}</span>
              <span className="stat-label">Succes</span>
            </div>
          </div>
          <div className="xml-stat-card error">
            <XCircle size={24} />
            <div>
              <span className="stat-value">{xmlStats.error_count || 0}</span>
              <span className="stat-label">Erreurs</span>
            </div>
          </div>
          <div className="xml-stat-card pending">
            <Clock size={24} />
            <div>
              <span className="stat-value">{xmlStats.pending_count || 0}</span>
              <span className="stat-label">En attente</span>
            </div>
          </div>
          <div className="xml-stat-card total">
            <FileCode size={24} />
            <div>
              <span className="stat-value">{xmlStats.total_entries || 0}</span>
              <span className="stat-label">Entrees XML</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <Filter size={20} />
          <select
            value={activeTab === 'csv' ? filters.bankId : xmlFilters.bankId}
            onChange={(e) => {
              if (activeTab === 'csv') {
                setFilters({ ...filters, bankId: e.target.value });
              } else {
                setXmlFilters({ ...xmlFilters, bankId: e.target.value });
              }
            }}
            disabled={user?.role === 'bank'}
          >
            {user?.role === 'bank' ? (
              banks.map((bank) => (
                <option key={bank.id} value={bank.id}>{bank.name}</option>
              ))
            ) : (
              <>
                <option value="">Toutes les banques</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>{bank.name}</option>
                ))}
              </>
            )}
          </select>
        </div>

        {activeTab === 'csv' ? (
          <div className="search-group">
            <Search size={20} />
            <input
              type="text"
              placeholder="Rechercher (nom, PAN, telephone)..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        ) : (
          <div className="filter-group">
            <select
              value={xmlFilters.status}
              onChange={(e) => setXmlFilters({ ...xmlFilters, status: e.target.value })}
            >
              <option value="">Tous les statuts</option>
              <option value="success">Succes</option>
              <option value="error">Erreur</option>
              <option value="pending">En attente</option>
            </select>
          </div>
        )}

        <button className="btn btn-secondary" onClick={() => activeTab === 'csv' ? fetchRecords() : fetchXmlLogs()}>
          <RefreshCw size={18} /> Actualiser
        </button>
      </div>

      <div className="records-stats">
        <p>Total: <strong>{currentPagination.total}</strong> {activeTab === 'csv' ? 'enregistrements' : 'fichiers XML'}</p>
        <p>Affichage: <strong>{currentPagination.offset + 1}</strong> - <strong>{Math.min(currentPagination.offset + currentPagination.limit, currentPagination.total)}</strong></p>
      </div>

      {loading ? (
        <div className="loading">Chargement...</div>
      ) : (
        <>
          {activeTab === 'csv' ? (
            <div className="table-container">
              <table className="records-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('id')}>ID</th>
                    <th onClick={() => handleSort('bank_name')}>Banque</th>
                    <th onClick={() => handleSort('first_name')}>Prenom</th>
                    <th onClick={() => handleSort('last_name')}>Nom</th>
                    <th onClick={() => handleSort('pan')}>PAN</th>
                    <th>Expiration</th>
                    <th>Telephone</th>
                    <th>Language</th>
                    <th>Behaviour</th>
                    <th>Action</th>
                    <th>Fichier</th>
                    <th onClick={() => handleSort('processed_at')}>Date</th>
                    <th>Enrolement</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr><td colSpan="14" className="no-data">Aucun enregistrement trouve</td></tr>
                  ) : (
                    records.map((record) => (
                      <tr key={record.id}>
                        <td className="id-cell">{record.id}</td>
                        <td><span className="bank-badge">{record.bank_code}</span></td>
                        <td>{record.first_name}</td>
                        <td>{record.last_name}</td>
                        <td className="pan-cell">{record.pan}</td>
                        <td>{record.expiry}</td>
                        <td>{record.phone}</td>
                        <td>{record.language}</td>
                        <td><span className="badge badge-info">{record.behaviour}</span></td>
                        <td><span className="badge badge-success">{record.action}</span></td>
                        <td className="file-cell">
                          <button 
                            className="file-link"
                            onClick={() => handleViewFile(record.file_name, 'csv')}
                            title="Voir le contenu du fichier"
                          >
                            <FileText size={14} />
                            {record.file_name}
                          </button>
                        </td>
                        <td className="date-cell">{new Date(record.processed_at).toLocaleString('fr-FR')}</td>
                        <td>
                          <div className={'enrollment-status ' + (record.enrollment_status || 'pending')}>
                            {record.enrollment_status === 'success' && <CheckCircle size={14} />}
                            {record.enrollment_status === 'error' && <XCircle size={14} />}
                            {(!record.enrollment_status || record.enrollment_status === 'pending') && <Clock size={14} />}
                            <span>{record.enrollment_status === 'success' ? 'OK' : record.enrollment_status === 'error' ? 'Erreur' : 'En attente'}</span>
                            {record.enrollment_error_description && (
                              <span className="enrollment-error" title={record.enrollment_error_description}>
                                ({record.enrollment_error_code})
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button className="btn-icon btn-danger" onClick={() => handleDelete(record.id)} title="Supprimer">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-container">
              <table className="records-table xml-table">
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>Banque</th>
                    <th>Fichier XML</th>
                    <th>Fichier Source</th>
                    <th>Enregistrements</th>
                    <th>Entrees XML</th>
                    <th>Date Creation</th>
                    <th>Date Traitement</th>
                    <th>Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {xmlLogs.length === 0 ? (
                    <tr><td colSpan="9" className="no-data">Aucun fichier XML genere</td></tr>
                  ) : (
                    xmlLogs.map((log) => (
                      <tr key={log.id} className={'xml-row ' + log.status}>
                        <td>
                          <div className="status-cell">
                            {getStatusIcon(log.status)}
                            {getStatusBadge(log.status)}
                          </div>
                        </td>
                        <td><span className="bank-badge">{log.bank_code}</span></td>
                        <td className="file-cell xml-file">
                          <button 
                            className="file-link xml"
                            onClick={() => handleViewFile(log.xml_file_name, 'xml')}
                            title="Voir le contenu XML"
                          >
                            <FileCode size={14} />
                            {log.xml_file_name}
                          </button>
                        </td>
                        <td className="file-cell">
                          {log.source_file_name ? (
                            <button 
                              className="file-link"
                              onClick={() => handleViewFile(log.source_file_name, 'csv')}
                              title="Voir le fichier source"
                            >
                              <FileText size={14} />
                              {log.source_file_name}
                            </button>
                          ) : '-'}
                        </td>
                        <td className="center">{log.records_count}</td>
                        <td className="center">{log.xml_entries_count}</td>
                        <td className="date-cell">{new Date(log.created_at).toLocaleString('fr-FR')}</td>
                        <td className="date-cell">{log.processed_at ? new Date(log.processed_at).toLocaleString('fr-FR') : '-'}</td>
                        <td className="error-cell">
                          {log.error_message ? (
                            <span className="error-message" title={log.error_message}>
                              {log.error_message.substring(0, 50)}...
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Onglet Rapport Enrolement */}
          {activeTab === 'enrollment' && user?.role === 'super_admin' && (
            <div className="enrollment-section">
              <div className="enrollment-upload-card">
                <h3><Upload size={20} /> Importer un rapport d enrolement</h3>
                <p>Selectionnez un fichier XML de rapport d enrolement pour mettre a jour les statuts.</p>
                
                <div className="upload-zone">
                  <input
                    type="file"
                    accept=".xml"
                    onChange={(e) => setEnrollmentFile(e.target.files[0])}
                    id="enrollment-file"
                  />
                  <label htmlFor="enrollment-file" className="upload-label">
                    <FileCode size={32} />
                    <span>{enrollmentFile ? enrollmentFile.name : 'Choisir un fichier XML'}</span>
                  </label>
                </div>
                
                <div className="upload-buttons">
                  <button 
                    className="btn btn-primary"
                    onClick={handleEnrollmentUpload}
                    disabled={!enrollmentFile || enrollmentLoading}
                  >
                    {enrollmentLoading ? <RefreshCw size={18} className="spin" /> : <Upload size={18} />}
                    {enrollmentLoading ? 'Traitement...' : 'Importer et traiter'}
                  </button>
                  {(enrollmentFile || enrollmentResult) && (
                    <button 
                      className="btn btn-secondary"
                      onClick={() => { setEnrollmentFile(null); setEnrollmentResult(null); }}
                    >
                      <RefreshCw size={18} /> Reinitialiser
                    </button>
                  )}
                </div>
                
                {enrollmentResult && (
                  <div className={'enrollment-result ' + (enrollmentResult.success ? 'success' : 'error')}>
                    {enrollmentResult.success ? <CheckCircle size={20} /> : <XCircle size={20} />}
                    <div>
                      <p><strong>{enrollmentResult.message}</strong></p>
                      {enrollmentResult.success && (
                        <>
                          <p>Total: {enrollmentResult.totalRecords} | Succes: {enrollmentResult.successCount} | Erreurs: {enrollmentResult.errorCount} | Mis a jour: {enrollmentResult.updatedRecords}</p>
                          
                          {enrollmentResult.errorDetails && enrollmentResult.errorDetails.length > 0 && (
                            <div className="error-details-section">
                              <p><strong>Details des erreurs ({enrollmentResult.errorDetails.length}):</strong></p>
                              <div className="error-details-list">
                                {enrollmentResult.errorDetails.map((err, idx) => (
                                  <div key={idx} className="error-detail-item">
                                    <span className="error-id">ID {err.xmlId}</span>
                                    <span className="error-code">{err.errorCode}</span>
                                    <span className="error-desc">{err.errorDescription}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {enrollmentResult.notFoundIds && enrollmentResult.notFoundIds.length > 0 && (
                            <div className="not-found-ids">
                              <p><strong>IDs non trouves dans l application ({enrollmentResult.notFoundIds.length}):</strong></p>
                              <div className="ids-list">
                                {enrollmentResult.notFoundIds.slice(0, 50).join(', ')}
                                {enrollmentResult.notFoundIds.length > 50 && ' ... et ' + (enrollmentResult.notFoundIds.length - 50) + ' autres'}
                              </div>
                              <button 
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  const csvContent = 'ID XML Non Trouve\n' + enrollmentResult.notFoundIds.join('\n');
                                  const blob = new Blob([csvContent], { type: 'text/csv' });
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = 'ids_non_trouves.csv';
                                  a.click();
                                }}
                              >
                                <Download size={14} /> Telecharger CSV
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {enrollmentStats && (
                <div className="enrollment-stats-grid">
                  <div className="enrollment-stat-card success">
                    <CheckCircle size={24} />
                    <div>
                      <span className="stat-value">{enrollmentStats.enrolled_success || 0}</span>
                      <span className="stat-label">Enroles OK</span>
                    </div>
                  </div>
                  <div className="enrollment-stat-card error">
                    <XCircle size={24} />
                    <div>
                      <span className="stat-value">{enrollmentStats.enrolled_error || 0}</span>
                      <span className="stat-label">Enrolements echoues</span>
                    </div>
                  </div>
                  <div className="enrollment-stat-card pending">
                    <Clock size={24} />
                    <div>
                      <span className="stat-value">{enrollmentStats.pending || 0}</span>
                      <span className="stat-label">En attente</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="enrollment-logs">
                <h3>Historique des imports</h3>
                <table className="records-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Banque</th>
                      <th>Fichier</th>
                      <th>Total</th>
                      <th>Succes</th>
                      <th>Erreurs</th>
                      <th>Non trouves</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollmentLogs.length === 0 ? (
                      <tr><td colSpan="8" className="no-data">Aucun import effectue</td></tr>
                    ) : (
                      enrollmentLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{new Date(log.processed_at).toLocaleString('fr-FR')}</td>
                          <td><span className="bank-badge">{log.bank_code || 'Toutes'}</span></td>
                          <td>{log.file_name}</td>
                          <td>{log.total_records}</td>
                          <td className="success-cell">{log.success_count}</td>
                          <td className="error-cell">{log.error_count}</td>
                          <td className="warning-cell">{log.not_found_ids ? JSON.parse(log.not_found_ids).length : 0}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => viewEnrollmentLogDetail(log)}>
                              <Eye size={14} /> Voir
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pagination">
            <button className="btn btn-secondary" onClick={prevPage} disabled={currentPagination.offset === 0}>
              Precedent
            </button>
            <span>Page {Math.floor(currentPagination.offset / currentPagination.limit) + 1} / {Math.max(1, Math.ceil(currentPagination.total / currentPagination.limit))}</span>
            <button className="btn btn-secondary" onClick={nextPage} disabled={currentPagination.offset + currentPagination.limit >= currentPagination.total}>
              Suivant
            </button>
          </div>
        </>
      )}

      {/* Enrollment Log Detail Modal */}
      {showLogDetailModal && enrollmentLogDetail && (
        <div className="modal-overlay" onClick={() => setShowLogDetailModal(false)}>
          <div className="enrollment-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Rapport d'Import - {enrollmentLogDetail.file_name}</h2>
              <button className="btn-icon" onClick={() => setShowLogDetailModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Date</span>
                  <span className="detail-value">{new Date(enrollmentLogDetail.processed_at).toLocaleString('fr-FR')}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Banque</span>
                  <span className="detail-value">{enrollmentLogDetail.bank_name || 'Toutes les banques'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total enregistrements</span>
                  <span className="detail-value">{enrollmentLogDetail.total_records}</span>
                </div>
                <div className="detail-item success">
                  <span className="detail-label">Succes</span>
                  <span className="detail-value">{enrollmentLogDetail.success_count}</span>
                </div>
                <div className="detail-item error">
                  <span className="detail-label">Erreurs</span>
                  <span className="detail-value">{enrollmentLogDetail.error_count}</span>
                </div>
                <div className="detail-item warning">
                  <span className="detail-label">IDs non trouves</span>
                  <span className="detail-value">{enrollmentLogDetail.not_found_ids ? JSON.parse(enrollmentLogDetail.not_found_ids).length : 0}</span>
                </div>
              </div>
              
              {/* Section Erreurs */}
              {enrollmentLogDetail.error_details && JSON.parse(enrollmentLogDetail.error_details).length > 0 && (
                <div className="error-section">
                  <h3>Details des erreurs ({JSON.parse(enrollmentLogDetail.error_details).length})</h3>
                  <div className="error-details-list-modal">
                    {JSON.parse(enrollmentLogDetail.error_details).map((err, idx) => (
                      <div key={idx} className="error-detail-item">
                        <span className="error-id">ID {err.xmlId}</span>
                        <span className="error-code">{err.errorCode}</span>
                        <span className="error-desc">{err.errorDescription}</span>
                      </div>
                    ))}
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const errors = JSON.parse(enrollmentLogDetail.error_details);
                      const csvContent = 'ID XML,Code Erreur,Description\n' + errors.map(e => e.xmlId + ',' + e.errorCode + ',' + (e.errorDescription || '')).join('\n');
                      const blob = new Blob([csvContent], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'erreurs_enrolement_' + enrollmentLogDetail.id + '.csv';
                      a.click();
                    }}
                  >
                    <Download size={14} /> Telecharger erreurs CSV
                  </button>
                </div>
              )}
              
              {/* Section IDs non trouves */}
              {enrollmentLogDetail.not_found_ids && JSON.parse(enrollmentLogDetail.not_found_ids).length > 0 && (
                <div className="not-found-section">
                  <h3>IDs XML non trouves ({JSON.parse(enrollmentLogDetail.not_found_ids).length})</h3>
                  <p className="not-found-desc">Ces IDs sont presents dans le fichier d'enrolement mais n'ont pas ete trouves dans la base de donnees.</p>
                  <div className="ids-list-large">
                    {JSON.parse(enrollmentLogDetail.not_found_ids).join(', ')}
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => downloadNotFoundIds(JSON.parse(enrollmentLogDetail.not_found_ids), 'ids_non_trouves_' + enrollmentLogDetail.id + '.csv')}
                  >
                    <Download size={14} /> Telecharger CSV
                  </button>
                </div>
              )}
              
              {/* Section Succes */}
              <div className="success-section">
                <h3>Enrolements reussis ({enrollmentLogDetail.success_count})</h3>
                <p className="success-desc">Ces enregistrements ont ete enroles avec succes.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {fileModal.isOpen && (
        <div className="modal-overlay" onClick={closeFileModal}>
          <div className="file-modal" onClick={(e) => e.stopPropagation()}>
            <div className="file-modal-header">
              <div className="file-modal-title">
                {fileModal.fileType === 'csv' ? <FileText size={24} /> : <FileCode size={24} />}
                <h2>{fileModal.fileName}</h2>
              </div>
              <div className="file-modal-actions">
                {fileModal.content && (
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleDownloadFile(fileModal.fileName, fileModal.content, fileModal.fileType)}
                  >
                    <Download size={18} /> Telecharger
                  </button>
                )}
                <button className="btn-icon" onClick={closeFileModal}>
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="file-modal-content">
              {fileModal.loading ? (
                <div className="file-loading">
                  <RefreshCw size={32} className="spin" />
                  <p>Chargement du fichier...</p>
                </div>
              ) : fileModal.error ? (
                <div className="file-error">
                  <XCircle size={48} />
                  <p>{fileModal.error}</p>
                </div>
              ) : fileModal.fileType === 'csv' && Array.isArray(fileModal.content) ? (
                <div className="csv-preview">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {fileModal.content.length > 0 && Object.keys(fileModal.content[0]).map((key) => (
                          <th key={key}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fileModal.content.map((row, index) => (
                        <tr key={index}>
                          {Object.values(row).map((value, i) => (
                            <td key={i}>{value || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="preview-info">
                    Total: {fileModal.content.length} enregistrements
                  </div>
                </div>
              ) : fileModal.fileType === 'xml' ? (
                <div className="xml-preview">
                  <pre>{fileModal.content}</pre>
                </div>
              ) : (
                <div className="file-error">
                  <p>Contenu non disponible</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Records;
