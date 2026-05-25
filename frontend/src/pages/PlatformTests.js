import React, { useState, useRef, useEffect } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Shield, Loader, Info, RotateCcw, Database, Server, Wifi, HardDrive, Package, FileText, Download, X, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';
import './PlatformTests.css';

const POLL_INTERVAL = 1000;

const PlatformTests = () => {
  const [runId, setRunId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState(null);
  const [suiteModal, setSuiteModal] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPolling = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get('/platform-tests/progress');
        const data = res.data.data;
        if (data) {
          setProgress(data);
          if (data.finished) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setLoading(false);
            setRetrying(false);
          }
        }
      } catch {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, POLL_INTERVAL);
  };

  const runTests = async () => {
    setLoading(true);
    setRetrying(false);
    setError(null);
    setProgress(null);
    setRunId(null);
    try {
      const res = await api.post('/platform-tests/run');
      const id = res.data.data.runId;
      setRunId(id);
      startPolling(id);
    } catch (err) {
      const msg = err.response?.status === 409
        ? 'Des tests sont déjà en cours d\'exécution.'
        : err.response?.data?.message || err.message || 'Erreur lors de l\'exécution des tests';
      setError(msg);
      setLoading(false);
    }
  };

  const downloadReport = async () => {
    try {
      const res = await api.get('/platform-tests/report', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-tests-plateforme.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download report failed', e);
    }
  };

  const retryFailed = async () => {
    setRetrying(true);
    setLoading(true);
    setError(null);
    setProgress(null);
    try {
      const res = await api.post('/platform-tests/retry-failed');
      const id = res.data.data.runId;
      setRunId(id);
      startPolling(id);
    } catch (err) {
      const msg = err.response?.status === 409
        ? 'Des tests sont déjà en cours d\'exécution.'
        : err.response?.data?.message || err.message || 'Erreur';
      setError(msg);
      setLoading(false);
      setRetrying(false);
    }
  };

  const downloadRawLogs = async (phaseIdx) => {
    try {
      const res = await api.get(`/platform-tests/raw-output?phase=${phaseIdx}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      const phaseLabel = progress?.phases?.[phaseIdx]?.label || `phase-${phaseIdx}`;
      a.download = `platform-tests-${phaseLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Erreur de téléchargement');
    }
  };

  const overallPercent = () => {
    if (!progress || progress.finished) return 100;
    const phases = progress.phases || [];
    let total = 0;
    let done = 0;
    for (const p of phases) {
      if (p.status === 'pending') continue;
      if (p.done) {
        total += Math.max(p.totalSuites, p.completedSuites, 1);
        done += p.completedSuites;
      } else {
        const est = Math.max(p.totalSuites, 50);
        total += est;
        done += Math.min(p.completedSuites, est);
      }
    }
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
  };

  const currentPhaseObj = () => {
    if (!progress) return null;
    return progress.phases?.find(p => p.status === 'running' || p.status === 'counting') || null;
  };

  return (
    <div className="platform-tests-page">
      <div className="page-header">
        <h1><Shield size={28} /> Tests Plateforme</h1>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      {!loading && !progress && (
        <div className="tests-hero">
          <div className="hero-icon"><Shield size={48} /></div>
          <h2>Tests Plateforme Complète</h2>
          <p className="hero-desc">
            Vérifie l'intégralité de la plateforme en une seule exécution :
          </p>
          <div className="hero-checks">
            <span><Database size={14} /> Base de données</span>
            <span><Server size={14} /> Redis</span>
            <span><Wifi size={14} /> Connexions</span>
            <span><HardDrive size={14} /> Fichiers</span>
            <span><Package size={14} /> Dépendances</span>
            <span><Shield size={14} /> Tests Backend</span>
            <span><Shield size={14} /> Tests Frontend</span>
            <span><Shield size={14} /> Sécurité</span>
            <span><Wifi size={14} /> Intégration</span>
            <span><Shield size={14} /> Charge</span>
          </div>
          <button className="btn-primary btn-large" onClick={runTests}>
            <Play size={22} /> Lancer les tests
          </button>
        </div>
      )}

      {loading && !progress && (
        <div className="loading-state">
          <RefreshCw size={32} className="spin" />
          <p>{retrying ? 'Re-exécution des tests échoués...' : 'Démarrage des tests...'}</p>
        </div>
      )}

      {loading && progress && !progress.finished && (
        <RunningView progress={progress} percent={overallPercent()} currentPhase={currentPhaseObj()} />
      )}

      {progress?.finished && (
        <ResultsView
          data={progress}
          onRerun={runTests}
          onRetryFailed={retryFailed}
          loading={loading}
          retrying={retrying}
          onViewSuite={(phaseIdx, suiteIdx) => setSuiteModal({ phaseIdx, suiteIdx })}
          onDownloadLogs={downloadRawLogs}
          onDownloadReport={downloadReport}
        />
      )}

      {suiteModal && (
        <SuiteDetailModal
          phaseIdx={suiteModal.phaseIdx}
          suiteIdx={suiteModal.suiteIdx}
          phases={progress.phases}
          onClose={() => setSuiteModal(null)}
        />
      )}
    </div>
  );
};

const RunningView = ({ progress, percent, currentPhase }) => {
  const current = currentPhase;
  const currentLabel = current ? current.label : 'Finalisation';

  return (
    <div className="running-view">
      <div className="progress-header">
        <Loader size={20} className="spin" />
        <span>Exécution des tests en cours — <strong>{currentLabel}</strong></span>
      </div>

      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: percent + '%' }} />
        <span className="progress-label">{percent}%</span>
      </div>

      {progress.phases.map((phase, i) => (
        <PhaseProgress key={i} phase={phase} active={phase.status === 'running' || phase.status === 'counting'} />
      ))}
    </div>
  );
};

