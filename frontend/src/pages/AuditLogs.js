import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Activity, RefreshCw, Filter, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import './AuditLogs.css';

const ACTION_LABELS = {
  LOGIN_SUCCESS: 'Connexion réussie',
  LOGIN_FAILED: 'Échec connexion',
  FORGOT_PASSWORD: 'Demande reset mot de passe',
  RESET_PASSWORD: 'Mot de passe réinitialisé',
  CREATE_USER: 'Création utilisateur',
  UPDATE_USER: 'Modification utilisateur',
  DELETE_USER: 'Suppression utilisateur',
  UPDATE_PROFILE: 'Modification profil',
  CREATE_BANK: 'Création banque',
  UPDATE_BANK: 'Modification banque',
  DELETE_BANK: 'Suppression banque',
  CREATE_API_KEY: 'Création clé API',
  UPDATE_API_KEY: 'Modification clé API',
  DELETE_API_KEY: 'Suppression clé API',
  REGENERATE_API_KEY: 'Régénération clé API',
  UPDATE_SETTING: 'Modification paramètre',
  BULK_UPDATE_SETTINGS: 'Paramètres mis à jour',
  UPDATE_SMTP_CONFIG: 'Configuration SMTP',
  TEST_SMTP: 'Test SMTP',
  ADD_NOTIFICATION_EMAIL: 'Ajout email notification',
  DELETE_NOTIFICATION_EMAIL: 'Suppression email notification',
  TOGGLE_NOTIFICATION_EMAIL: 'Activation/désactivation email',
  SEND_REPORT: 'Envoi rapport',
  SEND_ALL_REPORTS: 'Envoi tous les rapports',
  UPDATE_CRON_CONFIG: 'Configuration cron',
  TRIGGER_SCAN: 'Scan déclenché',
  DELETE_RECORD: 'Suppression enregistrement',
  EXPORT_RECORDS: 'Export enregistrements',
  DECRYPT_PAN: 'Déchiffrement PAN',
  RESOLVE_ERROR: 'Erreur résolue',
};

const ACTION_COLORS = {
  LOGIN_SUCCESS: 'badge-success',
  LOGIN_FAILED: 'badge-danger',
  FORGOT_PASSWORD: 'badge-warning',
  RESET_PASSWORD: 'badge-info',
  CREATE_USER: 'badge-success',
  UPDATE_USER: 'badge-info',
  DELETE_USER: 'badge-danger',
  UPDATE_PROFILE: 'badge-info',
  CREATE_BANK: 'badge-success',
  UPDATE_BANK: 'badge-info',
  DELETE_BANK: 'badge-danger',
  CREATE_API_KEY: 'badge-success',
  UPDATE_API_KEY: 'badge-info',
  DELETE_API_KEY: 'badge-danger',
  REGENERATE_API_KEY: 'badge-warning',
  UPDATE_SETTING: 'badge-warning',
  BULK_UPDATE_SETTINGS: 'badge-warning',
  UPDATE_SMTP_CONFIG: 'badge-info',
  TEST_SMTP: 'badge-info',
  ADD_NOTIFICATION_EMAIL: 'badge-success',
  DELETE_NOTIFICATION_EMAIL: 'badge-danger',
  TOGGLE_NOTIFICATION_EMAIL: 'badge-warning',
  SEND_REPORT: 'badge-info',
  SEND_ALL_REPORTS: 'badge-info',
  UPDATE_CRON_CONFIG: 'badge-warning',
  TRIGGER_SCAN: 'badge-info',
  DELETE_RECORD: 'badge-danger',
  EXPORT_RECORDS: 'badge-info',
  DECRYPT_PAN: 'badge-danger',
  RESOLVE_ERROR: 'badge-success',
};

