import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Send, Code, Key, Globe, RefreshCw, CheckCircle, XCircle, Clock, Copy, Terminal, Trash2, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../services/api';
import './ApiTester.css';

const endpoints = [
  {
    id: 'validate',
    label: 'Valider des cartes',
    method: 'POST',
    path: '/api/v1/cards/validate',
    auth: 'api_key',
    description: 'Valide une liste de cartes sans les enregistrer',
    bodyTemplate: `{
  "bankCode": "BT",
  "cards": [
    {
      "pan": "4000056655665556",
      "expiry": "12/28",
      "phone": "21699123456",
      "firstName": "Ahmed",
      "lastName": "BenAli"
    }
  ]
}`
  },
  {
    id: 'register',
    label: 'Enregistrer des cartes',
    method: 'POST',
    path: '/api/v1/cards/register',
    auth: 'api_key',
    description: 'Enregistre des cartes et génère le XML',
    bodyTemplate: `{
  "bankCode": "BT",
  "generateXml": true,
  "cards": [
    {
      "pan": "4222222222222222",
      "expiry": "12/29",
      "phone": "21699555555",
      "firstName": "Jean",
      "lastName": "Dupont",
      "behaviour": "otp",
      "action": "create"
    }
  ]
}`
  },
  {
    id: 'call-api',
    label: 'Appel API Externe',
    method: 'POST',
    path: '/api/processing/call-api',
    auth: 'jwt',
    description: 'Appelle une API externe, récupère et enregistre les données',
    bodyTemplate: `{
  "bankId": 1,
  "url": "https://api.exemple.com/cards",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer token123"
  },
  "authType": "bearer",
  "authToken": "",
  "dataPath": "data.cards",
  "body": {}
}`
  },
  {
    id: 'process-url',
    label: 'Traiter depuis URL',
    method: 'POST',
    path: '/api/processing/process-url',
    auth: 'jwt',
    description: 'Télécharge et traite un fichier CSV depuis une URL',
    bodyTemplate: `{
  "bankId": 1,
  "baseUrl": "https://serveur-externe.com/csv"
}`
  }
];

const statusIcons = {
  idle: null,
  loading: <RefreshCw size={16} className="spin" />,
  success: <CheckCircle size={16} />,
  error: <XCircle size={16} />
};

