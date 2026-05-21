import React, { useState, useEffect } from 'react';
import { Shield, Check, X, RefreshCw, Building2, Users, AlertCircle, Info } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './RoleFeatures.css';

const FEATURE_LABELS = {
  dashboard: 'Dashboard', banks: 'Banques', processing: 'Traitement',
  records: 'Enregistrements', history: 'Historique', xml_logs: 'Logs XML',
  enrollment: 'Enrôlement', api_keys: 'Clés API', users: 'Utilisateurs',
  audit_logs: 'Journal activité', cron: 'Scan automatique',
  notifications: 'Notifications', monitoring: 'Monitoring', settings: 'Paramètres',
  permissions: 'Permissions',
};

const ALL_FEATURES = Object.keys(FEATURE_LABELS);

const FeatureToggle = ({ enabled, saving, onToggle }) => (
  <button
    className={`feature-toggle ${enabled ? 'enabled' : 'disabled'} ${saving ? 'saving' : ''}`}
    onClick={onToggle}
    disabled={saving}
    title={enabled ? 'Désactiver' : 'Activer'}
  >
    {saving ? <RefreshCw size={16} className="spin" /> : enabled ? <Check size={16} /> : <X size={16} />}
  </button>
);

const RoleFeaturesPage = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isBankAdmin = user?.role === 'bank_admin';
  const [tab, setTab] = useState(isBankAdmin ? 'banks' : 'roles');
  const [features, setFeatures] = useState({});
  const [banks, setBanks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState(isBankAdmin ? (user?.bank_id?.toString() || '') : '');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [bankOverrides, setBankOverrides] = useState({});
  const [userOverrides, setUserOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (selectedBankId) fetchBankOverrides(selectedBankId);
    if (selectedUserId) fetchUserOverrides(selectedUserId);
  }, [selectedBankId, selectedUserId]);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const bRes = await api.get('/role-features/banks');
      const banksData = bRes.data.data || [];
      setBanks(banksData);
      if (isSuperAdmin) {
        const fRes = await api.get('/role-features');
        setFeatures(fRes.data.data || {});
      }
      if (isBankAdmin && banksData.length > 0) {
        const bankId = banksData[0].id.toString();
        setSelectedBankId(bankId);
      }
    } catch (err) {
      const msg = err.response?.status === 403
        ? 'Accès refusé.'
        : err.response?.data?.message || err.message || 'Erreur de chargement';
      setError(msg);
      console.error('RoleFeatures fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBankOverrides = async (bankId) => {
    try {
      const res = await api.get(`/role-features/bank/${bankId}`);
      setBankOverrides(res.data.data || {});
    } catch (err) {
      console.error('fetchBankOverrides error:', err);
    }
  };

  const fetchUserOverrides = async (userId) => {
    try {
      const res = await api.get(`/role-features/user/${userId}`);
      setUserOverrides(res.data.data || {});
    } catch (err) {
      console.error('fetchUserOverrides error:', err);
    }
  };

  const fetchUsersForBank = async (bankId) => {
    try {
      const params = bankId ? `?bankId=${bankId}` : '';
      const res = await api.get(`/role-features/users${params}`);
      setUsers(res.data.data || []);
    } catch (err) {
      console.error('fetchUsersForBank error:', err);
    }
  };

  const handleBankSelect = (bankId) => {
    setSelectedBankId(bankId);
    setSelectedUserId('');
    setBankOverrides({});
    setUserOverrides({});
    if (bankId) {
      fetchBankOverrides(bankId);
      fetchUsersForBank(bankId);
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUserId(userId);
    setUserOverrides({});
    if (userId) fetchUserOverrides(userId);
  };

  const handleToggle = async (level, role, feature, currentValue) => {
    const newValue = level === 'role' ? !currentValue : currentValue === undefined ? false : !currentValue;
    setSavingKey(`${level}-${role || selectedBankId || selectedUserId}-${feature}`);

    try {
      if (level === 'role') {
        await api.put(`/role-features/role/${role}/${feature}`, { enabled: newValue });
        setFeatures(prev => ({
          ...prev, roles: { ...prev.roles, [role]: { ...prev.roles?.[role], [feature]: newValue } }
        }));
      } else if (level === 'bank') {
        if (currentValue === undefined) {
          await api.put(`/role-features/bank/${selectedBankId}/${feature}`, { enabled: false });
        } else if (!currentValue) {
          await api.put(`/role-features/bank/${selectedBankId}/${feature}`, { enabled: true });
        } else {
          await api.delete(`/role-features/bank/${selectedBankId}/${feature}`);
        }
        fetchBankOverrides(selectedBankId);
      } else if (level === 'user') {
        if (currentValue === undefined) {
          await api.put(`/role-features/user/${selectedUserId}/${feature}`, { enabled: false });
        } else if (!currentValue) {
          await api.put(`/role-features/user/${selectedUserId}/${feature}`, { enabled: true });
        } else {
          await api.delete(`/role-features/user/${selectedUserId}/${feature}`);
        }
        fetchUserOverrides(selectedUserId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <div className="role-features-page"><div className="loading"><RefreshCw size={32} className="spin" /> Chargement...</div></div>;
  }

  return (
    <div className="role-features-page">
      <div className="page-header">
        <h1><Shield size={28} /> Gestion des Permissions</h1>
        <button className="refresh-btn" onClick={fetchAll} title="Rafraîchir">
          <RefreshCw size={16} /> Rafraîchir
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      <div className="permission-tabs">
        {isSuperAdmin && (
          <button className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>
            <Shield size={16} /> Par Rôle
          </button>
        )}
        <button className={`tab ${tab === 'banks' ? 'active' : ''}`} onClick={() => setTab('banks')}>
          <Building2 size={16} /> Par Banque
        </button>
        <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          <Users size={16} /> Par Utilisateur
        </button>
      </div>

      {tab === 'roles' && (
        <div className="features-card">
          <table className="features-table">
            <thead>
              <tr>
                <th>Fonctionnalité</th>
                <th>Admin Banque</th>
                <th>Banque (User)</th>
              </tr>
            </thead>
            <tbody>
              {ALL_FEATURES.map(feature => (
                <tr key={feature}>
                  <td className="feature-name">{FEATURE_LABELS[feature]}</td>
                  {['bank_admin', 'bank'].map(role => (
                    <td key={role}>
                      <FeatureToggle
                        enabled={features.roles?.[role]?.[feature]}
                        saving={savingKey === `role-${role}-${feature}`}
                        onToggle={() => handleToggle('role', role, feature, features.roles?.[role]?.[feature])}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'banks' && (
        <div className="permission-context">
          <div className="context-selector">
            <Building2 size={18} />
            {isBankAdmin ? (
              <div className="bank-admin-info">
                <span className="bank-name-display">
                  {banks.find(b => b.id.toString() === selectedBankId)?.name || 'Votre banque'}
                </span>
                <Info size={14} className="info-icon" title="Vous gérez les permissions pour votre banque" />
              </div>
            ) : (
              <select value={selectedBankId} onChange={e => handleBankSelect(e.target.value)}>
                <option value="">Sélectionnez une banque...</option>
                {banks.length > 0 ? (
                  banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)
                ) : (
                  <option disabled>Aucune banque active</option>
                )}
              </select>
            )}
            {banks.length === 0 && !error && (
              <span className="context-hint">Aucune banque trouvée</span>
            )}
          </div>

          {selectedBankId && (
            <div className="features-card">
              <p className="override-hint">
                Les surcharges banque prennent priorité sur les defaults de rôle.
              </p>
              <table className="features-table">
                <thead>
                  <tr>
                    <th>Fonctionnalité</th>
                    <th>Default Rôle</th>
                    <th>Surcharge Banque</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_FEATURES.map(f => {
                    const defaultVal = features.roles?.bank_admin?.[f];
                    return (
                      <tr key={f}>
                        <td className="feature-name">{FEATURE_LABELS[f]}</td>
                        <td>
                          <span className={`default-indicator ${defaultVal ? 'on' : 'off'}`}>
                            {defaultVal ? '✅ Activé' : '❌ Désactivé'}
                          </span>
                        </td>
                        <td>
                          <FeatureToggle
                            enabled={bankOverrides[f]}
                            saving={savingKey === `bank-${f}`}
                            onToggle={() => handleToggle('bank', null, f, bankOverrides[f])}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="permission-context">
          <div className="context-selector">
            <Building2 size={18} />
            {isBankAdmin ? (
              <div className="bank-admin-info">
                <span className="bank-name-display">
                  {banks.find(b => b.id.toString() === selectedBankId)?.name || 'Votre banque'}
                </span>
              </div>
            ) : (
              <select value={selectedBankId} onChange={e => handleBankSelect(e.target.value)}>
                <option value="">Toutes les banques</option>
                {banks.length > 0 ? (
                  banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)
                ) : (
                  <option disabled>Aucune banque active</option>
                )}
              </select>
            )}
            <Users size={18} />
            <select value={selectedUserId} onChange={e => handleUserSelect(e.target.value)} disabled={!selectedBankId && banks.length === 0}>
              <option value="">Sélectionnez un utilisateur...</option>
              {users.length > 0 ? (
                users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.role} - {u.bank_name || 'N/A'})</option>)
              ) : (
                <option disabled>{banks.length > 0 ? 'Aucun utilisateur' : 'Sélectionnez d\'abord une banque'}</option>
              )}
            </select>
          </div>

          {selectedUserId && (
            <div className="features-card">
              <p className="override-hint">
                Les surcharges utilisateur prennent priorité sur tout (banque + rôle).
              </p>
              <table className="features-table">
                <thead>
                  <tr>
                    <th>Fonctionnalité</th>
                    <th>Surcharge Utilisateur</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_FEATURES.map(f => (
                    <tr key={f}>
                      <td className="feature-name">{FEATURE_LABELS[f]}</td>
                      <td>
                        <FeatureToggle
                          enabled={userOverrides[f]}
                          saving={savingKey === `user-${f}`}
                          onToggle={() => handleToggle('user', null, f, userOverrides[f])}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoleFeaturesPage;
