import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Building2, FileText, CheckCircle, Clock, Database, Activity, AlertTriangle, Zap, BarChart3, ArrowRight, RefreshCw, Inbox, ChevronRight, Calendar, Filter } from 'lucide-react';
import api from '../services/api';
import './Dashboard.css';

const COLORS = [
  { name: 'blue', from: '#667eea', to: '#764ba2', bg: '#eef0ff' },
  { name: 'emerald', from: '#059669', to: '#10b981', bg: '#ecfdf5' },
  { name: 'violet', from: '#7c3aed', to: '#a78bfa', bg: '#f5f3ff' },
  { name: 'rose', from: '#e11d48', to: '#fb7185', bg: '#fff1f2' },
];

const QUICK_ACTIONS = [
  { label: 'Gérer les Banques', icon: Building2, path: '/banks', color: '#667eea' },
  { label: 'Traiter des Fichiers', icon: FileText, path: '/processing', color: '#059669' },
  { label: 'Voir les Enregistrements', icon: Database, path: '/records', color: '#7c3aed' },
  { label: 'Configuration', icon: Clock, path: '/cron', color: '#d97706' },
];

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bonne matinee !';
  if (h < 17) return 'Bon apres-midi !';
  return 'Bonne soiree !';
};

const formatDate = () => new Date().toLocaleDateString('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ totalBanks: 0, totalRecords: 0, todayFiles: 0, pendingErrors: 0 });
  const [recentActivity, setRecentActivity] = useState([]);
  const [bankStatistics, setBankStatistics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (user?.role !== 'super_admin' && user?.bank_id) {
        params.set('bankId', user.bank_id);
      }
      if (showFilter && dateFrom) params.set('dateFrom', dateFrom);
      if (showFilter && dateTo) params.set('dateTo', dateTo);
      const qs = params.toString();
      const res = await api.get('/dashboard' + (qs ? '?' + qs : ''));
      if (res.data.success) {
        const d = res.data.data;
        setStats({
          totalBanks: parseInt(d.totalBanks) || 0,
          totalRecords: parseInt(d.totalRecords) || 0,
          todayFiles: parseInt(d.todayFiles) || 0,
          pendingErrors: parseInt(d.pendingErrors) || 0,
        });
        setRecentActivity(d.recentActivity || []);
        setBankStatistics(d.bankStats || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, dateFrom, dateTo, showFilter]);

  useEffect(() => {
    if (user) fetchDashboardData();
  }, [user, fetchDashboardData]);

  const toggleFilter = () => {
    if (showFilter) {
      setDateFrom('');
      setDateTo('');
    }
    setShowFilter(!showFilter);
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading"><RefreshCw size={32} className="spin" /> Chargement...</div>
      </div>
    );
  }

  const statCards = [
    { label: 'Banques', value: stats.totalBanks, sub: bankStatistics.length + ' actives', icon: Building2, path: '/banks', i: 0 },
    { label: 'Enregistrements', value: stats.totalRecords.toLocaleString(), sub: 'Total cumule', icon: Database, path: '/records', i: 1 },
    { label: "Fichiers aujourd'hui", value: stats.todayFiles, sub: 'Fichiers traites', icon: CheckCircle, path: '/processing', i: 2 },
    { label: 'Lignes en erreur', value: stats.pendingErrors, sub: 'A corriger', icon: AlertTriangle, path: '/records', i: 3 },
  ];

  return (
    <div className="dashboard">

      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-shape welcome-shape-1" />
        <div className="welcome-shape welcome-shape-2" />
        <div className="welcome-shape welcome-shape-3" />
        <div className="welcome-content">
          <div className="welcome-left">
            <h1>Bonjour, {user?.username || 'Utilisateur'}</h1>
            <p className="welcome-greeting">{getGreeting()} — {formatDate()}</p>
            <p className="welcome-sub">
              {stats.pendingErrors > 0
                ? stats.pendingErrors + ' ligne(s) en erreur necessitent votre attention.'
                : 'Tout est en ordre, aucun probleme signale.'}
            </p>
          </div>
          <div className="welcome-right">
            <div className="welcome-stat-ring">
              <span className="welcome-stat-num">{stats.todayFiles}</span>
              <span className="welcome-stat-lbl">fichiers<br/>aujourd'hui</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="metric-grid">
        {statCards.map((c) => {
          const col = COLORS[c.i];
          const isNeutral = c.i === 3 && stats.pendingErrors === 0;
          const accent = isNeutral ? COLORS[1] : col;
          return (
            <div
              key={c.i}
              className="metric-card stat-card"
              style={{ '--accent': accent.from, '--accent-bg': accent.bg }}
              onClick={() => navigate(c.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(c.path)}
            >
              <div className="metric-icon">
                <c.icon size={20} />
              </div>
              <span className="metric-value">{c.value}</span>
              <span className="metric-label">{c.label}</span>
            </div>
          );
        })}
      </div>

      {/* Date Filter */}
      <div className="dashboard-filter">
        <button className={`filter-toggle ${showFilter ? 'active' : ''}`} onClick={toggleFilter}>
          <Filter size={16} /> Filtre Date {showFilter ? '' : ''}
          {showFilter && <span className="filter-active">actif</span>}
        </button>
        {showFilter && (
          <div className="filter-inputs">
            <div className="filter-group">
              <Calendar size={14} />
              <label>Du</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="filter-group">
              <Calendar size={14} />
              <label>Au</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <button className="filter-apply" onClick={fetchDashboardData}>
              <RefreshCw size={14} /> Appliquer
            </button>
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="content-grid">
        {/* Left: Activity Timeline */}
        <div className="card activity-card">
          <div className="card-header">
            <h3><Activity size={20} /> Activité Récente</h3>
            <button className="card-btn" onClick={() => navigate('/records')}>
              Voir tout <ChevronRight size={16} />
            </button>
          </div>
          {recentActivity.length === 0 ? (
            <div className="empty-state">
              <Inbox size={40} />
              <p>Aucune activite recente</p>
            </div>
          ) : (
            <div className="timeline">
              {recentActivity.slice(0, 8).map((a, i) => (
                <div key={i} className="timeline-item">
                  <div className={'timeline-dot ' + (a.status === 'success' ? 'success' : 'error')} />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <span className="timeline-file">{a.file_name}</span>
                      <span className="timeline-badge">{a.bank_code}</span>
                    </div>
                    <div className="timeline-meta">
                      <span>{a.bank_name}</span>
                      <span className="timeline-time">{new Date(a.processed_at).toLocaleString('fr-FR')}</span>
                    </div>
                    <div className="timeline-stats">
                      <span className="stat-ok">OK {a.valid_rows || 0}</span>
                      <span className="stat-ko">KO {a.invalid_rows || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="content-right">
          {/* Quick Actions */}
          <div className="card">
            <div className="card-header">
              <h3><Zap size={20} /> Actions Rapides</h3>
            </div>
            <div className="quick-grid">
              {QUICK_ACTIONS.map((a) => (
                <button key={a.label} className="quick-item" onClick={() => navigate(a.path)}>
                  <div className="quick-icon" style={{ background: a.color + '15', color: a.color }}>
                    <a.icon size={22} />
                  </div>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bank Stats */}
          {bankStatistics.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3><BarChart3 size={20} /> Statistiques par Banque</h3>
              </div>
              <div className="bank-mini-list">
                {bankStatistics.map((b, i) => {
                  const maxRec = Math.max(...bankStatistics.map(x => x.total_records || 0));
                  const pct = maxRec > 0 ? ((b.total_records || 0) / maxRec) * 100 : 0;
                  return (
                    <div key={i} className="bank-mini-item">
                      <div className="bank-mini-head">
                        <div className="bank-mini-icon"><Building2 size={14} /></div>
                        <span className="bank-mini-code">{b.code}</span>
                        <span className="bank-mini-name">{b.name}</span>
                      </div>
                      <div className="bank-mini-body">
                        <div className="bank-mini-stat">
                          <span className="bank-mini-val">{b.total_records || 0}</span>
                          <span className="bank-mini-lbl">enr.</span>
                        </div>
                        <div className="bank-mini-stat">
                          <span className="bank-mini-val">{b.total_files || 0}</span>
                          <span className="bank-mini-lbl">fich.</span>
                        </div>
                      </div>
                      <div className="bank-mini-bar">
                        <div className="bank-mini-fill" style={{ width: pct + '%' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