const AuditLogs = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState({
    action: '',
    username: '',
    userRole: '',
    dateFrom: '',
    dateTo: '',
  });
  const [pagination, setPagination] = useState({ limit: 20, offset: 0, total: 0 });

  const isAdmin = user?.role === 'super_admin';

  useEffect(() => {
    if (isAdmin) {
      api.get('/audit-logs/actions').then(r => setActions(r.data.data || [])).catch(() => {});
    }
  }, [isAdmin]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { limit: pagination.limit, offset: pagination.offset };
      if (filters.action) params.action = filters.action;
      if (filters.username) params.username = filters.username;
      if (filters.userRole) params.userRole = filters.userRole;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;

      const response = await api.get('/audit-logs', { params });
      setLogs(response.data.data || []);
      setPagination(prev => ({ ...prev, total: response.data.total || 0 }));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [pagination.offset]);

  const handleFilter = () => {
    setPagination(prev => ({ ...prev, offset: 0 }));
    fetchLogs();
  };

  const resetFilters = () => {
    setFilters({ action: '', username: '', userRole: '', dateFrom: '', dateTo: '' });
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="audit-logs-page">
      <div className="page-header">
        <h1><Activity size={24} /> Journal d'activité</h1>
        <button className="btn btn-secondary" onClick={fetchLogs}>
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      {isAdmin && (
        <div className="filters-section">
          <div className="filter-group">
            <Filter size={16} />
            <select value={filters.action} onChange={e => setFilters({...filters, action: e.target.value})}>
              <option value="">Toutes les actions</option>
              {actions.map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <Search size={16} />
            <input
              type="text"
              placeholder="Nom d'utilisateur..."
              value={filters.username}
              onChange={e => setFilters({...filters, username: e.target.value})}
            />
          </div>
          <div className="filter-group">
            <select value={filters.userRole} onChange={e => setFilters({...filters, userRole: e.target.value})}>
              <option value="">Tous les profils</option>
              <option value="super_admin">Admin</option>
              <option value="bank">Banque</option>
            </select>
          </div>
          <div className="filter-group">
            <input type="date" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} />
            <span className="filter-separator">→</span>
            <input type="date" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} />
          </div>
          <button className="btn btn-primary" onClick={handleFilter}>Filtrer</button>
          <button className="btn btn-secondary" onClick={resetFilters}>Réinitialiser</button>
        </div>
      )}

      {loading ? (
        <div className="loading"><RefreshCw size={24} className="spin" /> Chargement...</div>
      ) : (
        <>
          <div className="table-container">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Date/Heure</th>
                  <th>Utilisateur</th>
                  <th>Profil</th>
                  <th>Action</th>
                  <th>Banque</th>
                  <th>Adresse IP</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="no-data">
                      <Activity size={40} />
                      <p>Aucune activité enregistrée</p>
                    </td>
                  </tr>
                ) : (
                  logs.map(item => (
                    <tr key={item.id}>
                      <td className="cell-date">
                        {new Date(item.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td><strong>{item.username || '—'}</strong></td>
                      <td>
                        <span className={`badge ${item.user_role === 'super_admin' ? 'badge-info' : 'badge-warning'}`}>
                          {item.user_role === 'super_admin' ? 'Admin' : 'Banque'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${ACTION_COLORS[item.action] || 'badge-info'}`}>
                          {ACTION_LABELS[item.action] || item.action}
                        </span>
                      </td>
                      <td>{item.bank_name || '—'}</td>
                      <td className="cell-ip">{item.ip_address || '—'}</td>
                      <td className="cell-details">
                        {item.new_data && (
                          <span className="detail-preview">
                            {JSON.stringify(item.new_data).substring(0, 60)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.total > pagination.limit && (
            <div className="pagination">
              <button
                className="btn btn-secondary"
                onClick={() => setPagination(prev => ({ ...prev, offset: 0 }))}
                disabled={pagination.offset === 0}
              >
                <ChevronLeft size={14} /> Première
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
              >
                <ChevronLeft size={14} /> Précédent
              </button>
              <span className="page-info">Page {currentPage} / {totalPages} ({pagination.total} entrées)</span>
              <button
                className="btn btn-secondary"
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={pagination.offset + pagination.limit >= pagination.total}
              >
                Suivant <ChevronRight size={14} />
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, totalPages - 1) * prev.limit }))}
                disabled={pagination.offset + pagination.limit >= pagination.total}
              >
                Dernière <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLogs;