const PhaseProgress = ({ phase, active }) => {
  const completed = phase.completedSuites;
  const total = phase.totalSuites || completed || '?';
  const isPreflight = phase.name === 'preflight';

  return (
    <div className={`phase-progress ${active ? 'active' : phase.done ? 'done' : 'pending'}`}>
      <div className="phase-head">
        <span className="phase-badge">
          {phase.done
            ? (phase.status === 'passed' ? <CheckCircle size={16} /> : <XCircle size={16} />)
            : active
              ? <Loader size={16} className="spin" />
              : <Clock size={16} />
          }
          {phase.label}
        </span>
        <span className="phase-stats">
          {phase.done
            ? `${phase.passedTests}/${phase.totalTests} tests`
            : `${completed}/${total} suites`
          }
        </span>
      </div>

      {active && phase.suites.length > 0 && (
        <div className="suite-feed">
          {phase.suites.slice(-20).map((suite, i) => (
            <div key={i} className={`suite-line ${suite.status} ${isPreflight ? 'preflight' : ''}`}>
              {suite.status === 'passed' ? <CheckCircle size={12} /> : <XCircle size={12} />}
              <span className="suite-line-name" title={suite.name}>{suite.name}</span>
              {isPreflight && suite.detail && (
                <span className="suite-line-detail">{suite.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ResultsView = ({ data, onRerun, onRetryFailed, loading, retrying, onViewSuite, onDownloadLogs, onDownloadReport }) => {
  const summary = data.summary;
  const allPassed = summary.failed === 0;
  const hasFailed = summary.failed > 0;

  return (
    <div className="test-results">
      <div className="summary-row">
        <div className="summary-card total-card">
          <span className="summary-label">Total</span>
          <span className="summary-value">{summary.total.toLocaleString()}</span>
        </div>
        <div className={`summary-card passed-card ${allPassed ? 'glow' : ''}`}>
          <CheckCircle size={22} />
          <div>
            <span className="summary-label">Réussis</span>
            <span className="summary-value">{summary.passed.toLocaleString()}</span>
          </div>
        </div>
        <div className={`summary-card failed-card ${!allPassed ? 'glow' : ''}`}>
          <XCircle size={22} />
          <div>
            <span className="summary-label">Échoués</span>
            <span className="summary-value">{summary.failed}</span>
          </div>
        </div>
        <div className="summary-card duration-card">
          <Clock size={22} />
          <div>
            <span className="summary-label">Durée</span>
            <span className="summary-value">{(summary.totalDuration / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>

      <div className="summary-actions">
        <button className="summary-rerun-btn" onClick={onRerun} disabled={loading} title="Relancer tous les tests">
          {loading && !retrying ? <RefreshCw size={18} className="spin" /> : <RotateCcw size={18} />}
          Relancer tout
        </button>
        {hasFailed && (
          <button className="summary-rerun-btn summary-retry-btn" onClick={onRetryFailed} disabled={loading} title="Réessayer uniquement les suites échouées">
            {retrying ? <RefreshCw size={18} className="spin" /> : <Bug size={18} />}
            {retrying ? 'Réexécution...' : 'Réessayer les échecs'}
          </button>
        )}
        <button className="summary-rerun-btn summary-report-btn" onClick={onDownloadReport} title="Télécharger le rapport HTML">
          <Download size={18} /> Rapport
        </button>
      </div>

      {data.phases.map((phase, i) => (
        <PhaseResults key={i} phase={phase} phaseIndex={i} onViewSuite={onViewSuite} onDownloadLogs={onDownloadLogs} />
      ))}
    </div>
  );
};

const PhaseResults = ({ phase, phaseIndex, onViewSuite, onDownloadLogs }) => {
  const isPreflight = phase.name === 'preflight';

  const handleRowClick = (suiteIdx) => {
    if (!isPreflight && onViewSuite) {
      onViewSuite(phaseIndex, suiteIdx);
    }
  };

  return (
    <div className="suite-section">
      <div className="suite-header">
        <h3>
          {phase.label} — {phase.totalTests} {isPreflight ? 'vérifications' : 'tests'}
          {phase.isRetry && <span className="retry-badge">Réessai</span>}
        </h3>
        <div className="suite-header-right">
          {!isPreflight && phase.rawOutput && (
            <button className="log-download-btn" onClick={(e) => { e.stopPropagation(); onDownloadLogs(phaseIndex); }} title="Télécharger les logs bruts">
              <Download size={13} /> Logs
            </button>
          )}
          <span className={`suite-overall ${phase.failedTests > 0 ? 'has-fails' : 'all-good'}`}>
            {phase.failedTests > 0 ? <XCircle size={15} /> : <CheckCircle size={15} />}
            {phase.totalSuites} {isPreflight ? 'vérifications' : 'suites'} — {phase.passedTests}/{phase.totalTests} tests
          </span>
        </div>
      </div>
      <div className="suite-table-wrap">
        <table className="suite-table">
          <thead>
            <tr>
              <th>{isPreflight ? 'Vérification' : 'Script de test'}</th>
              {!isPreflight && <th className="col-tests">Tests</th>}
              <th>Statut</th>
              {isPreflight && <th>Détail</th>}
            </tr>
          </thead>
          <tbody>
            {phase.suites.map((suite, i) => (
              <tr
                key={i}
                className={`${suite.status === 'failed' ? 'row-failed' : ''} ${!isPreflight ? 'row-clickable' : ''} ${suite.status === 'failed' && !isPreflight ? 'row-has-errors' : ''}`}
                onClick={() => handleRowClick(i)}
              >
                <td className="suite-name">
                  {!isPreflight && <FileText size={13} className="suite-file-icon" />}
                  {suite.name}
                  {!isPreflight && suite.errors?.length > 0 && (
                    <span className="error-count-badge">{suite.errors.length} erreur{suite.errors.length > 1 ? 's' : ''}</span>
                  )}
                </td>
                {!isPreflight && (
                  <td className="col-tests">
                    {suite.totalTests != null ? (
                      <span className={`suite-test-count ${suite.failedTests > 0 ? 'has-fails' : 'all-good'}`}>
                        {suite.passedTests}/{suite.totalTests}
                      </span>
                    ) : (
                      <span className="suite-test-count dim">—</span>
                    )}
                  </td>
                )}
                <td>
                  <span className={`status-tag ${suite.status}`}>
                    {suite.status === 'passed' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                    {suite.status === 'passed' ? 'Passé' : 'Échoué'}
                  </span>
                </td>
                {isPreflight && (
                  <td className="suite-detail">{suite.detail || '—'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SuiteDetailModal = ({ phaseIdx, suiteIdx, phases, onClose }) => {
  const [scriptData, setScriptData] = useState(null);
  const [scriptLoading, setScriptLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [tab, setTab] = useState('errors');
  const [expandedErrors, setExpandedErrors] = useState({});

  const phase = phases?.[phaseIdx];
  const suite = phase?.suites?.[suiteIdx];
  const isFailed = suite?.status === 'failed';
  const hasErrors = suite?.errors?.length > 0;

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/platform-tests/script/${phaseIdx}/${suiteIdx}`);
        setScriptData(res.data.data);
      } catch (err) {
        setFetchError(err.response?.data?.message || err.message || 'Erreur de chargement');
      }
      setScriptLoading(false);
    })();
  }, [phaseIdx, suiteIdx]);

  const handleDownload = () => {
    if (!scriptData) return;
    const blob = new Blob([scriptData.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = scriptData.name.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleError = (idx) => {
    setExpandedErrors(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const label = phase?.label || 'Inconnue';
  const suiteName = suite?.name || 'Chargement...';
  const showErrorTab = isFailed && hasErrors;

  return (
    <div className="script-modal-overlay" onClick={onClose}>
      <div className="script-modal" onClick={(e) => e.stopPropagation()}>
        <div className="script-modal-header">
          <div className="script-modal-title">
            {showErrorTab ? <Bug size={18} /> : <FileText size={18} />}
            <span>{suiteName}</span>
            <span className="script-modal-phase">{label}</span>
          </div>
          <div className="script-modal-actions">
            {scriptData && tab === 'source' && (
              <button className="script-download-btn" onClick={handleDownload} title="Télécharger">
                <Download size={16} /> Télécharger
              </button>
            )}
            <button className="script-close-btn" onClick={onClose} title="Fermer">
              <X size={18} />
            </button>
          </div>
        </div>

        {showErrorTab && (
          <div className="detail-tabs">
            <button className={`detail-tab ${tab === 'errors' ? 'active' : ''}`} onClick={() => setTab('errors')}>
              <Bug size={14} /> Erreurs ({suite.errors.length})
            </button>
            <button className={`detail-tab ${tab === 'source' ? 'active' : ''}`} onClick={() => setTab('source')}>
              <FileText size={14} /> Source
            </button>
          </div>
        )}

        <div className="script-modal-body">
          {tab === 'errors' && showErrorTab ? (
            <div className="error-detail-list">
              {suite.errors.map((err, i) => (
                <div key={i} className="error-detail-item">
                  <div className="error-detail-header" onClick={() => toggleError(i)}>
                    <span className="error-detail-icon"><XCircle size={14} /></span>
                    <span className="error-detail-title">{err.fullName || err.title}</span>
                    {expandedErrors[i] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  {expandedErrors[i] && err.failureMessages?.length > 0 && (
                    <div className="error-detail-body">
                      {err.failureMessages.map((msg, j) => (
                        <pre key={j} className="error-detail-message"><code>{msg}</code></pre>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              {scriptLoading && (
                <div className="script-loading">
                  <RefreshCw size={24} className="spin" />
                  <p>Chargement du script...</p>
                </div>
              )}
              {fetchError && (
                <div className="script-error">
                  <AlertCircle size={20} />
                  <p>{fetchError}</p>
                </div>
              )}
              {scriptData && (
                <pre className="script-code"><code>{scriptData.content}</code></pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlatformTests;