const errorCatalog = {
  shared: [
    { code: 'API_KEY_REQUIRED', status: 401, message: 'Clé API requise', explanation: 'Aucune clé API fournie. Ajoutez un header X-API-Key ou Authorization: Bearer <votre_clé> dans la requête.', fix: 'Générez une clé API depuis la section Utilisateurs > Clés API, puis collez-la dans le champ "Clé API" en haut du testeur.' },
    { code: 'INVALID_API_KEY', status: 401, message: 'Clé API invalide ou inactive', explanation: 'La clé API fournie ne correspond à aucune clé active dans la base de données.', fix: 'Vérifiez que la clé API est correcte et que son statut est "actif". Générez une nouvelle clé si nécessaire.' },
    { code: 'API_KEY_EXPIRED', status: 401, message: 'Clé API expirée', explanation: 'La clé API a dépassé sa date d\'expiration.', fix: 'Prolongez la date d\'expiration ou générez une nouvelle clé API.' },
    { code: 'AUTH_ERROR', status: 500, message: 'Erreur d\'authentification', explanation: 'Une erreur interne s\'est produite lors de la vérification de la clé API.', fix: 'Vérifiez les logs serveur et l\'état de la base de données.' },
    { code: 'RATE_LIMIT_EXCEEDED', status: 429, message: 'Limite de requêtes dépassée', explanation: 'Trop de requêtes envoyées avec cette clé API dans la dernière minute.', fix: 'Attendez 60 secondes ou augmentez la limite (rateLimit) dans la configuration de la clé API.' }
  ],
  validate: [
    { code: 'INVALID_REQUEST', status: 400, message: 'Requête invalide', explanation: 'Le champ "bankCode" est manquant ou "cards" n\'est pas un tableau.', fix: 'Assurez-vous que le JSON contient "bankCode" (string) et "cards" (array).' },
    { code: 'BANK_NOT_FOUND', status: 404, message: 'Banque non trouvée', explanation: 'Aucune banque active ne correspond au code fourni.', fix: 'Vérifiez le code banque (BT, BIAT, ATB). La banque doit être active.' },
    { code: 'SERVER_ERROR', status: 500, message: 'Erreur serveur', explanation: 'Une exception non gérée s\'est produite côté serveur.', fix: 'Consultez les logs serveur pour plus de détails.' }
  ],
  register: [
    { code: 'INVALID_REQUEST', status: 400, message: 'Requête invalide', explanation: '"bankCode" manquant, ou "cards" n\'est pas un tableau non vide.', fix: 'Fournissez "bankCode" et un tableau "cards" avec au moins une carte.' },
    { code: 'BANK_NOT_FOUND', status: 404, message: 'Banque non trouvée', explanation: 'Aucune banque active ne correspond au code fourni.', fix: 'Vérifiez le code banque (BT, BIAT, ATB).' },
    { code: 'NO_VALID_CARDS', status: 400, message: 'Aucune carte valide', explanation: 'Toutes les cartes envoyées ont échoué la validation (PAN, téléphone, date d\'expiration).', fix: 'Corrigez les erreurs dans chaque carte et réessayez.' },
    { code: 'SERVER_ERROR', status: 500, message: 'Erreur serveur', explanation: 'Une exception non gérée s\'est produite côté serveur.', fix: 'Consultez les logs serveur pour plus de détails.' }
  ],
  'call-api': [
    { code: 'BANK_ID_OR_URL_MISSING', status: 400, message: 'Paramètres manquants', explanation: 'Le champ "bankId" ou "url" est manquant dans le corps de la requête.', fix: 'Ajoutez "bankId" (ID numérique de la banque) et "url" (URL de l\'API externe).' },
    { code: 'EXTERNAL_API_ERROR', status: null, message: 'Erreur API externe', explanation: 'L\'appel vers l\'API externe a échoué (réseau, timeout, ou réponse non-2xx).', fix: 'Vérifiez que l\'URL est correcte et que le serveur distant est accessible.' }
  ],
  'process-url': [
    { code: 'PARAMS_MISSING', status: 400, message: 'Paramètres manquants', explanation: 'Le champ "bankId" ou "baseUrl" est manquant.', fix: 'Ajoutez "bankId" et "baseUrl" dans le corps de la requête JSON.' },
    { code: 'BANK_NOT_FOUND_OR_INACTIVE', status: 404, message: 'Banque non trouvée ou inactive', explanation: 'Aucune banque avec cet ID ou la banque est désactivée.', fix: 'Vérifiez l\'ID de la banque et son statut (actif).' }
  ]
};

const perCardErrors = {
  validate: [
    { field: 'pan', message: 'PAN invalide (13-19 chiffres requis)', explanation: 'Le numéro de carte doit contenir entre 13 et 19 chiffres.', hint: 'Exemple valide : 4000056655665556' },
    { field: 'phone', message: 'Téléphone requis', explanation: 'Le numéro de téléphone est obligatoire pour chaque carte.', hint: 'Exemple : 21699123456' },
    { field: 'expiry', message: 'Format expiry invalide (MM/YY)', explanation: 'La date d\'expiration doit être au format MM/YY (mois à 2 chiffres / année à 2 chiffres).', hint: 'Exemple valide : 12/28' },
    { field: 'expiry', message: 'Mois invalide', explanation: 'Le mois doit être compris entre 01 et 12.', hint: 'Exemple valide : 12/28' },
    { field: 'expiry', message: 'Année invalide', explanation: 'L\'année doit être comprise entre 2024 et 2050.', hint: 'Exemple valide : 12/28' },
    { field: 'expiry', message: 'Carte expirée', explanation: 'La date d\'expiration est déjà dépassée.', hint: 'Utilisez une date future.' }
  ],
  register: [
    { field: 'pan', message: 'PAN invalide', explanation: 'Le numéro de carte doit contenir entre 13 et 19 chiffres.', hint: 'Exemple valide : 4000056655665556' },
    { field: 'phone', message: 'Téléphone requis', explanation: 'Le numéro de téléphone est obligatoire.', hint: 'Exemple : 21699123456' },
    { field: 'expiry', message: 'Format expiry invalide (MM/YY)', explanation: 'La date d\'expiration doit être au format MM/YY.', hint: 'Exemple valide : 12/28' },
    { field: 'expiry', message: 'Mois invalide', explanation: 'Le mois doit être compris entre 01 et 12.', hint: 'Exemple valide : 12/28' },
    { field: 'expiry', message: 'Année invalide', explanation: 'L\'année doit être comprise entre 2024 et 2050.', hint: 'Exemple valide : 12/28' },
    { field: 'expiry', message: 'Carte expirée', explanation: 'La date d\'expiration est déjà dépassée.', hint: 'Utilisez une date future.' }
  ]
};

