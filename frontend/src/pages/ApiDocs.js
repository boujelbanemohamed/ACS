import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import './ApiDocs.css';

const METHOD_COLORS = {
  GET: '#22c55e',
  POST: '#3b82f6',
  PUT: '#f59e0b',
  PATCH: '#8b5cf6',
  DELETE: '#ef4444',
};

const AUTH_BADGES = {
  jwt: { label: 'JWT', class: 'auth-jwt' },
  api_key: { label: 'API Key', class: 'auth-apikey' },
  none: { label: 'Public', class: 'auth-none' },
};

function ApiDocs() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState(null);
  const [expandedEndpoint, setExpandedEndpoint] = useState(null);

  useEffect(() => {
    if (user?.role !== 'super_admin') return;
    api.get('/api-docs')
      .then(res => {
        setData(res.data.data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.message || 'Erreur de chargement');
        setLoading(false);
      });
  }, [user]);

  if (user?.role !== 'super_admin') {
    return <div className="access-denied"><div className="access-denied-icon">🔒</div><h2>Accès réservé</h2><p>Cette section est accessible uniquement aux super administrateurs.</p></div>;
  }

  if (loading) return <div className="loading-screen">Chargement de la documentation...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!data) return null;

  const groups = Object.entries(data.groups);
  const filteredGroups = groups.filter(([, group]) =>
    !search || group.title.toLowerCase().includes(search.toLowerCase()) ||
    group.endpoints.some(ep =>
      ep.path.toLowerCase().includes(search.toLowerCase()) ||
      ep.description.toLowerCase().includes(search.toLowerCase())
    )
  );

  const toggleEndpoint = (key) => {
    setExpandedEndpoint(expandedEndpoint === key ? null : key);
  };

  return (
    <div className="api-docs-page">
      <div className="api-docs-header">
        <div>
          <h1>Documentation API</h1>
          <p className="api-docs-subtitle">{data.description}</p>
        </div>
        <div className="api-docs-meta">
          <span className="api-version">v{data.version}</span>
          <span className="api-base-url">{data.baseUrl}</span>
        </div>
      </div>

      <div className="api-docs-search">
        <input
          type="text"
          placeholder="Rechercher un endpoint, une ressource..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="endpoint-count">{data.groups && Object.values(data.groups).reduce((a, g) => a + g.endpoints.length, 0)} endpoints</span>
      </div>

      <div className="api-docs-content">
        <nav className="api-docs-nav">
          {filteredGroups.map(([key, group]) => (
            <button
              key={key}
              className={`api-nav-item ${activeGroup === key ? 'active' : ''}`}
              onClick={() => setActiveGroup(activeGroup === key ? null : key)}
            >
              <span className="nav-item-title">{group.title}</span>
              <span className="nav-item-count">{group.endpoints.length}</span>
            </button>
          ))}
        </nav>

        <div className="api-docs-main">
          {filteredGroups.map(([key, group]) => {
            const isActive = activeGroup === key;
            if (activeGroup !== null && !isActive) return null;

            return (
              <section key={key} id={`group-${key}`} className="api-group">
                <div className="api-group-header" onClick={() => setActiveGroup(activeGroup === key ? null : key)}>
                  <h2>{group.title}</h2>
                  <p className="group-description">{group.description}</p>
                  <code className="group-base-path">{group.basePath}</code>
                </div>

                <div className="endpoint-list">
                  {group.endpoints.map((ep, i) => {
                    const epKey = `${key}-${i}`;
                    const isExpanded = expandedEndpoint === epKey;

                    return (
                      <div key={epKey} className={`endpoint-card ${isExpanded ? 'expanded' : ''}`}>
                        <div className="endpoint-summary" onClick={() => toggleEndpoint(epKey)}>
                          <span className={`method-badge method-${ep.method.toLowerCase()}`} style={{ backgroundColor: METHOD_COLORS[ep.method] || '#666' }}>
                            {ep.method}
                          </span>
                          <code className="endpoint-path">{ep.path}</code>
                          <span className="endpoint-desc">{ep.description}</span>
                          <div className="endpoint-meta">
                            {ep.auth && AUTH_BADGES[ep.auth] && (
                              <span className={`auth-badge ${AUTH_BADGES[ep.auth].class}`}>{AUTH_BADGES[ep.auth].label}</span>
                            )}
                            <span className="endpoint-roles">{ep.roles?.join(', ')}</span>
                          </div>
                          <span className="expand-icon">{isExpanded ? '−' : '+'}</span>
                        </div>

                        {isExpanded && (
                          <div className="endpoint-details">
                            {ep.body && (
                              <div className="detail-section">
                                <h4>Corps de la requête</h4>
                                <pre className="detail-pre">{JSON.stringify(ep.body, null, 2)}</pre>
                              </div>
                            )}
                            {ep.params && (
                              <div className="detail-section">
                                <h4>Paramètres</h4>
                                <pre className="detail-pre">{JSON.stringify(ep.params, null, 2)}</pre>
                              </div>
                            )}
                            {ep.response && (
                              <div className="detail-section">
                                <h4>Exemple de réponse</h4>
                                <pre className="detail-pre">{JSON.stringify(ep.response, null, 2)}</pre>
                              </div>
                            )}
                            <div className="detail-section">
                              <h4>Informations</h4>
                              <table className="detail-table">
                                <tbody>
                                  <tr><td>Méthode</td><td><span className={`method-badge method-${ep.method.toLowerCase()}`} style={{ backgroundColor: METHOD_COLORS[ep.method] }}>{ep.method}</span></td></tr>
                                  <tr><td>Chemin</td><td><code>{group.basePath}{ep.path}</code></td></tr>
                                  <tr><td>Authentification</td><td>{ep.auth === 'none' ? 'Aucune (publique)' : ep.auth === 'jwt' ? 'JWT (Bearer token)' : 'API Key (X-API-Key)'}</td></tr>
                                  <tr><td>Rôles autorisés</td><td>{ep.roles?.join(', ') || 'Tous'}</td></tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {filteredGroups.length === 0 && (
            <div className="no-results">
              <p>Aucun endpoint trouvé pour "{search}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ApiDocs;
