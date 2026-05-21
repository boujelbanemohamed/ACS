import React, { useState, useEffect } from 'react';
import { Shield, Check, X, RefreshCw, Save } from 'lucide-react';
import api from '../services/api';
import './RoleFeatures.css';

const FEATURE_LABELS = {
  dashboard: 'Dashboard',
  banks: 'Banques',
  processing: 'Traitement',
  records: 'Enregistrements',
  history: 'Historique',
  xml_logs: 'Logs XML',
  enrollment: 'Enrôlement',
  api_keys: 'Clés API',
  users: 'Utilisateurs',
  audit_logs: 'Journal activité',
  cron: 'Scan automatique',
  notifications: 'Notifications',
  monitoring: 'Monitoring',
  settings: 'Paramètres',
};

const ROLE_LABELS = {
  bank_admin: 'Admin Banque',
  bank: 'Banque (User)',
};

const RoleFeaturesPage = () => {
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    fetchFeatures();
  }, []);

  const fetchFeatures = async () => {
    setLoading(true);
    try {
      const res = await api.get('/role-features');
      setFeatures(res.data.data || {});
    } catch (err) {
      console.error('Error fetching features:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFeature = async (role, feature, currentValue) => {
    const newValue = !currentValue;
    setSaving(`${role}-${feature}`);
    try {
      await api.put(`/role-features/${role}/${feature}`, { enabled: newValue });
      setFeatures(prev => ({
        ...prev,
        [role]: { ...prev[role], [feature]: newValue },
      }));
    } catch (err) {
      console.error('Error updating feature:', err);
    } finally {
      setSaving(null);
    }
  };

  const resetDefaults = async () => {
    if (!window.confirm('Réinitialiser toutes les permissions aux valeurs par défaut ?')) return;
    try {
      await api.post('/role-features/reset');
      fetchFeatures();
    } catch (err) {
      console.error('Error resetting features:', err);
    }
  };

  if (loading) {
    return (
      <div className="role-features-page">
        <div className="loading"><RefreshCw size={32} className="spin" /> Chargement...</div>
      </div>
    );
  }

  const allFeatures = Object.keys(FEATURE_LABELS);
  const roles = Object.keys(features);

  return (
    <div className="role-features-page">
      <div className="page-header">
        <h1><Shield size={28} /> Gestion des Permissions</h1>
        <button className="btn btn-secondary" onClick={resetDefaults}>
          <RefreshCw size={16} /> Réinitialiser
        </button>
      </div>

      <div className="features-card">
        <div className="features-table-wrapper">
          <table className="features-table">
            <thead>
              <tr>
                <th>Fonctionnalité</th>
                {roles.map(role => (
                  <th key={role}>{ROLE_LABELS[role] || role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFeatures.map(feature => (
                <tr key={feature}>
                  <td className="feature-name">{FEATURE_LABELS[feature] || feature}</td>
                  {roles.map(role => {
                    const enabled = features[role]?.[feature];
                    const isSaving = saving === `${role}-${feature}`;
                    return (
                      <td key={role}>
                        <button
                          className={`feature-toggle ${enabled ? 'enabled' : 'disabled'} ${isSaving ? 'saving' : ''}`}
                          onClick={() => toggleFeature(role, feature, enabled)}
                          disabled={isSaving}
                          title={enabled ? 'Désactiver' : 'Activer'}
                        >
                          {isSaving ? (
                            <RefreshCw size={16} className="spin" />
                          ) : enabled ? (
                            <Check size={16} />
                          ) : (
                            <X size={16} />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RoleFeaturesPage;
