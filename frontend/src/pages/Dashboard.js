import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Building2, FileText, CheckCircle, Clock, AlertCircle, Database, Activity, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalBanks: 0,
    totalRecords: 0,
    todayFiles: 0,
    pendingErrors: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [bankStatistics, setBankStatistics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      const bankParam = user?.role === 'bank' && user?.bank_id ? '?bankId=' + user.bank_id : '';
      const response = await api.get('/dashboard' + bankParam);
      
      if (response.data.success) {
        const data = response.data.data;
        
        setStats({
          totalBanks: parseInt(data.totalBanks) || 0,
          totalRecords: parseInt(data.totalRecords) || 0,
          todayFiles: parseInt(data.todayFiles) || 0,
          pendingErrors: parseInt(data.pendingErrors) || 0
        });
        
        setRecentActivity(data.recentActivity || []);
        setBankStatistics(data.bankStats || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Banques',
      value: stats.totalBanks,
      subtitle: `${bankStatistics.length} actives`,
      icon: Building2,
      color: 'blue',
      path: '/banks'
    },
    {
      title: 'Enregistrements',
      value: stats.totalRecords,
      subtitle: 'Total des enregistrements',
      icon: Database,
      color: 'green',
      path: '/records'
    },
    {
      title: "Fichiers Aujourd'hui",
      value: stats.todayFiles,
      subtitle: 'Fichiers traites ce jour',
      icon: CheckCircle,
      color: 'purple',
      path: '/processing'
    },
    {
      title: 'Lignes en erreur',
      value: stats.pendingErrors,
      subtitle: 'Lignes a corriger',
      icon: AlertTriangle,
      color: stats.pendingErrors > 0 ? 'red' : 'green',
      path: '/records'
    }
  ];

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>📊 Tableau de Bord</h1>
        <p>Bienvenue dans le gestionnaire de fichiers bancaires</p>
      </div>

      <div className="stats-grid">
        {statCards.map((card, index) => (
          <div 
            key={index} 
            className={`stat-card ${card.color} clickable`}
            onClick={() => navigate(card.path)}
            role="button"
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && navigate(card.path)}
          >
            <div className="stat-icon">
              <card.icon size={32} />
            </div>
            <div className="stat-content">
              <h3>{card.value}</h3>
              <p className="stat-title">{card.title}</p>
              <span className="stat-subtitle">{card.subtitle}</span>
            </div>
            <div className="stat-arrow">→</div>
          </div>
        ))}
      </div>

      <div className="dashboard-sections">
        <div className="section recent-activity">
          <div className="section-header">
            <h2><Activity size={24} /> Activité Récente</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/records')}>
              Voir tout
            </button>
          </div>
          <div className="activity-list">
            {recentActivity.length === 0 ? (
              <div className="empty-state">
                <AlertCircle size={48} />
                <p>Aucune activité récente</p>
              </div>
            ) : (
              recentActivity.map((activity, index) => (
                <div key={index} className="activity-item">
                  <div className={`activity-icon ${activity.status === 'success' ? 'success' : 'error'}`}>
                    {activity.status === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                  </div>
                  <div className="activity-content">
                    <p className="activity-text">
                      <strong>{activity.file_name}</strong>
                    </p>
                    <p className="activity-bank">
                      <span className="bank-badge">{activity.bank_code}</span> {activity.bank_name}
                    </p>
                    <span className="activity-time">
                      {new Date(activity.processed_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="activity-stats">
                    <span className="valid-count">✓ {activity.valid_rows || 0}</span>
                    <span className="invalid-count">✗ {activity.invalid_rows || 0}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="section quick-actions">
          <h2>⚡ Actions Rapides</h2>
          <div className="actions-grid">
            <button className="action-btn" onClick={() => navigate('/banks')}>
              <Building2 size={24} />
              <span>Gérer les Banques</span>
            </button>
            <button className="action-btn" onClick={() => navigate('/processing')}>
              <FileText size={24} />
              <span>Traiter des Fichiers</span>
            </button>
            <button className="action-btn" onClick={() => navigate('/records')}>
              <Database size={24} />
              <span>Voir les Enregistrements</span>
            </button>
            <button className="action-btn" onClick={() => navigate('/cron')}>
              <Clock size={24} />
              <span>Configurer le Scan</span>
            </button>
          </div>

          {bankStatistics.length > 0 && (
            <>
              <h2 style={{ marginTop: '25px' }}>🏦 Statistiques par Banque</h2>
              <div className="bank-stats-list">
                {bankStatistics.map((bank, index) => (
                  <div key={index} className="bank-stat-item">
                    <div className="bank-info">
                      <span className="bank-badge">{bank.code}</span>
                      <span className="bank-name">{bank.name}</span>
                    </div>
                    <div className="bank-numbers">
                      <span className="records-count">{bank.total_records} enr.</span>
                      <span className="files-count">{bank.total_files} fich.</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
