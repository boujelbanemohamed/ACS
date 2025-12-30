import React, { useState, useEffect } from 'react';
import { Clock, PlayCircle, RefreshCw, Calendar, Activity, Settings, Save, Power, Info } from 'lucide-react';
import api from '../services/api';
import './CronManager.css';

const CronManager = () => {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({
    cron_schedule: '*/5 * * * *',
    cron_enabled: 'true',
    scan_timezone: 'Africa/Tunis',
    auto_archive: 'true',
    max_files_per_scan: '100'
  });
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scanLogs, setScanLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showLogDetail, setShowLogDetail] = useState(false);

  const presetSchedules = [
    { value: '*/1 * * * *', label: 'Toutes les minutes' },
    { value: '*/5 * * * *', label: 'Toutes les 5 minutes' },
    { value: '*/10 * * * *', label: 'Toutes les 10 minutes' },
    { value: '*/15 * * * *', label: 'Toutes les 15 minutes' },
    { value: '*/30 * * * *', label: 'Toutes les 30 minutes' },
    { value: '0 * * * *', label: 'Toutes les heures' },
    { value: '0 */2 * * *', label: 'Toutes les 2 heures' },
    { value: '0 */6 * * *', label: 'Toutes les 6 heures' },
    { value: '0 8 * * *', label: 'Tous les jours à 8h' },
    { value: '0 8 * * 1-5', label: 'Lundi-Vendredi à 8h' },
    { value: '0 0 * * *', label: 'Tous les jours à minuit' }
  ];

  const timezones = [
    'Africa/Tunis',
    'Europe/Paris',
    'Europe/London',
    'America/New_York',
    'Asia/Dubai',
    'UTC'
  ];

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    fetchSettings();
    
    const interval = setInterval(() => {
      fetchStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await api.get('/scanner/status');
      setStatus(response.data.data);
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await api.get('/scanner/logs?limit=10');
      setLogs(response.data.data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await api.get('/settings');
      if (response.data.data) {
        setSettings(prev => ({ ...prev, ...response.data.data }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.post('/settings/bulk', { settings });
      alert('✅ Paramètres sauvegardés avec succès!');
      fetchStatus();
      setShowSettings(false);
    } catch (error) {
      alert('❌ Erreur: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  const toggleCron = async () => {
    const newValue = settings.cron_enabled === 'true' ? 'false' : 'true';
    setSettings(prev => ({ ...prev, cron_enabled: newValue }));
    
    try {
      await api.put('/settings/cron_enabled', { value: newValue });
      fetchStatus();
    } catch (error) {
      alert('Erreur: ' + error.message);
      setSettings(prev => ({ ...prev, cron_enabled: settings.cron_enabled }));
    }
  };

  const triggerManualScan = async () => {
    if (triggering) return;
    
    setTriggering(true);
    try {
      const response = await api.post('/scanner/trigger');
      alert(`✅ Scan terminé!\n\nBanques: ${response.data.data.banksScanned}\nFichiers trouvés: ${response.data.data.filesFound}\nFichiers traités: ${response.data.data.filesProcessed}`);
      fetchStatus();
      fetchLogs();
    } catch (error) {
      alert('❌ Erreur lors du scan: ' + (error.response?.data?.message || error.message));
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <div className="cron-manager">
      <div className="page-header">
        <h1><Clock size={32} /> Gestion du Scan Automatique</h1>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings size={20} /> Paramètres
          </button>
          <button 
            className={`btn ${settings.cron_enabled === 'true' ? 'btn-success' : 'btn-danger'}`}
            onClick={toggleCron}
          >
            <Power size={20} /> {settings.cron_enabled === 'true' ? 'Activé' : 'Désactivé'}
          </button>
          <button 
            className="btn btn-primary"
            onClick={triggerManualScan}
            disabled={triggering || status?.isScanning}
          >
            {triggering || status?.isScanning ? (
              <><RefreshCw size={20} className="spin" /> Scan en cours...</>
            ) : (
              <><PlayCircle size={20} /> Lancer un scan</>
            )}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h2><Settings size={24} /> Configuration du Scanner</h2>
            <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
              {saving ? <RefreshCw size={20} className="spin" /> : <Save size={20} />}
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>

          <div className="settings-grid">
            <div className="setting-group">
              <label>Planification (CRON)</label>
              <select
                value={settings.cron_schedule}
                onChange={(e) => setSettings({ ...settings, cron_schedule: e.target.value })}
              >
                {presetSchedules.map(schedule => (
                  <option key={schedule.value} value={schedule.value}>
                    {schedule.label} ({schedule.value})
                  </option>
                ))}
              </select>
              <small>Définit la fréquence des scans automatiques</small>
            </div>

            <div className="setting-group">
              <label>Expression CRON personnalisée</label>
              <input
                type="text"
                value={settings.cron_schedule}
                onChange={(e) => setSettings({ ...settings, cron_schedule: e.target.value })}
                placeholder="*/5 * * * *"
              />
              <small>Format: minute heure jour mois jour_semaine</small>
            </div>

            <div className="setting-group">
              <label>Fuseau horaire</label>
              <select
                value={settings.scan_timezone}
                onChange={(e) => setSettings({ ...settings, scan_timezone: e.target.value })}
              >
                {timezones.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div className="setting-group">
              <label>Fichiers max par scan</label>
              <input
                type="number"
                value={settings.max_files_per_scan}
                onChange={(e) => setSettings({ ...settings, max_files_per_scan: e.target.value })}
                min="1"
                max="1000"
              />
            </div>

            <div className="setting-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.auto_archive === 'true'}
                  onChange={(e) => setSettings({ ...settings, auto_archive: e.target.checked ? 'true' : 'false' })}
                />
                Archiver automatiquement les fichiers traités
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="cron-grid">
        <div className="cron-card status-card">
          <div className="card-header">
            <Activity size={24} />
            <h2>Statut Actuel</h2>
          </div>
          <div className="status-content">
            <div className="status-item">
              <span className="label">Scanner:</span>
              <span className={`status-badge ${settings.cron_enabled === 'true' ? 'enabled' : 'disabled'}`}>
                {settings.cron_enabled === 'true' ? '✅ Activé' : '🔴 Désactivé'}
              </span>
            </div>

            <div className="status-item">
              <span className="label">État:</span>
              <span className={`status-badge ${status?.isScanning ? 'scanning' : 'idle'}`}>
                {status?.isScanning ? '🔄 Scan en cours' : '⏸️ En attente'}
              </span>
            </div>
            
            <div className="status-item">
              <span className="label">Planification:</span>
              <span className="value">
                <code>{settings.cron_schedule}</code>
              </span>
            </div>

            <div className="status-item">
              <span className="label">Fuseau horaire:</span>
              <span className="value">{settings.scan_timezone || status?.timezone}</span>
            </div>

            {status?.lastScanTime && (
              <div className="status-item">
                <span className="label">Dernier scan:</span>
                <span className="value">
                  {new Date(status.lastScanTime).toLocaleString('fr-FR')}
                </span>
              </div>
            )}

            {status?.nextScanEstimate && settings.cron_enabled === 'true' && (
              <div className="status-item">
                <span className="label">Prochain scan:</span>
                <span className="value next-scan">
                  {new Date(status.nextScanEstimate).toLocaleString('fr-FR')}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="cron-card info-card">
          <div className="card-header">
            <Info size={24} />
            <h2>Informations</h2>
          </div>
          <div className="info-content">
            <div className="info-box">
              <h3>🔍 Fonctionnement du Scanner</h3>
              <ul>
                <li>✅ Vérifie toutes les banques actives</li>
                <li>✅ Détecte les nouveaux fichiers CSV</li>
                <li>✅ Traite automatiquement les fichiers</li>
                <li>✅ Valide et archive les fichiers</li>
                <li>✅ Génère des logs détaillés</li>
              </ul>
            </div>

            <div className="info-box cron-explanation">
              <h3>📝 Format CRON expliqué</h3>
              <div className="cron-format">
                <pre>
{`┌───────────── minute (0 - 59)
│ ┌───────────── heure (0 - 23)
│ │ ┌───────────── jour du mois (1 - 31)
│ │ │ ┌───────────── mois (1 - 12)
│ │ │ │ ┌───────────── jour semaine (0-6)
│ │ │ │ │
* * * * *`}
                </pre>
              </div>
              
              <h4>Symboles spéciaux</h4>
              <table className="symbols-table">
                <tbody>
                  <tr>
                    <td><code>*</code></td>
                    <td>Toutes les valeurs</td>
                  </tr>
                  <tr>
                    <td><code>*/n</code></td>
                    <td>Toutes les n unités</td>
                  </tr>
                  <tr>
                    <td><code>n-m</code></td>
                    <td>Plage de n à m</td>
                  </tr>
                  <tr>
                    <td><code>n,m</code></td>
                    <td>Valeurs n et m</td>
                  </tr>
                </tbody>
              </table>

              <h4>Exemples courants</h4>
              <table className="examples-table">
                <tbody>
                  <tr>
                    <td><code>*/5 * * * *</code></td>
                    <td>Toutes les 5 minutes</td>
                  </tr>
                  <tr>
                    <td><code>*/15 * * * *</code></td>
                    <td>Toutes les 15 minutes</td>
                  </tr>
                  <tr>
                    <td><code>0 * * * *</code></td>
                    <td>Toutes les heures (à :00)</td>
                  </tr>
                  <tr>
                    <td><code>0 */2 * * *</code></td>
                    <td>Toutes les 2 heures</td>
                  </tr>
                  <tr>
                    <td><code>0 8 * * *</code></td>
                    <td>Tous les jours à 8h00</td>
                  </tr>
                  <tr>
                    <td><code>0 8 * * 1-5</code></td>
                    <td>Lun-Ven à 8h00</td>
                  </tr>
                  <tr>
                    <td><code>0 9,18 * * *</code></td>
                    <td>À 9h00 et 18h00</td>
                  </tr>
                  <tr>
                    <td><code>0 0 * * *</code></td>
                    <td>Tous les jours à minuit</td>
                  </tr>
                  <tr>
                    <td><code>30 8 * * 1</code></td>
                    <td>Chaque lundi à 8h30</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="logs-section">
        <div className="logs-header">
          <h2>📊 Historique des Scans</h2>
          <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
            <RefreshCw size={16} /> Actualiser
          </button>
        </div>
        
        {logs.length === 0 ? (
          <div className="empty-logs">
            <p>Aucun scan enregistré pour le moment</p>
          </div>
        ) : (
          <div className="logs-table">
            <table>
              <thead>
                <tr>
                  <th>Date & Heure</th>
                  <th>Banques</th>
                  <th>CSV Trouvés</th>
                  <th>CSV Traités</th>
                  <th>Enrolement Trouvés</th>
                  <th>Enrolement Traités</th>
                  <th>Actions</th>
                  <th>Erreurs</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.scan_time).toLocaleString('fr-FR')}</td>
                    <td>{log.banks_scanned}</td>
                    <td>
                      <div className="scan-stat">
                        <span className="stat-number">{log.files_found}</span>
                        <span className={'stat-status ' + (log.files_found >= 0 ? 'success' : 'error')}>
                          {log.files_found > 0 ? 'Fichiers detectes' : 'Aucun fichier'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="scan-stat">
                        <span className="stat-number">{log.files_processed}</span>
                        <span className={'stat-status ' + (log.files_found === 0 || log.files_processed === log.files_found ? 'success' : 'warning')}>
                          {log.files_found === 0 ? 'RAS' : log.files_processed === log.files_found ? 'Tous traites' : 'Partiellement traite'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="scan-stat">
                        <span className="stat-number">{log.enrollment_files_found || 0}</span>
                        <span className={'stat-status ' + ((log.enrollment_files_found || 0) >= 0 ? 'success' : 'error')}>
                          {(log.enrollment_files_found || 0) > 0 ? 'Rapports detectes' : 'Aucun rapport'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="scan-stat">
                        <span className="stat-number">{log.enrollment_files_processed || 0}</span>
                        <span className={'stat-status ' + ((log.enrollment_files_found || 0) === 0 || (log.enrollment_files_processed || 0) === (log.enrollment_files_found || 0) ? 'success' : 'warning')}>
                          {(log.enrollment_files_found || 0) === 0 ? 'RAS' : (log.enrollment_files_processed || 0) === (log.enrollment_files_found || 0) ? 'Tous traites' : 'Partiellement traite'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setSelectedLog(log); setShowLogDetail(true); }}
                      >
                        Voir details
                      </button>
                    </td>
                    <td>
                      {log.errors_count > 0 ? (
                        <span className="error-count">{log.errors_count}</span>
                      ) : (
                        <span className="success-count">0</span>
                      )}
                    </td>
                    <td>
                      {log.errors_count > 0 ? (
                        <span className="badge badge-warning">Avec erreurs</span>
                      ) : (
                        <span className="badge badge-success">Succès</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Détails du Scan */}
      {showLogDetail && selectedLog && (
        <div className="modal-overlay" onClick={() => setShowLogDetail(false)}>
          <div className="scan-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Détails du Scan - {new Date(selectedLog.scan_time).toLocaleString('fr-FR')}</h2>
              <button className="btn-close" onClick={() => setShowLogDetail(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="scan-summary">
                <div className="summary-item">
                  <span className="label">Banques scannées</span>
                  <span className="value">{selectedLog.banks_scanned}</span>
                </div>
                <div className="summary-item success">
                  <span className="label">CSV traités</span>
                  <span className="value">{selectedLog.files_processed}/{selectedLog.files_found}</span>
                </div>
                <div className="summary-item info">
                  <span className="label">Enrôlement traités</span>
                  <span className="value">{selectedLog.enrollment_files_processed || 0}/{selectedLog.enrollment_files_found || 0}</span>
                </div>
              </div>

              <h3>Détails par banque</h3>
              {selectedLog.bank_details && JSON.parse(selectedLog.bank_details).length > 0 ? (
                <div className="bank-details-list">
                  {JSON.parse(selectedLog.bank_details).map((bank, idx) => (
                    <div key={idx} className="bank-detail-card">
                      <div className="bank-header">
                        <span className="bank-name">{bank.bankName}</span>
                        <span className="bank-code">{bank.bankCode}</span>
                      </div>
                      <div className="bank-paths">
                        <div className="path-item">
                          <span className="path-label">CSV Trouvés</span>
                          <span className="path-count">{bank.csvFound}</span>
                          <span className="path-url">{bank.sourceUrl || 'Non configuré'}</span>
                        </div>
                        <div className="path-item">
                          <span className="path-label">CSV Traités</span>
                          <span className="path-count">{bank.csvProcessed}</span>
                          <span className="path-url">{bank.destinationUrl || 'Non configuré'}</span>
                        </div>
                        <div className="path-item">
                          <span className="path-label">CSV Archivés</span>
                          <span className="path-count">-</span>
                          <span className="path-url">{bank.oldUrl || 'Non configuré'}</span>
                        </div>
                        <div className="path-item">
                          <span className="path-label">XML Générés</span>
                          <span className="path-count">{bank.xmlGenerated || 0}</span>
                          <span className="path-url">{bank.xmlOutputUrl || 'Non configuré'}</span>
                        </div>
                        <div className="path-item">
                          <span className="path-label">Enrôlement Trouvés</span>
                          <span className="path-count">{bank.enrollmentFound}</span>
                          <span className="path-url">{bank.enrollmentReportUrl || 'Non configuré'}</span>
                        </div>
                        <div className="path-item">
                          <span className="path-label">Enrôlement Traités</span>
                          <span className="path-count">{bank.enrollmentProcessed}</span>
                          <span className="path-url">-</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-details">Aucun détail disponible pour ce scan</p>
              )}

              {selectedLog.errors_count > 0 && selectedLog.errors_detail && (
                <div className="errors-section">
                  <h3>Erreurs ({selectedLog.errors_count})</h3>
                  <div className="errors-list">
                    {JSON.parse(selectedLog.errors_detail).map((err, idx) => (
                      <div key={idx} className="error-item">
                        <span className="error-bank">{err.bank || 'Système'}</span>
                        <span className="error-msg">{err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CronManager;
