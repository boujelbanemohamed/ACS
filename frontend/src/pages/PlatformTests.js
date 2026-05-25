import React, { useState, useRef, useEffect } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Shield, Loader, Info, RotateCcw, Database, Server, Wifi, HardDrive, Package } from 'lucide-react';
import api from '../services/api';
import './PlatformTests.css';

const POLL_INTERVAL = 1000;

const PlatformTests = () => {
  const [runId, setRunId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
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
          </div>
          <button className="btn-primary btn-large" onClick={runTests}>
            <Play size={22} /> Lancer les tests
          </button>
        </div>
      )}

      {loading && !progress && (
        <div className="loading-state">
          <RefreshCw size={32} className="spin" />
          <p>Démarrage des tests...</p>
        </div>
      )}

      {loading && progress && !progress.finished && (
        <RunningView progress={progress} percent={overallPercent()} currentPhase={currentPhaseObj()} />
      )}

      {progress?.finished && (
        <ResultsView data={progress} onRerun={runTests} loading={loading} />
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

const ResultsView = ({ data, onRerun, loading }) => {
  const summary = data.summary;
  const allPassed = summary.failed === 0;

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
        <button className="summary-rerun-btn" onClick={onRerun} disabled={loading} title="Relancer les tests">
          {loading ? <RefreshCw size={18} className="spin" /> : <RotateCcw size={18} />}
          Relancer
        </button>
      </div>

      {data.phases.map((phase, i) => (
        <PhaseResults key={i} phase={phase} />
      ))}
    </div>
  );
};

const PhaseResults = ({ phase }) => {
  const isPreflight = phase.name === 'preflight';

  return (
    <div className="suite-section">
      <div className="suite-header">
        <h3>{phase.label} — {phase.totalTests} {isPreflight ? 'vérifications' : 'tests'}</h3>
        <span className={`suite-overall ${phase.failedTests > 0 ? 'has-fails' : 'all-good'}`}>
          {phase.failedTests > 0 ? <XCircle size={15} /> : <CheckCircle size={15} />}
          {phase.totalSuites} {isPreflight ? 'vérifications' : 'suites'} — {phase.passedTests}/{phase.totalTests} tests
        </span>
      </div>
      <div className="suite-table-wrap">
        <table className="suite-table">
          <thead>
            <tr>
              <th>{isPreflight ? 'Vérification' : 'Script de test'}</th>
              <th>Statut</th>
              {isPreflight && <th>Détail</th>}
            </tr>
          </thead>
          <tbody>
            {phase.suites.map((suite, i) => (
              <tr key={i} className={suite.status === 'failed' ? 'row-failed' : ''}>
                <td className="suite-name">{suite.name}</td>
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

export default PlatformTests;
