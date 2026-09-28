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

// Surcharge à trois états : aucune (valeur héritée), forcée désactivée, forcée activée
const OVERRIDE_TITLE = 'Cliquer pour passer à : désactivé (forcé) → activé (forcé) → valeur héritée';
const OverrideToggle = ({ value, saving, onToggle }) => {
  const state = value === undefined || value === null ? 'inherited' : value ? 'enabled' : 'disabled';
  return (
    <button
      className={`override-toggle ${state} ${saving ? 'saving' : ''}`}
      onClick={onToggle}
      disabled={saving}
      title={OVERRIDE_TITLE}
    >
      {saving ? <RefreshCw size={14} className="spin" /> : state === 'enabled' ? <Check size={14} /> : state === 'disabled' ? <X size={14} /> : null}
      <span>{state === 'inherited' ? 'Aucune' : state === 'enabled' ? 'Activé (forcé)' : 'Désactivé (forcé)'}</span>
    </button>
  );
};

const StateLabel = ({ enabled, source }) => (
  <span className={`default-indicator ${enabled ? 'on' : 'off'}`}>
    {enabled ? '✅ Activé' : '❌ Désactivé'}
    {source && <span className="state-source"> ({source})</span>}
  </span>
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
  // Surcharges de la banque de l'utilisateur sélectionné (pour afficher la valeur héritée)
  const [userBankOverrides, setUserBankOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      } else if (isBankAdmin) {
        // Valeurs par défaut des rôles, pour afficher la colonne « Défaut rôle »
        const fRes = await api.get('/role-features/role-defaults');
        setFeatures(fRes.data.data || {});
      }
      if (isBankAdmin && banksData.length > 0) {
        const bankId = banksData[0].id.toString();
        setSelectedBankId(bankId);
        // Pas de liste déroulante de banque pour l'admin de banque : ses utilisateurs sont chargés ici
        fetchUsersForBank(bankId);
      } else if (isSuperAdmin) {
        fetchUsersForBank('');
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

  const handleUserSelect = async (userId) => {
    setSelectedUserId(userId);
    setUserOverrides({});
    setUserBankOverrides({});
    if (!userId) return;
    fetchUserOverrides(userId);
    const selected = users.find(u => String(u.id) === String(userId));
    if (selected?.bank_id) {
      try {
        const res = await api.get(`/role-features/bank/${selected.bank_id}`);
        setUserBankOverrides(res.data.data || {});
      } catch (err) {
        console.error('fetchUserBankOverrides error:', err);
      }
    }
  };

  const handleToggle = async (level, role, feature, currentValue) => {
    const newValue = level === 'role' ? !currentValue : currentValue === undefined ? false : !currentValue;
    setSavingKey(level === 'role' ? `role-${role}-${feature}` : `${level}-${feature}`);

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
        await fetchBankOverrides(selectedBankId);
      } else if (level === 'user') {
        if (currentValue === undefined) {
          await api.put(`/role-features/user/${selectedUserId}/${feature}`, { enabled: false });
        } else if (!currentValue) {
          await api.put(`/role-features/user/${selectedUserId}/${feature}`, { enabled: true });
        } else {
          await api.delete(`/role-features/user/${selectedUserId}/${feature}`);
        }
        await fetchUserOverrides(selectedUserId);
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
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      <div className="tab-bar-wrapper">
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
        <button className="refresh-tab-btn" onClick={fetchAll} title="Rafraîchir les données">
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Rafraîchir
        </button>
      </div>

      {tab === 'roles' && (
        <div className="features-card tab-content">
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
        <div className="permission-context tab-content">
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
                Une surcharge banque s'applique à tous les comptes de la banque et remplace la valeur par défaut du rôle. « Aucune » : la valeur du rôle s'applique.
              </p>
              <table className="features-table">
                <thead>
                  <tr>
                    <th>Fonctionnalité</th>
                    <th>Défaut admin banque</th>
                    <th>Défaut utilisateur</th>
                    <th>Surcharge Banque</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_FEATURES.map(f => {
                    const override = bankOverrides[f];
                    return (
                      <tr key={f}>
                        <td className="feature-name">
                          {FEATURE_LABELS[f]}
                        </td>
                        {['bank_admin', 'bank'].map(role => (
                          <td key={role}>
                            {override === undefined
                              ? <StateLabel enabled={!!features.roles?.[role]?.[f]} />
                              : <span className="overridden-default"><StateLabel enabled={!!features.roles?.[role]?.[f]} /> → <StateLabel enabled={override} /></span>}
                          </td>
                        ))}
                        <td>
                          <OverrideToggle
                            value={override}
                            saving={savingKey === `bank-${f}`}
                            onToggle={() => handleToggle('bank', null, f, override)}
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
        <div className="permission-context tab-content">
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
                Une surcharge utilisateur remplace la valeur de la banque et celle du rôle. « Aucune » : la valeur héritée s'applique.
              </p>
              <table className="features-table">
                <thead>
                  <tr>
                    <th>Fonctionnalité</th>
                    <th>Valeur héritée</th>
                    <th>Surcharge Utilisateur</th>
                    <th>Droit effectif</th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_FEATURES.map(f => {
                    const selectedUser = users.find(u => String(u.id) === String(selectedUserId));
                    const bankValue = userBankOverrides[f];
                    const inherited = bankValue !== undefined ? bankValue : !!features.roles?.[selectedUser?.role]?.[f];
                    const override = userOverrides[f];
                    const effective = override !== undefined ? override : inherited;
                    return (
                    <tr key={f}>
                      <td className="feature-name">
                        {FEATURE_LABELS[f]}
                      </td>
                      <td>
                        {selectedUser?.role === 'super_admin'
                          ? <StateLabel enabled source="super admin" />
                          : <StateLabel enabled={inherited} source={bankValue !== undefined ? 'banque' : 'rôle'} />}
                      </td>
                      <td>
                        <OverrideToggle
                          value={override}
                          saving={savingKey === `user-${f}`}
                          onToggle={() => handleToggle('user', null, f, override)}
                        />
                      </td>
                      <td>
                        <StateLabel enabled={selectedUser?.role === 'super_admin' ? true : effective} />
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
    </div>
  );
};

export default RoleFeaturesPage;