const ApiTester = () => {
  const { user } = useAuth();
  const [activeEndpoint, setActiveEndpoint] = useState('validate');
  const [apiKey, setApiKey] = useState('');
  const [requestBody, setRequestBody] = useState(endpoints[0].bodyTemplate);
  const [response, setResponse] = useState(null);
  const [status, setStatus] = useState('idle');
  const [responseTime, setResponseTime] = useState(null);
  const [responseHeaders, setResponseHeaders] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [formatError, setFormatError] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    const ep = endpoints.find(e => e.id === activeEndpoint);
    if (ep) setRequestBody(ep.bodyTemplate);
    setResponse(null);
    setStatus('idle');
    setResponseTime(null);
    setFormatError(null);
  }, [activeEndpoint]);

  const endpoint = endpoints.find(e => e.id === activeEndpoint);

  const formatJson = (obj) => {
    try {
      return JSON.stringify(typeof obj === 'string' ? JSON.parse(obj) : obj, null, 2);
    } catch {
      return typeof obj === 'string' ? obj : JSON.stringify(obj);
    }
  };

  const getStatusBadge = (code) => {
    if (!code) return null;
    if (code < 300) return <span className="api-status-badge success">{code}</span>;
    if (code < 500) return <span className="api-status-badge warning">{code}</span>;
    return <span className="api-status-badge error">{code}</span>;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const executeRequest = async () => {
    setFormatError(null);
    let parsedBody;
    try {
      parsedBody = JSON.parse(requestBody);
    } catch (e) {
      setFormatError('JSON invalide : ' + e.message);
      return;
    }

    setStatus('loading');
    setResponse(null);
    setResponseTime(null);
    setResponseHeaders(null);

    const startTime = Date.now();

    try {
      let res;

      if (endpoint.auth === 'api_key') {
        if (!apiKey.trim()) {
          setFormatError('Clé API requise pour cet endpoint');
          setStatus('error');
          return;
        }
        res = await api.post(endpoint.path, parsedBody, {
          headers: { 'X-API-Key': apiKey.trim() }
        });
      } else {
        res = await api.post(endpoint.path, parsedBody);
      }

      setResponse(res.data);
      setResponseHeaders(res.headers);
      setStatus('success');
      setResponseTime(Date.now() - startTime);

      const entry = {
        id: Date.now(),
        endpoint: endpoint.id,
        label: endpoint.label,
        method: endpoint.method,
        path: endpoint.path,
        statusCode: res.status,
        duration: Date.now() - startTime,
        time: new Date().toLocaleString('fr-FR'),
        success: true
      };
      setHistory(prev => [entry, ...prev].slice(0, 20));

    } catch (error) {
      const errData = error.response?.data || { message: error.message };
      const statusCode = error.response?.status || 0;
      setResponse(errData);
      setResponseHeaders(error.response?.headers || null);
      setStatus('error');
      setResponseTime(Date.now() - startTime);

      const entry = {
        id: Date.now(),
        endpoint: endpoint.id,
        label: endpoint.label,
        method: endpoint.method,
        path: endpoint.path,
        statusCode,
        duration: Date.now() - startTime,
        time: new Date().toLocaleString('fr-FR'),
        success: false
      };
      setHistory(prev => [entry, ...prev].slice(0, 20));
    }
  };

  const clearHistory = () => setHistory([]);

  const analyzeResponse = (data, statusCode, endpointId) => {
    const matches = [];

    const tryMatch = (catalog) => {
      for (const entry of catalog) {
        if (entry.status && entry.status !== statusCode) continue;
        if (data?.code === entry.code) { matches.push({ ...entry, type: 'code' }); return true; }
        if (data?.error && data.error.includes(entry.code)) { matches.push({ ...entry, type: 'code' }); return true; }
        if (data?.message && data.message.toLowerCase().includes(entry.message.toLowerCase())) { matches.push({ ...entry, type: 'message' }); return true; }
      }
      return false;
    };

    const endpointCatalog = errorCatalog[endpointId];
    if (endpointCatalog && !tryMatch(endpointCatalog)) {
      if (statusCode === 401 || statusCode === 429) tryMatch(errorCatalog.shared);
      else if (statusCode === 500) tryMatch(endpointCatalog.filter(e => e.code === 'SERVER_ERROR'));
    }
    if (statusCode === 401 && !matches.length) tryMatch(errorCatalog.shared);
    if (statusCode === 429 && !matches.length) tryMatch(errorCatalog.shared);
    if (!matches.length) {
      const fallback = { code: 'UNKNOWN_ERROR', status: statusCode, message: 'Erreur inconnue', explanation: 'Cette erreur n\'est pas répertoriée dans le catalogue.', fix: 'Vérifiez les logs serveur pour en savoir plus.' };
      matches.push(fallback);
    }
    return matches;
  };

  const getPerCardErrors = (data, endpointId) => {
    const fields = perCardErrors[endpointId];
    if (!fields || !data) return [];
    const found = [];
    const invalidCards = data?.data?.invalidCards || data?.data?.invalid || [];
    for (const card of invalidCards) {
      if (card.errors) {
        for (const err of card.errors) {
          const match = fields.find(f => f.message === err.message || err.message.includes(f.message.replace(' (', '(')));
          if (match) found.push({ ...match, index: card.index });
        }
      }
      if (card.field && card.message) {
        const match = fields.find(f => f.field === card.field);
        if (match) found.push(match);
      }
    }
    return found;
  };

  return (
    <div className="api-tester-page">
      <div className="page-header">
        <h1><Terminal size={24} /> Testeur d'API</h1>
        <p className="page-subtitle">Interface Postman-like pour tester les endpoints de l'application</p>
      </div>

      <div className="tester-layout">
        {/* Sidebar - Endpoints */}
        <div className="tester-sidebar">
          <div className="sidebar-section">
            <h3><Code size={16} /> Endpoints</h3>
            {endpoints.map(ep => (
              <button
                key={ep.id}
                className={'endpoint-btn ' + (activeEndpoint === ep.id ? 'active' : '')}
                onClick={() => setActiveEndpoint(ep.id)}
              >
                <span className="endpoint-method" data-method={ep.method}>{ep.method}</span>
                <div className="endpoint-info">
                  <span className="endpoint-label">{ep.label}</span>
                  <span className="endpoint-path">{ep.path}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="sidebar-section">
            <button className="history-toggle" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <BookOpen size={16} />
              <span>Historique ({history.length})</span>
              {history.length > 0 && (
                <button className="btn-icon btn-clear" onClick={clearHistory} title="Effacer l'historique">
                  <Trash2 size={14} />
                </button>
              )}
            </button>

            {showHistory && (
              <div className="history-list">
                {history.length === 0 ? (
                  <p className="history-empty">Aucun appel pour le moment</p>
                ) : (
                  history.map(entry => (
                    <div key={entry.id} className={'history-item ' + (entry.success ? '' : 'error')}>
                      <span className="history-time">{entry.time}</span>
                      <span className={'history-status ' + (entry.success ? 'success' : 'error')}>{entry.statusCode}</span>
                      <span className="history-path">{entry.path}</span>
                      <span className="history-duration">{entry.duration}ms</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main - Request/Response */}
        <div className="tester-main">
          {/* Request Panel */}
          <div className="request-panel">
            <div className="request-header">
              <div className="request-meta">
                <span className={'method-badge method-' + endpoint.method}>{endpoint.method}</span>
                <span className="request-path">{endpoint.path}</span>
              </div>
              <button
                className="btn btn-primary btn-send"
                onClick={executeRequest}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
                {status === 'loading' ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>

            <p className="endpoint-desc">{endpoint.description}</p>

            {endpoint.auth === 'api_key' && (
              <div className="auth-section">
                <Key size={16} />
                <input
                  type="text"
                  placeholder="Entrez votre clé API (acs_...)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="api-key-input"
                />
              </div>
            )}

            <div className="body-section">
              <div className="body-header">
                <h3>Corps de la requête (JSON)</h3>
                <button className="btn-icon" onClick={() => copyToClipboard(requestBody)} title="Copier">
                  <Copy size={14} />
                </button>
              </div>
              <textarea
                ref={bodyRef}
                className="body-editor"
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                spellCheck={false}
              />
              {formatError && <p className="format-error">{formatError}</p>}
            </div>
          </div>

          {/* Response Panel */}
          <div className="response-panel">
            <div className="response-header">
              <h3>Réponse</h3>
              <div className="response-meta">
                {status !== 'idle' && (
                  <>
                    {getStatusBadge(response?.statusCode)}
                    <span className={'status-icon-badge ' + status}>
                      {statusIcons[status]}
                      {status === 'loading' ? 'En cours...' : status === 'success' ? 'Succès' : status === 'error' ? 'Erreur' : ''}
                    </span>
                  </>
                )}
                {responseTime !== null && (
                  <span className="response-time">{responseTime}ms</span>
                )}
                {response && (
                  <button className="btn-icon" onClick={() => copyToClipboard(formatJson(response))} title="Copier la réponse">
                    <Copy size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="response-content">
              {status === 'idle' && (
                <div className="response-placeholder">
                  <Terminal size={48} />
                  <p>Configurez la requête et cliquez sur "Envoyer"</p>
                </div>
              )}

              {status === 'loading' && (
                <div className="response-loading">
                  <RefreshCw size={32} className="spin" />
                  <p>Appel en cours...</p>
                </div>
              )}

              {response && status !== 'loading' && (
                <div className="response-data">
                  <div className={'response-status-banner ' + (status === 'success' ? 'success' : 'error')}>
                    {status === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    <span>{status === 'success' ? 'Requête réussie' : 'Erreur'}</span>
                    {responseTime !== null && <span className="banner-time">{responseTime}ms</span>}
                  </div>

                  {status === 'error' && (() => {
                    const statusCode = response?.statusCode || 0;
                    const analysis = analyzeResponse(response, statusCode, activeEndpoint);
                    const perCard = getPerCardErrors(response, activeEndpoint);
                    return (
                      <div className="error-analysis">
                        {analysis.map((item, i) => (
                          <div key={i} className="error-card">
                            <div className="error-card-header">
                              <span className="error-badge">{item.code}</span>
                              <span className="error-http">{item.status || statusCode}</span>
                            </div>
                            <div className="error-card-body">
                              <p className="error-explanation">{item.explanation}</p>
                              <div className="error-fix">
                                <strong>Solution :</strong> {item.fix}
                              </div>
                            </div>
                          </div>
                        ))}
                        {perCard.length > 0 && (
                          <div className="per-card-errors">
                            <h4>Erreurs par carte</h4>
                            {perCard.map((err, i) => (
                              <div key={i} className="field-error-row">
                                <span className="field-badge">{err.field}</span>
                                <span className="field-desc">{err.message}</span>
                                <span className="field-hint">{err.hint}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {status === 'success' && (() => {
                    const perCard = getPerCardErrors(response, activeEndpoint);
                    if (perCard.length > 0) {
                      return (
                        <div className="per-card-errors warning">
                          <h4>Erreurs de validation par carte</h4>
                          <p className="warning-text">La requête a réussi, mais certaines cartes contiennent des erreurs de validation.</p>
                          {perCard.map((err, i) => (
                            <div key={i} className="field-error-row">
                              {err.index !== undefined && <span className="card-index">Carte #{err.index}</span>}
                              <span className="field-badge">{err.field}</span>
                              <span className="field-desc">{err.message}</span>
                              <span className="field-hint">{err.hint}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <pre className="response-json">{formatJson(response)}</pre>
                </div>
              )}

              {responseHeaders && status !== 'loading' && (
                <details className="response-headers">
                  <summary>En-têtes de réponse</summary>
                  <pre>{JSON.stringify(responseHeaders, null, 2)}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiTester;