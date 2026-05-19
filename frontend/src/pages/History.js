import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Upload, Globe, Edit3, CheckCircle, XCircle, AlertTriangle, FileText, FileCode, Download, Eye, RefreshCw, Filter, ChevronDown, ChevronUp, Archive } from 'lucide-react';
import api from '../services/api';
import './History.css';

const History = () => {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});
  const [filters, setFilters] = useState({
    bankId: '',
    sourceType: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0
  });
  const [activeStat, setActiveStat] = useState(null);

  useEffect(() => {
    fetchBanks();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [filters, pagination.offset]);

  const handleResetFilters = () => {
    setActiveStat(null);
    setFilters({
      bankId: '',
      sourceType: '',
      status: '',
      dateFrom: '',
      dateTo: ''
    });
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handleStatClick = (stat) => {
    if (activeStat === stat) {
      setActiveStat(null);
      setPagination(prev => ({ ...prev, offset: 0 }));
      setFilters(prev => ({ ...prev, sourceType: '', status: '' }));
      return;
    }
    setActiveStat(stat);
    setPagination(prev => ({ ...prev, offset: 0 }));
    switch (stat) {
      case 'total':
        setFilters({ bankId: filters.bankId, sourceType: '', status: '', dateFrom: '', dateTo: '' });
        break;
      case 'upload':
        setFilters(prev => ({ ...prev, sourceType: 'upload', status: '' }));
        break;
      case 'url':
        setFilters(prev => ({ ...prev, sourceType: 'url', status: '' }));
        break;
      case 'manual':
        setFilters(prev => ({ ...prev, sourceType: 'manual', status: '' }));
        break;
      case 'success':
        setFilters(prev => ({ ...prev, sourceType: '', status: 'success' }));
        break;
      case 'error':
        setFilters(prev => ({ ...prev, sourceType: '', status: 'error,validation_error' }));
        break;
      default:
        break;
    }
  };

  const fetchBanks = async () => {
    try {
      let url = '/banks';
      if (user?.role === 'bank' && user?.bank_id) {
        url += '?bankId=' + user.bank_id;
      }
      const response = await api.get(url);
      const banksData = response.data.data || [];
      setBanks(banksData);
      
      if (user?.role === 'bank' && user?.bank_id) {
        setFilters(prev => ({ ...prev, bankId: user.bank_id.toString() }));
      }
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  };

  const fetchStats = async () => {
    try {
      let url = '/history/stats';
      if (user?.role === 'bank' && user?.bank_id) {
        url += '?bankId=' + user.bank_id;
      }
      const response = await api.get(url);
      setStats(response.data.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        limit: pagination.limit,
        offset: pagination.offset
      };
      if (user?.role === 'bank' && user?.bank_id) {
        params.bankId = user.bank_id.toString();
      }
      const response = await api.get('/history', { params });
      const items = response.data.data || [];
      setHistory(items);
      setExpandedRows({});
      setPagination(prev => ({
        ...prev,
        total: response.data.pagination?.total || 0
      }));
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSourceTypeIcon = (type) => {
    switch (type) {
      case 'upload': return <Upload size={14} className="source-icon upload" />;
      case 'url': return <Globe size={14} className="source-icon url" />;
      case 'manual': return <Edit3 size={14} className="source-icon manual" />;
      default: return <FileText size={14} className="source-icon" />;
    }
  };

  const getSourceTypeLabel = (type) => {
    switch (type) {
      case 'upload': return 'Upload';
      case 'url': return 'URL';
      case 'manual': return 'Manuel';
      default: return type || 'Upload';
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      success: { icon: <CheckCircle size={14} />, label: 'Succes', class: 'badge-success' },
      error: { icon: <XCircle size={14} />, label: 'Erreur', class: 'badge-danger' },
      validation_error: { icon: <AlertTriangle size={14} />, label: 'Erreur validation', class: 'badge-warning' },
      pending: { icon: <Clock size={14} />, label: 'En attente', class: 'badge-info' },
      processing: { icon: <RefreshCw size={14} className="spin" />, label: 'En cours', class: 'badge-info' }
    };
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <span className={'badge ' + config.class}>
        {config.icon} {config.label}
      </span>
    );
  };

  const getStepStatus = (status) => {
    if (status === 'success' || status === 'completed') {
      return <CheckCircle size={16} className="step-icon success" />;
    } else if (status === 'error' || status === 'failed') {
      return <XCircle size={16} className="step-icon error" />;
    } else if (status === 'pending' || !status) {
      return <Clock size={16} className="step-icon pending" />;
    }
    return <AlertTriangle size={16} className="step-icon warning" />;
  };

  const handleViewFile = async (fileName, type) => {
    try {
      const response = await api.get('/records/file-content/byname', {
        params: { type, fileName }
      });
      
      const content = response.data.data;
      let blob;
      
      if (type === 'xml') {
        blob = new Blob([content], { type: 'application/xml' });
      } else {
        const headers = Object.keys(content[0] || {});
        let csv = headers.join(';') + '\n';
        content.forEach(row => {
          csv += headers.map(h => row[h] || '').join(';') + '\n';
        });
        blob = new Blob([csv], { type: 'text/csv' });
      }
      
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      alert('Erreur lors de la visualisation du fichier');
    }
  };

  const handleDownloadFile = async (fileName, type) => {
    try {
      const response = await api.get('/records/file-content/byname', {
        params: { type, fileName }
      });
      
      const content = response.data.data;
      let blob;
      let downloadName = fileName;
      
      if (type === 'xml') {
        blob = new Blob([content], { type: 'application/xml' });
      } else {
        const headers = Object.keys(content[0] || {});
        let csv = headers.join(';') + '\n';
        content.forEach(row => {
          csv += headers.map(h => row[h] || '').join(';') + '\n';
        });
        blob = new Blob([csv], { type: 'text/csv' });
      }
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      alert('Erreur lors du telechargement');
    }
  };

  const toggleExpand = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const nextPage = () => {
    setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }));
  };

  const prevPage = () => {
    setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }));
  };

  return (
    <div className="history-page">
      <div className="page-header">
        <h1><Clock size={24} /> Historique des Traitements</h1>
        <button className="btn btn-secondary" onClick={fetchHistory}>
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className={'stat-card total' + (activeStat === 'total' ? ' active' : '')} onClick={() => handleStatClick('total')}>
            <div className="stat-icon"><FileText size={22} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.total || 0}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div className={'stat-card upload' + (activeStat === 'upload' ? ' active' : '')} onClick={() => handleStatClick('upload')}>
            <div className="stat-icon"><Upload size={22} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.upload_count || 0}</span>
              <span className="stat-label">Uploads</span>
            </div>
          </div>
          <div className={'stat-card url' + (activeStat === 'url' ? ' active' : '')} onClick={() => handleStatClick('url')}>
            <div className="stat-icon"><Globe size={22} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.url_count || 0}</span>
              <span className="stat-label">URL</span>
            </div>
          </div>
          <div className={'stat-card manual' + (activeStat === 'manual' ? ' active' : '')} onClick={() => handleStatClick('manual')}>
            <div className="stat-icon"><Edit3 size={22} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.manual_count || 0}</span>
              <span className="stat-label">Manuel</span>
            </div>
          </div>
          <div className={'stat-card success' + (activeStat === 'success' ? ' active' : '')} onClick={() => handleStatClick('success')}>
            <div className="stat-icon"><CheckCircle size={22} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.success_count || 0}</span>
              <span className="stat-label">Succes</span>
            </div>
          </div>
          <div className={'stat-card error' + (activeStat === 'error' ? ' active' : '')} onClick={() => handleStatClick('error')}>
            <div className="stat-icon"><XCircle size={22} /></div>
            <div className="stat-info">
              <span className="stat-value">{stats.error_count || 0}</span>
              <span className="stat-label">Erreurs</span>
            </div>
          </div>
        </div>
      )}

      <div className="filters-section">
        <div className="filter-group">
          <Filter size={16} />
          <select 
            value={filters.bankId} 
            onChange={(e) => setFilters({...filters, bankId: e.target.value})}
            disabled={user?.role === 'bank'}
          >
            {user?.role === 'bank' ? (
              banks.map(bank => (
                <option key={bank.id} value={bank.id}>{bank.name}</option>
              ))
            ) : (
              <>
                <option value="">Toutes les banques</option>
                {banks.map(bank => (
                  <option key={bank.id} value={bank.id}>{bank.name}</option>
                ))}
              </>
            )}
          </select>
        </div>
        <div className="filter-group">
          <select value={filters.sourceType} onChange={(e) => setFilters({...filters, sourceType: e.target.value})}>
            <option value="">Tous les types</option>
            <option value="upload">Upload</option>
            <option value="url">URL</option>
            <option value="manual">Manuel</option>
          </select>
        </div>
        <div className="filter-group">
          <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})}>
            <option value="">Tous les statuts</option>
            <option value="success">Succes</option>
            <option value="error">Erreur</option>
            <option value="validation_error">Erreur validation</option>
            <option value="pending">En attente</option>
          </select>
        </div>
        <div className="filter-group date-filter">
          <label>Du:</label>
          <input 
            type="date" 
            value={filters.dateFrom} 
            onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
          />
        </div>
        <div className="filter-group date-filter">
          <label>Au:</label>
          <input 
            type="date" 
            value={filters.dateTo} 
            onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
          />
        </div>
        <button className="btn btn-secondary" onClick={handleResetFilters}>
          <RefreshCw size={14} /> Reinitialiser
        </button>
      </div>

      {loading ? (
        <div className="loading"><RefreshCw size={24} className="spin" /> Chargement...</div>
      ) : (
        <>
          <div className="table-container">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Banque</th>
                  <th>Fichier</th>
                  <th>Source</th>
                  <th>Lignes</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">Aucun historique trouve</td></tr>
                ) : (
                  history.map((item, index) => (
                    <React.Fragment key={item.id}>
                      <tr 
                        className={'history-row ' + (item.status || 'pending')}
                        onClick={() => toggleExpand(item.id)}
                      >
                        <td className="status-cell">
                          {getStatusBadge(item.status)}
                        </td>
                        <td>
                          <span className="bank-badge">{item.bank_code}</span>
                        </td>
                        <td className="file-cell">{item.file_name}</td>
                        <td>
                          <span className="source-badge">
                            {getSourceTypeIcon(item.source_type)}
                            {getSourceTypeLabel(item.source_type)}
                          </span>
                        </td>
                        <td className="rows-cell">{item.valid_rows || 0}/{item.total_rows || 0}</td>
                        <td className="date-cell">
                          {item.processed_at ? new Date(item.processed_at).toLocaleString('fr-FR') : '-'}
                        </td>
                        <td className="actions-cell">
                          <div className="status-indicators" onClick={(e) => e.stopPropagation()}>
                            <span className={'step-dot success ' + (item.original_path ? 'active' : '')} title="Input">
                              <Upload size={12} />
                            </span>
                            <span className={'step-dot ' + (item.status === 'success' ? 'success' : item.status === 'validation_error' ? 'warning' : item.status === 'error' ? 'error' : '') + ' ' + (item.status ? 'active' : '')} title="Validation">
                              <CheckCircle size={12} />
                            </span>
                            <span className={'step-dot success ' + (item.valid_rows > 0 ? 'active' : '')} title="CSV">
                              <FileText size={12} />
                            </span>
                            <span className={'step-dot success ' + (item.xml_file_name ? 'active' : '')} title="XML">
                              <FileCode size={12} />
                            </span>
                            <span className={'step-dot success ' + (item.archive_path ? 'active' : '')} title="Archive">
                              <Archive size={12} />
                            </span>
                          </div>
                          {expandedRows[item.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>
                      {expandedRows[item.id] && (
                        <tr className="history-detail-row">
                          <td colSpan="7">
                            <div className="process-steps">
                              <div className="step">
                                <div className="step-header">
                                  {getStepStatus(item.status === 'success' || item.status === 'validation_error' ? 'success' : item.status)}
                                  <span className="step-title">1. Source</span>
                                </div>
                                <div className="step-content">
                                  <p><strong>Fichier:</strong> {item.file_name}</p>
                                  <p><strong>Chemin:</strong> {item.original_path || 'N/A'}</p>
                                  <p><strong>Lignes:</strong> {item.total_rows || 0}</p>
                                  <div className="step-actions">
                                    <button className="btn btn-sm" onClick={() => handleViewFile(item.file_name, 'csv')}>
                                      <Eye size={12} /> Voir
                                    </button>
                                    <button className="btn btn-sm" onClick={() => handleDownloadFile(item.file_name, 'csv')}>
                                      <Download size={12} /> Telecharger
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <div className="step">
                                <div className="step-header">
                                  {getStepStatus(item.status === 'success' ? 'success' : (item.status === 'validation_error' ? 'warning' : item.status))}
                                  <span className="step-title">2. Validation</span>
                                </div>
                                <div className="step-content">
                                  <p><strong>Valides:</strong> <span className="text-success">{item.valid_rows || 0}</span></p>
                                  <p><strong>Invalides:</strong> <span className="text-error">{item.invalid_rows || 0}</span></p>
                                  <p><strong>Doublons:</strong> <span className="text-warning">{item.duplicate_rows || 0}</span></p>
                                  {(item.pending_errors > 0 || item.resolved_errors > 0) && (
                                    <p><strong>Erreurs:</strong> {item.resolved_errors || 0} resolues / {item.pending_errors || 0} attente</p>
                                  )}
                                  {item.error_details && (
                                    <p className="error-details">{item.error_details}</p>
                                  )}
                                </div>
                              </div>
                              <div className="step">
                                <div className="step-header">
                                  {getStepStatus(item.destination_path ? 'success' : 'pending')}
                                  <span className="step-title">3. CSV</span>
                                </div>
                                <div className="step-content">
                                  <p><strong>Chemin:</strong> {item.destination_path || 'Non genere'}</p>
                                  {item.destination_path && (
                                    <div className="step-actions">
                                      <button className="btn btn-sm" onClick={() => handleViewFile(item.file_name, 'csv')}>
                                        <Eye size={12} /> Voir
                                      </button>
                                      <button className="btn btn-sm" onClick={() => handleDownloadFile(item.file_name, 'csv')}>
                                        <Download size={12} /> Telecharger
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="step">
                                <div className="step-header">
                                  {getStepStatus(item.xml_file_name ? 'success' : 'pending')}
                                  <span className="step-title">4. XML</span>
                                </div>
                                <div className="step-content">
                                  {item.xml_file_name ? (
                                    <>
                                      <p><strong>Fichier:</strong> {item.xml_file_name}</p>
                                      <p><strong>Entrees:</strong> {item.xml_entries_count || 0}</p>
                                      <p><strong>Statut:</strong> {getStatusBadge(item.xml_status)}</p>
                                      {item.xml_error && <p className="error-details">{item.xml_error}</p>}
                                      <div className="step-actions">
                                        <button className="btn btn-sm" onClick={() => handleViewFile(item.xml_file_name, 'xml')}>
                                          <Eye size={12} /> Voir XML
                                        </button>
                                        <button className="btn btn-sm" onClick={() => handleDownloadFile(item.xml_file_name, 'xml')}>
                                          <Download size={12} /> Telecharger
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="not-generated">XML non genere</p>
                                  )}
                                </div>
                              </div>
                              <div className="step">
                                <div className="step-header">
                                  {getStepStatus(item.archive_path ? 'success' : 'pending')}
                                  <span className="step-title">5. Archive</span>
                                </div>
                                <div className="step-content">
                                  <p><strong>Chemin:</strong> {item.archive_path || 'Non archive'}</p>
                                  <p><strong>Statut:</strong> {item.archive_status || 'N/A'}</p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button className="btn btn-secondary" onClick={prevPage} disabled={pagination.offset === 0}>
              Precedent
            </button>
            <span>Page {Math.floor(pagination.offset / pagination.limit) + 1} / {Math.max(1, Math.ceil(pagination.total / pagination.limit))}</span>
            <button className="btn btn-secondary" onClick={nextPage} disabled={pagination.offset + pagination.limit >= pagination.total}>
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default History;
