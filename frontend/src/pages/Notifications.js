import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Mail, Settings, Send, Plus, Trash2, ToggleLeft, ToggleRight, TestTube, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import './Notifications.css';

const Notifications = () => {
  const { user } = useAuth();
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from_email: '',
    from_name: 'ACS Banking System',
    enabled: false
  });
  const [banks, setBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState(null);
  const [bankEmails, setBankEmails] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedBank) {
      fetchBankEmails(selectedBank);
    }
  }, [selectedBank]);

  const fetchData = async () => {
    try {
      const [smtpRes, banksRes, logsRes] = await Promise.all([
        api.get('/notifications/smtp'),
        api.get('/banks'),
        api.get('/notifications/logs?limit=20')
      ]);
      
      if (smtpRes.data.data) {
        setSmtpConfig(prev => ({
          ...prev,
          host: smtpRes.data.data.host || '',
          port: smtpRes.data.data.port || 587,
          secure: smtpRes.data.data.secure || false,
          username: smtpRes.data.data.username || '',
          from_email: smtpRes.data.data.from_email || '',
          from_name: smtpRes.data.data.from_name || 'ACS Banking System',
          enabled: smtpRes.data.data.enabled || false,
          password: ''
        }));
      }
      setBanks(banksRes.data.data || []);
      setLogs(logsRes.data.data || []);
      
      if (banksRes.data.data && banksRes.data.data.length > 0) {
        setSelectedBank(banksRes.data.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBankEmails = async (bankId) => {
    try {
      const res = await api.get('/notifications/emails/' + bankId);
      setBankEmails(res.data.data || []);
    } catch (error) {
      console.error('Error fetching bank emails:', error);
    }
  };

  const handleSaveSmtp = async () => {
    setSaving(true);
    try {
      await api.put('/notifications/smtp', smtpConfig);
      alert('Configuration SMTP sauvegardee!');
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post('/notifications/smtp/test');
      setTestResult(res.data);
    } catch (error) {
      setTestResult({ success: false, message: error.response?.data?.message || error.message });
    } finally {
      setTesting(false);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      alert('Email invalide');
      return;
    }
    try {
      await api.post('/notifications/emails/' + selectedBank, { email: newEmail });
      setNewEmail('');
      fetchBankEmails(selectedBank);
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDeleteEmail = async (id) => {
    if (!window.confirm('Supprimer cet email?')) return;
    try {
      await api.delete('/notifications/emails/' + id);
      fetchBankEmails(selectedBank);
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleToggleEmail = async (id) => {
    try {
      await api.put('/notifications/emails/' + id + '/toggle');
      fetchBankEmails(selectedBank);
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleSendReport = async (bankId) => {
    setSending(true);
    try {
      const res = await api.post('/notifications/send/' + bankId);
      if (res.data.success) {
        alert('Rapport envoye avec succes!');
        fetchData();
      } else {
        alert('Erreur: ' + res.data.message);
      }
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    } finally {
      setSending(false);
    }
  };

  const handleSendAllReports = async () => {
    if (!window.confirm('Envoyer les rapports a toutes les banques?')) return;
    setSending(true);
    try {
      const res = await api.post('/notifications/send-all');
      if (res.data.success) {
        alert('Rapports envoyes!');
        fetchData();
      } else {
        alert('Erreur: ' + res.data.message);
      }
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    } finally {
      setSending(false);
    }
  };

  if (user?.role !== 'super_admin') {
    return <div className="access-denied">Acces refuse</div>;
  }

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <div className="notifications-page">
      <div className="page-header">
        <h1><Mail size={28} /> Notifications Email</h1>
        <p>Configuration SMTP et envoi des rapports quotidiens</p>
      </div>

      <div className="notifications-grid">
        <div className="smtp-section">
          <div className="section-header">
            <h2><Settings size={20} /> Configuration SMTP</h2>
          </div>
          <div className="smtp-form">
            <div className="form-row">
              <div className="form-group">
                <label>Serveur SMTP</label>
                <input
                  type="text"
                  value={smtpConfig.host}
                  onChange={(e) => setSmtpConfig({...smtpConfig, host: e.target.value})}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="form-group small">
                <label>Port</label>
                <input
                  type="number"
                  value={smtpConfig.port}
                  onChange={(e) => setSmtpConfig({...smtpConfig, port: parseInt(e.target.value)})}
                />
              </div>
              <div className="form-group small">
                <label>SSL/TLS</label>
                <select
                  value={smtpConfig.secure ? 'true' : 'false'}
                  onChange={(e) => setSmtpConfig({...smtpConfig, secure: e.target.value === 'true'})}
                >
                  <option value="false">Non</option>
                  <option value="true">Oui</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Utilisateur</label>
                <input
                  type="text"
                  value={smtpConfig.username}
                  onChange={(e) => setSmtpConfig({...smtpConfig, username: e.target.value})}
                  placeholder="user@example.com"
                />
              </div>
              <div className="form-group">
                <label>Mot de passe</label>
                <input
                  type="password"
                  value={smtpConfig.password}
                  onChange={(e) => setSmtpConfig({...smtpConfig, password: e.target.value})}
                  placeholder="Laisser vide pour ne pas changer"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email expediteur</label>
                <input
                  type="email"
                  value={smtpConfig.from_email}
                  onChange={(e) => setSmtpConfig({...smtpConfig, from_email: e.target.value})}
                  placeholder="noreply@example.com"
                />
              </div>
              <div className="form-group">
                <label>Nom expediteur</label>
                <input
                  type="text"
                  value={smtpConfig.from_name}
                  onChange={(e) => setSmtpConfig({...smtpConfig, from_name: e.target.value})}
                  placeholder="ACS Banking System"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={smtpConfig.enabled}
                    onChange={(e) => setSmtpConfig({...smtpConfig, enabled: e.target.checked})}
                  />
                  Activer les notifications email
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleSaveSmtp} disabled={saving}>
                {saving ? <RefreshCw size={16} className="spin" /> : <Settings size={16} />}
                Sauvegarder
              </button>
              <button className="btn btn-secondary" onClick={handleTestSmtp} disabled={testing}>
                {testing ? <RefreshCw size={16} className="spin" /> : <TestTube size={16} />}
                Tester connexion
              </button>
            </div>
            {testResult && (
              <div className={'test-result ' + (testResult.success ? 'success' : 'error')}>
                {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {testResult.message}
              </div>
            )}
          </div>
        </div>

        <div className="emails-section">
          <div className="section-header">
            <h2><Mail size={20} /> Emails par banque</h2>
            <select value={selectedBank || ''} onChange={(e) => setSelectedBank(parseInt(e.target.value))}>
              {banks.map(bank => (
                <option key={bank.id} value={bank.id}>{bank.name}</option>
              ))}
            </select>
          </div>
          
          <div className="add-email-form">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Ajouter un email..."
            />
            <button className="btn btn-primary" onClick={handleAddEmail}>
              <Plus size={16} /> Ajouter
            </button>
          </div>

          <div className="emails-list">
            {bankEmails.length === 0 ? (
              <p className="no-emails">Aucun email configure pour cette banque</p>
            ) : (
              bankEmails.map(email => (
                <div key={email.id} className={'email-item ' + (email.is_active ? 'active' : 'inactive')}>
                  <span className="email-address">{email.email}</span>
                  <div className="email-actions">
                    <button onClick={() => handleToggleEmail(email.id)} title={email.is_active ? 'Desactiver' : 'Activer'}>
                      {email.is_active ? <ToggleRight size={20} className="active" /> : <ToggleLeft size={20} />}
                    </button>
                    <button onClick={() => handleDeleteEmail(email.id)} className="delete" title="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="send-actions">
            <button className="btn btn-primary" onClick={() => handleSendReport(selectedBank)} disabled={sending}>
              {sending ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
              Envoyer rapport
            </button>
            <button className="btn btn-secondary" onClick={handleSendAllReports} disabled={sending}>
              <Send size={16} /> Envoyer a toutes les banques
            </button>
            <button className="btn btn-secondary" onClick={() => setShowPreview(true)}>
              <Mail size={16} /> Apercu du template
            </button>
          </div>
        </div>
      </div>

      <div className="logs-section">
        <div className="section-header">
          <h2><Clock size={20} /> Historique des envois</h2>
          <button className="btn btn-secondary btn-sm" onClick={fetchData}>
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Banque</th>
                <th>Email</th>
                <th>Sujet</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan="5" className="no-data">Aucun envoi</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.sent_at).toLocaleString('fr-FR')}</td>
                    <td>{log.bank_name || '-'}</td>
                    <td>{log.email}</td>
                    <td className="subject-cell">{log.subject}</td>
                    <td>
                      <span className={'status-badge ' + log.status}>
                        {log.status === 'sent' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                        {log.status === 'sent' ? 'Envoye' : 'Echec'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal Aperçu Template */}
      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="email-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Aperçu du Template Email</h2>
              <button className="btn-close" onClick={() => setShowPreview(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="email-template-preview">
                <div className="email-header-preview">
                  <h1>Rapport Quotidien ACS</h1>
                  <p>{banks.find(b => b.id === selectedBank)?.name || 'Nom de la Banque'} - {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <div className="email-content-preview">
                  <div className="email-section">
                    <h3>Fichiers CSV Traités</h3>
                    <div className="email-stats-grid">
                      <div className="email-stat info">
                        <span className="value">5</span>
                        <span className="label">Fichiers traités</span>
                      </div>
                      <div className="email-stat">
                        <span className="value">150</span>
                        <span className="label">Lignes valides</span>
                      </div>
                    </div>
                  </div>
                  <div className="email-section">
                    <h3>Statut Enrôlement</h3>
                    <div className="email-stats-grid">
                      <div className="email-stat success">
                        <span className="value">120</span>
                        <span className="label">Enrôlements OK</span>
                      </div>
                      <div className="email-stat error">
                        <span className="value">10</span>
                        <span className="label">Enrôlements échoués</span>
                      </div>
                      <div className="email-stat warning">
                        <span className="value">20</span>
                        <span className="label">En attente</span>
                      </div>
                      <div className="email-stat info">
                        <span className="value">3</span>
                        <span className="label">Fichiers XML générés</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="email-footer-preview">
                  <p>Ce rapport a été généré automatiquement par le système ACS Banking.</p>
                  <p>Ne pas répondre à cet email.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
