import React, { useState, useEffect } from 'react';
import { Clock, PlayCircle, RefreshCw, Settings, Save, Power, Trash2 } from 'lucide-react';
import api from '../services/api';
import './CronManager.css';

const PRESETS = [
  { value: '*/1 * * * *', label: 'Toutes les minutes' },
  { value: '*/5 * * * *', label: 'Toutes les 5 min' },
  { value: '*/10 * * * *', label: 'Toutes les 10 min' },
  { value: '*/15 * * * *', label: 'Toutes les 15 min' },
  { value: '*/30 * * * *', label: 'Toutes les 30 min' },
  { value: '0 * * * *', label: 'Toutes les heures' },
  { value: '0 */2 * * *', label: 'Toutes les 2h' },
  { value: '0 8 * * *', label: 'Chaque jour à 8h' },
  { value: '0 0 * * *', label: 'Chaque jour minuit' },
];

const CronManager = () => {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [schedule, setSchedule] = useState('*/5 * * * *');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [statusRes, logsRes, settingsRes] = await Promise.all([
        api.get('/scanner/status'),
        api.get('/scanner/logs?limit=10'),
        api.get('/settings')
      ]);
      setStatus(statusRes.data.data);
      setLogs(logsRes.data.data);
      if (settingsRes.data.data) {
        setSchedule(settingsRes.data.data.cron_schedule || '*/5 * * * *');
        setEnabled(settingsRes.data.data.cron_enabled !== 'false');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.post('/settings/bulk', { settings: { cron_schedule: schedule, cron_enabled: enabled.toString() } });
      setShowSettings(false);
      fetchData();
    } catch (err) {
      alert('Erreur: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const toggleCron = async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await api.put('/settings/cron_enabled', { value: next.toString() });
      fetchData();
    } catch (err) {
      setEnabled(!next);
    }
  };

  const triggerScan = async () => {
    setScanning(true);
    try {
      await api.post('/scanner/trigger');
      fetchData();
    } catch (err) {
      alert('Erreur: ' + (err.response?.data?.message || err.message));
    } finally {
      setScanning(false);
    }
  };

  if (loading) return <div className="cron-loading">Chargement...</div>;

  return (
    <div className="cron-manager">
      <div className="cron-header">
        <h1><Clock size={28} /> Scan Automatique</h1>
        <div className="cron-actions">
          <button className="btn btn-outline" onClick={() => setShowSettings(!showSettings)}>
            <Settings size={18} /> Config
          </button>
          <button className={`btn ${enabled ? 'btn-success' : 'btn-danger'}`} onClick={toggleCron}>
            <Power size={18} /> {enabled ? 'Activé' : 'Désactivé'}
          </button>
          <button className="btn btn-primary" onClick={triggerScan} disabled={scanning || status?.isScanning}>
            {scanning || status?.isScanning ? <><RefreshCw size={18} className="spin" /> Scan...</> : <><PlayCircle size={18} /> Scan</>}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="cron-settings">
          <div className="settings-row">
            <label>Fréquence</label>
            <select value={schedule} onChange={e => setSchedule(e.target.value)}>
              {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="settings-row">
            <label>Expression personnalisée</label>
            <input type="text" value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="*/5 * * * *" />
          </div>
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
            <Save size={18} /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      )}

      <div className="cron-cards">
        <div className="cron-card">
          <h2>Statut</h2>
          <div className="stat-row"><span>Scanner</span><span className={`badge ${enabled ? 'badge-on' : 'badge-off'}`}>{enabled ? 'Activé' : 'Désactivé'}</span></div>
          <div className="stat-row"><span>État</span><span className={`badge ${status?.isScanning ? 'badge-scan' : 'badge-idle'}`}>{status?.isScanning ? 'Scan en cours' : 'En attente'}</span></div>
          <div className="stat-row"><span>Planification</span><code>{schedule}</code></div>
          <div className="stat-row"><span>Fuseau</span><span>{status?.timezone || 'Africa/Tunis'}</span></div>
          {status?.lastScan && <div className="stat-row"><span>Dernier scan</span><span>{new Date(status.lastScan).toLocaleString('fr-FR')}</span></div>}
          {status?.nextScan && enabled && <div className="stat-row"><span>Prochain scan</span><span className="next">{new Date(status.nextScan).toLocaleString('fr-FR')}</span></div>}
        </div>

        <div className="cron-card">
          <h2>Historique</h2>
          {logs.length === 0 ? (
            <p className="empty">Aucun scan</p>
          ) : (
            <table className="log-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Banques</th>
                  <th>Trouvés</th>
                  <th>Traités</th>
                  <th>Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.scan_time).toLocaleString('fr-FR')}</td>
                    <td>{log.banks_scanned}</td>
                    <td>{log.files_found}</td>
                    <td>{log.files_processed}</td>
                    <td>{log.errors_count > 0 ? <span className="err">{log.errors_count}</span> : <span className="ok">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default CronManager;
