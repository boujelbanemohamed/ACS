import React, { useState, useEffect } from 'react';
import { Activity, Database, Mail, Clock, Server, CheckCircle, XCircle, AlertTriangle, RefreshCw, Cpu, HardDrive, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Monitor.css';

const Monitor = () => {
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(15000);

  const fetchHealth = async () => {
    try {
      setError(null);
      const response = await api.get('/monitoring/health');
      setHealth(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'up': return <CheckCircle size={24} />;
      case 'healthy': return <CheckCircle size={24} />;
      case 'down': return <XCircle size={24} />;
      case 'error': return <XCircle size={24} />;
      case 'disabled':
      case 'stopped':
      case 'not_configured': return <AlertTriangle size={24} />;
      default: return <AlertTriangle size={24} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'up':
      case 'healthy': return 'success';
      case 'down':
      case 'error': return 'error';
      case 'disabled':
      case 'stopped':
      case 'not_configured': return 'warning';
      default: return 'warning';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'up': return 'Fonctionnel';
      case 'healthy': return 'Fonctionnel';
      case 'down': return 'HS';
      case 'error': return 'Erreur';
      case 'disabled': return 'Désactivé';
      case 'stopped': return 'Arrêté';
      case 'not_configured': return 'Non configuré';
      default: return status;
    }
  };

  return (
    <div className="monitor-page">
      <div className="page-header">
        <h1><Activity size={24} /> Monitoring Plateforme</h1>
        <div className="header-actions">
          <label className="auto-refresh-label">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto
          </label>
          {autoRefresh && (
            <select className="refresh-select" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={15000}>15s</option>
              <option value={30000}>30s</option>
              <option value={60000}>60s</option>
            </select>
          )}
          <button className="btn btn-secondary" onClick={() => { setLoading(true); fetchHealth(); }}>
            <RefreshCw size={16} /> Actualiser
          </button>
        </div>
      </div>

      {loading && !health ? (
        <div className="loading"><RefreshCw size={24} className="spin" /> Chargement...</div>
      ) : error ? (
        <div className="error-state">
          <XCircle size={48} />
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => { setLoading(true); fetchHealth(); }}>
            <RefreshCw size={16} /> Réessayer
          </button>
        </div>
      ) : health ? (
        <>
          <div className={'global-status ' + getStatusColor(health.globalStatus)}>
            {getStatusIcon(health.globalStatus)}
            <div>
              <span className="global-label">État Général</span>
              <span className="global-value">{getStatusLabel(health.globalStatus)}</span>
            </div>
            <span className="checked-at">Vérifié à {new Date(health.checkedAt).toLocaleTimeString('fr-FR')}</span>
          </div>

          <div className="components-grid">
            <div className={'component-card ' + getStatusColor(health.components.database.status)}>
              <div className="component-icon"><Database size={28} /></div>
              <div className="component-info">
                <span className="component-name">Base de Données</span>
                <span className={'component-status ' + getStatusColor(health.components.database.status)}>
                  {getStatusIcon(health.components.database.status)}
                  {getStatusLabel(health.components.database.status)}
                </span>
                <div className="component-details">
                  {health.components.database.latency && (
                    <span className="detail-item">Latence: {health.components.database.latency}</span>
                  )}
                  {health.components.database.error && (
                    <span className="detail-item error">{health.components.database.error}</span>
                  )}
                </div>
              </div>
            </div>

            <div className={'component-card ' + getStatusColor(health.components.smtp.status)}>
              <div className="component-icon"><Mail size={28} /></div>
              <div className="component-info">
                <span className="component-name">Serveur SMTP</span>
                <span className={'component-status ' + getStatusColor(health.components.smtp.status)}>
                  {getStatusIcon(health.components.smtp.status)}
                  {getStatusLabel(health.components.smtp.status)}
                </span>
                <div className="component-details">
                  {health.components.smtp.host && (
                    <span className="detail-item">Hôte: {health.components.smtp.host}</span>
                  )}
                  {health.components.smtp.from && (
                    <span className="detail-item">From: {health.components.smtp.from}</span>
                  )}
                  {health.components.smtp.error && (
                    <span className="detail-item error">{health.components.smtp.error}</span>
                  )}
                  {health.components.smtp.hint && (
                    <span className="detail-item hint">{health.components.smtp.hint}</span>
                  )}
                  {(health.components.smtp.status === 'not_configured' || health.components.smtp.status === 'disabled') && (
                    <button className="action-link" onClick={() => navigate('/notifications')}>
                      <Settings size={14} /> Configurer SMTP
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={'component-card ' + getStatusColor(health.components.cron.status)}>
              <div className="component-icon"><Clock size={28} /></div>
              <div className="component-info">
                <span className="component-name">Tâche Planifiée</span>
                <span className={'component-status ' + getStatusColor(health.components.cron.status)}>
                  {getStatusIcon(health.components.cron.status)}
                  {getStatusLabel(health.components.cron.status)}
                </span>
                <div className="component-details">
                  <span className="detail-item">Planification: {health.components.cron.schedule} ({health.components.cron.description || 'N/A'})</span>
                  {health.components.cron.nextRun && (
                    <span className="detail-item">Prochaine exécution: {new Date(health.components.cron.nextRun).toLocaleString('fr-FR')}</span>
                  )}
                  {health.components.cron.lastScan && (
                    <span className="detail-item">Dernier scan: {new Date(health.components.cron.lastScan).toLocaleString('fr-FR')}</span>
                  )}
                  {health.components.cron.isScanning && (
                    <span className="detail-item" style={{color: '#1976d2', fontWeight: 600}}>Scan en cours...</span>
                  )}
                  {health.components.cron.hint && (
                    <span className="detail-item hint">{health.components.cron.hint}</span>
                  )}
                  {health.components.cron.status === 'stopped' && (
                    <button className="action-link" onClick={() => navigate('/cron')}>
                      <Settings size={14} /> Voir Scan Automatique
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="component-card success">
              <div className="component-icon"><Server size={28} /></div>
              <div className="component-info">
                <span className="component-name">Serveur Backend</span>
                <span className="component-status success">
                  <CheckCircle size={24} /> Fonctionnel
                </span>
                <div className="component-details">
                  <span className="detail-item">Node {health.system.nodeVersion}</span>
                  <span className="detail-item">Uptime: {health.system.uptime}</span>
                  <span className="detail-item">Environnement: {health.system.env}</span>
                </div>
              </div>
            </div>

            <div className="component-card success">
              <div className="component-icon"><Cpu size={28} /></div>
              <div className="component-info">
                <span className="component-name">Frontend</span>
                <span className="component-status success">
                  <CheckCircle size={24} /> Fonctionnel
                </span>
                <div className="component-details">
                  <span className="detail-item">React SPA</span>
                  <span className="detail-item">Port: 3008</span>
                </div>
              </div>
            </div>

            <div className={'component-card ' + getStatusColor(health.components.database.status)}>
              <div className="component-icon"><HardDrive size={28} /></div>
              <div className="component-info">
                <span className="component-name">Mémoire Serveur</span>
                <span className="component-status success">
                  <CheckCircle size={24} /> Fonctionnel
                </span>
                <div className="component-details">
                  <span className="detail-item">Utilisée: {health.system.memory.used}</span>
                  <span className="detail-item">Allouée: {health.system.memory.total}</span>
                  <span className="detail-item">RSS: {health.system.memory.rss}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default Monitor;
