import React, { useState } from 'react';
import { Play, RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Shield } from 'lucide-react';
import api from '../services/api';
import './PlatformTests.css';

const PlatformTests = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.post('/platform-tests/run');
      setResults(res.data.data);
    } catch (err) {
      const msg = err.response?.status === 409
        ? 'Des tests sont déjà en cours d\'exécution.'
        : err.response?.data?.message || err.message || 'Erreur lors de l\'exécution des tests';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="platform-tests-page">
      <div className="page-header">
        <h1><Shield size={28} /> Tests Plateforme</h1>
        <button className="btn btn-primary" onClick={runTests} disabled={loading}>
          {loading ? <RefreshCw size={18} className="spin" /> : <Play size={18} />}
          {loading ? 'Exécution en cours...' : 'Lancer les tests'}
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">×</button>
        </div>
      )}

      {loading && !results && (
        <div className="loading-state">
          <RefreshCw size={32} className="spin" />
          <p>Exécution des tests backend et frontend...</p>
        </div>
      )}

      {results && <TestResults data={results} />}
    </div>
  );
};

const TestResults = ({ data }) => {
  const { summary, backend, frontend } = data;
  const allPassed = summary.failed === 0;

  return (
    <div className="test-results">
      <div className="summary-row">
        <div className={`summary-card total-card`}>
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

      <SuiteSection title={`Backend — ${backend.numTotalTests} tests`} data={backend} />
      <SuiteSection title={`Frontend — ${frontend.numTotalTests} tests`} data={frontend} />
    </div>
  );
};

const SuiteSection = ({ title, data }) => {
  if (data.error) {
    return (
      <div className="suite-section">
        <div className="suite-header"><h3>{title}</h3></div>
        <div className="error-banner"><AlertCircle size={16} /> {data.error}</div>
      </div>
    );
  }

  return (
    <div className="suite-section">
      <div className="suite-header">
        <h3>{title}</h3>
        <span className={`suite-overall ${data.numFailedTests > 0 ? 'has-fails' : 'all-good'}`}>
          {data.numFailedTests > 0 ? <XCircle size={15} /> : <CheckCircle size={15} />}
          {data.numPassedTestSuites}/{data.numTotalTestSuites} suites — {data.numPassedTests}/{data.numTotalTests} tests
        </span>
      </div>
      <div className="suite-table-wrap">
        <table className="suite-table">
          <thead>
            <tr>
              <th>Suite de tests</th>
              <th>Statut</th>
              <th>Tests</th>
              <th>Durée</th>
            </tr>
          </thead>
          <tbody>
            {data.suites.map((suite, i) => (
              <tr key={i} className={suite.status === 'failed' ? 'row-failed' : ''}>
                <td className="suite-name">{suite.name}</td>
                <td>
                  <span className={`status-tag ${suite.status}`}>
                    {suite.status === 'passed' ? <CheckCircle size={13} /> : <XCircle size={13} />}
                    {suite.status === 'passed' ? 'Passé' : 'Échoué'}
                  </span>
                </td>
                <td className="suite-test-count">{suite.numPassingTests}/{suite.numPassingTests + suite.numFailingTests}</td>
                <td className="suite-duration">{suite.duration ? `${(suite.duration / 1000).toFixed(1)}s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlatformTests;
