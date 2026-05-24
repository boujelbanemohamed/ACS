import React, { useState, useEffect } from 'react';
import { Activity, Database, Mail, Clock, Server, CheckCircle, XCircle, AlertTriangle, RefreshCw, Cpu, HardDrive, Settings, Bug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import './Monitor.css';

const getSolution = (key, value) => {
  if (!value || value === 0) return '';
  const solutions = {
    unresolved_validation_errors: 'Corriger les données invalides depuis Enregistrements > Corrections',
    file_processing_errors: 'Consulter l\'historique des traitements pour le détail de l\'erreur',
    api_call_errors: 'Vérifier la configuration de l\'API dans Banques > [Banque] > Source URL',
    xml_generation_errors: 'Vérifier les permissions d\'écriture sur le serveur de destination',
    rejected_records: 'Consulter l\'historique des enregistrements pour voir les motifs de rejet',
    failed_notifications: 'Vérifier la configuration SMTP dans Notifications > Configuration SMTP',
    scan_errors_total: 'Vérifier les logs de scan dans Scan Automatique > Logs',
    enrollment_errors: 'Vérifier le format du fichier XML d\'enrôlement',
  };
  return solutions[key] || 'Contacter l\'administrateur de la plateforme';
};

const getFieldSolution = (fieldName, errorType) => {
  const map = {
    phone: 'Vérifier le format du numéro (8 chiffres)',
    pan: 'Vérifier que le PAN fait 16 chiffres et respecte l\'algorithme de Luhn',
    card_holder: 'Le nom ne doit pas contenir de chiffres ou caractères spéciaux',
    email: 'Vérifier le format de l\'adresse email',
    amount: 'Vérifier que le montant est un nombre positif',
    cin: 'Vérifier que le CIN fait 8 chiffres',
    date_naissance: 'Vérifier le format de la date (JJ/MM/AAAA)',
  };
  return map[fieldName] || 'Contacter l\'administrateur de la plateforme';
};

const getFileErrorSolution = (status) => {
  if (status === 'validation_error') return 'Corriger les lignes invalides dans le fichier source et le re-télécharger';
  if (status === 'error') return 'Vérifier le fichier source et relancer le traitement depuis l\'historique';
  return 'Contacter l\'administrateur de la plateforme';
};

const getScanErrorSolution = (errorsDetail) => {
  if (!errorsDetail) return 'Vérifier les logs de scan dans Scan Automatique > Logs';
  if (errorsDetail.toLowerCase().includes('timeout')) return 'Vérifier la connectivité réseau vers le serveur SFTP';
  if (errorsDetail.toLowerCase().includes('auth')) return 'Vérifier les identifiants de connexion SFTP dans la configuration de la banque';
  if (errorsDetail.toLowerCase().includes('permis')) return 'Vérifier les permissions d\'accès au dossier SFTP';
  return 'Contacter l\'administrateur de la plateforme';
};

const Monitor = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(15000);
  const [debugData, setDebugData] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState(null);
  const [debugExpanded, setDebugExpanded] = useState(user?.role !== 'super_admin');

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

  const fetchDebug = async () => {
    try {
      setDebugLoading(true);
      setDebugError(null);
      const params = user?.bank_id && user?.role !== 'super_admin' ? `?bankId=${user.bank_id}` : '';
      const response = await api.get(`/monitoring/debug${params}`);
      setDebugData(response.data.data);
    } catch (err) {
      console.error('Debug fetch error:', err);
      setDebugError(err.response?.data?.message || 'Erreur de chargement du diagnostic');
    } finally {
      setDebugLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchHealth();
    } else {
      fetchDebug();
    }
  }, []);

  useEffect(() => {
    if (!autoRefresh || user?.role !== 'super_admin') return;
    const interval = setInterval(fetchHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'up': return <CheckCircle size={24} />;
      case 'healthy': return <CheckCircle size={24} />;
      case 'degraded': return <AlertTriangle size={24} />;
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
      case 'degraded': return 'warning';
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
      case 'degraded': return 'Dégradé';
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
          <button className={'btn btn-debug ' + (debugExpanded ? 'active' : '')} onClick={() => { setDebugExpanded(!debugExpanded); if (!debugData) fetchDebug(); }}>
            <Bug size={16} /> Debug
          </button>
        </div>
      </div>

      {user?.role === 'super_admin' && loading && !health ? (
        <div className="loading"><RefreshCw size={24} className="spin" /> Chargement...</div>
      ) : user?.role === 'super_admin' && error ? (
        <div className="error-state">
          <XCircle size={48} />
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={() => { setLoading(true); fetchHealth(); }}>
            <RefreshCw size={16} /> Réessayer
          </button>
        </div>
      ) : null}

      {user?.role === 'super_admin' && health && (
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
      )}

      {debugExpanded && (
        <div className="debug-section">
              <div className="debug-header">
                <h2><Bug size={20} /> Diagnostic des erreurs</h2>
                <button className="btn btn-secondary btn-sm" onClick={fetchDebug} disabled={debugLoading}>
                  <RefreshCw size={14} className={debugLoading ? 'spin' : ''} /> Actualiser
                </button>
              </div>

              {debugLoading && !debugData ? (
                <div className="debug-loading">Chargement du diagnostic...</div>
              ) : debugError ? (
                <div className="error-state">
                  <XCircle size={48} />
                  <p>{debugError}</p>
                  <button className="btn btn-secondary" onClick={fetchDebug}>
                    <RefreshCw size={16} /> Réessayer
                  </button>
                </div>
              ) : debugData ? (
                <>
                  {debugData.summary && (
                  <div className="debug-summary">
                    <div className={'debug-card ' + (debugData.summary.unresolved_validation_errors > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.unresolved_validation_errors}</span>
                      <span className="debug-card-label">Erreurs de validation non résolues</span>
                      {debugData.summary.unresolved_validation_errors > 0 && <span className="debug-card-solution">{getSolution('unresolved_validation_errors', 1)}</span>}
                    </div>
                    <div className={'debug-card ' + (debugData.summary.file_processing_errors > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.file_processing_errors}</span>
                      <span className="debug-card-label">Fichiers en erreur</span>
                      {debugData.summary.file_processing_errors > 0 && <span className="debug-card-solution">{getSolution('file_processing_errors', 1)}</span>}
                    </div>
                    <div className={'debug-card ' + (debugData.summary.api_call_errors > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.api_call_errors}</span>
                      <span className="debug-card-label">Appels API en échec</span>
                      {debugData.summary.api_call_errors > 0 && <span className="debug-card-solution">{getSolution('api_call_errors', 1)}</span>}
                    </div>
                    <div className={'debug-card ' + (debugData.summary.xml_generation_errors > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.xml_generation_errors}</span>
                      <span className="debug-card-label">Générations XML en échec</span>
                      {debugData.summary.xml_generation_errors > 0 && <span className="debug-card-solution">{getSolution('xml_generation_errors', 1)}</span>}
                    </div>
                    <div className={'debug-card ' + (debugData.summary.rejected_records > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.rejected_records}</span>
                      <span className="debug-card-label">Enregistrements rejetés</span>
                      {debugData.summary.rejected_records > 0 && <span className="debug-card-solution">{getSolution('rejected_records', 1)}</span>}
                    </div>
                    <div className={'debug-card ' + (debugData.summary.failed_notifications > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.failed_notifications}</span>
                      <span className="debug-card-label">Notifications échouées</span>
                      {debugData.summary.failed_notifications > 0 && <span className="debug-card-solution">{getSolution('failed_notifications', 1)}</span>}
                    </div>
                    <div className={'debug-card ' + (debugData.summary.scan_errors_total > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.scan_errors_total}</span>
                      <span className="debug-card-label">Scans en échec</span>
                      {debugData.summary.scan_errors_total > 0 && <span className="debug-card-solution">{getSolution('scan_errors_total', 1)}</span>}
                    </div>
                    <div className={'debug-card ' + (debugData.summary.enrollment_errors > 0 ? 'has-errors' : 'ok')}>
                      <span className="debug-card-value">{debugData.summary.enrollment_errors}</span>
                      <span className="debug-card-label">Rapports d'enrôlement en erreur</span>
                      {debugData.summary.enrollment_errors > 0 && <span className="debug-card-solution">{getSolution('enrollment_errors', 1)}</span>}
                    </div>
                  </div>
                  )}

                  {debugData.top_field_validation_errors && debugData.top_field_validation_errors.length > 0 && (
                    <div className="debug-table-section">
                      <h3>Erreurs de validation les plus fréquentes</h3>
                      <table className="debug-table">
                        <thead>
                          <tr>
                            <th>Champ</th>
                            <th>Type d'erreur</th>
                            <th>Message</th>
                            <th>Occurrences</th>
                            <th>Solution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debugData.top_field_validation_errors.map((err, i) => (
                            <tr key={i}>
                              <td><code>{err.field_name}</code></td>
                              <td><span className={'error-badge error-' + (err.error_type || 'unknown').toLowerCase()}>{err.error_type || 'N/A'}</span></td>
                              <td className="error-message-cell">{err.error_message}</td>
                              <td className="count-cell">{err.count}</td>
                              <td className="solution-cell">{getFieldSolution(err.field_name, err.error_type)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {debugData.recent_file_errors && debugData.recent_file_errors.length > 0 && (
                    <div className="debug-table-section">
                      <h3>Fichiers récents en erreur</h3>
                      <table className="debug-table">
                        <thead>
                          <tr>
                            <th>Fichier</th>
                            <th>Banque</th>
                            <th>Statut</th>
                            <th>Lignes invalides</th>
                            <th>Date</th>
                            <th>Détails</th>
                            <th>Solution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debugData.recent_file_errors.map((f, i) => {
                            const errors = f.validation_errors && f.validation_errors.length > 0 ? f.validation_errors : (f.record_history_errors && f.record_history_errors.length > 0 ? f.record_history_errors : null);
                            return (
                            <tr key={i}>
                              <td>{f.file_name}</td>
                              <td>{f.bank_code || 'N/A'}</td>
                              <td><span className={'error-badge error-' + (f.status === 'error' ? 'fatal' : 'warning')}>{f.status === 'error' ? 'Erreur' : 'Erreur validation'}</span></td>
                              <td className="count-cell">{f.invalid_rows || 0}</td>
                              <td className="date-cell">{f.processed_at ? new Date(f.processed_at).toLocaleDateString('fr-FR') : '—'}</td>
                              <td className="error-details-cell">
                                {errors ? (
                                  <div className="validation-errors-list">
                                    {errors.map((ve, vi) => (
                                      <div key={vi} className={'validation-error-item ' + (ve.resolved ? 'resolved' : '')}>
                                        <div className="ve-header">
                                          <span className={'error-badge error-' + (ve.severity === 'error' ? 'fatal' : 'warning')}>{ve.severity === 'error' ? 'Erreur' : 'Warning'}</span>
                                          <span className="ve-field"><code>{ve.field}</code></span>
                                          {ve.row && <span className="ve-row">Ligne {ve.row}</span>}
                                          {ve.resolved && <span className="ve-resolved">Résolue</span>}
                                        </div>
                                        <div className="ve-body">
                                          <div className="ve-message">{ve.message}</div>
                                          {ve.value && <div className="ve-value">Valeur reçue : <code>{ve.value}</code></div>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : f.error_details ? (
                                  <div className="validation-errors-list">
                                    <div className="validation-error-item">
                                      <div className="ve-body">
                                        <div className="ve-message">{f.error_details}</div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="validation-errors-list">
                                    <div className="validation-error-item">
                                      <div className="ve-body">
                                        <div className="ve-message">{f.invalid_rows} ligne(s) invalide(s) — {f.status === 'validation_error' ? 'Erreur de validation' : 'Erreur de traitement'}</div>
                                        <div className="ve-value">Aucun détail enregistré dans la base pour ce fichier</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="solution-cell">{getFileErrorSolution(f.status)}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {debugData.file_errors_by_status && debugData.file_errors_by_status.length > 0 && (
                    <div className="debug-table-section">
                      <h3>Répartition des erreurs fichier</h3>
                      <div className="debug-stats-row">
                        {debugData.file_errors_by_status.map((s, i) => (
                          <div key={i} className={'debug-stat-card ' + (s.status === 'error' ? 'stat-error' : 'stat-warning')}>
                            <span className="stat-label">{s.status === 'error' ? 'Erreurs fatales' : 'Erreurs de validation'}</span>
                            <span className="stat-value">{s.count} fichiers</span>
                            <span className="stat-sub">{s.invalid_rows} lignes invalides, {s.duplicate_rows} doublons</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugData.recent_scan_errors && debugData.recent_scan_errors.length > 0 && (
                    <div className="debug-table-section">
                      <h3>Erreurs de scan récentes</h3>
                      <table className="debug-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Erreurs</th>
                            <th>Détails</th>
                            <th>Solution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {debugData.recent_scan_errors.map((s, i) => (
                            <tr key={i}>
                              <td className="date-cell">{new Date(s.scan_time).toLocaleString('fr-FR')}</td>
                              <td className="count-cell">{s.errors_count}</td>
                              <td className="error-details-cell">{s.errors_detail || '—'}</td>
                              <td className="solution-cell">{getScanErrorSolution(s.errors_detail)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="debug-empty">Cliquez sur "Actualiser" pour charger le diagnostic.</div>
              )}
            </div>
          )}
    </div>
  );
};

export default Monitor;
