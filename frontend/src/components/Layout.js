import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Clock, Database, LogOut, History as HistoryIcon, Users, Mail, Terminal, Activity, ScrollText, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import './Layout.css';

const Layout = () => {
  const { user, logout, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [features, setFeatures] = useState({});

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    if (mustChangePassword) {
      navigate('/change-password', { replace: true });
      return;
    }
    if (!isSuperAdmin) {
      api.get('/role-features/me').then(res => {
        setFeatures(res.data.data || {});
      }).catch(() => {});
    }
  }, [isSuperAdmin, mustChangePassword, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const hasFeature = (feature) => {
    if (isSuperAdmin) return true;
    return features[feature] !== false;
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ACS Banking</h2>
          <span className="subtitle">CSV Processor</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          {hasFeature('banks') && (user?.role === 'super_admin' || user?.role === 'bank_admin') && (
            <NavLink to="/banks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Building2 size={20} />
              <span>Banques</span>
            </NavLink>
          )}

          {hasFeature('banks') && user?.role === 'bank' && (
            <NavLink to="/banks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Building2 size={20} />
              <span>Ma Banque</span>
            </NavLink>
          )}

          {hasFeature('processing') && (
            <NavLink to="/processing" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <FileText size={20} />
              <span>Traitement</span>
            </NavLink>
          )}

          {hasFeature('records') && (
            <NavLink to="/records" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Database size={20} />
              <span>Enregistrements</span>
            </NavLink>
          )}

          {hasFeature('history') && (
            <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <HistoryIcon size={20} />
              <span>Historique</span>
            </NavLink>
          )}

          {isSuperAdmin && hasFeature('api_tester') && (
            <NavLink to="/api-tester" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Terminal size={20} />
              <span>Test API</span>
            </NavLink>
          )}

          {hasFeature('audit_logs') && (
            <NavLink to="/audit-logs" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <ScrollText size={20} />
              <span>Journal d'activité</span>
            </NavLink>
          )}

          {hasFeature('users') && (user?.role === 'super_admin' || user?.role === 'bank_admin') && (
            <NavLink to="/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Users size={20} />
              <span>Utilisateurs</span>
            </NavLink>
          )}

          {isSuperAdmin && hasFeature('cron') && (
            <NavLink to="/cron" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Clock size={20} />
              <span>Scan Automatique</span>
            </NavLink>
          )}

          {isSuperAdmin && hasFeature('notifications') && (
            <NavLink to="/notifications" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Mail size={20} />
              <span>Notifications</span>
            </NavLink>
          )}

          {isSuperAdmin && hasFeature('monitoring') && (
            <NavLink to="/monitoring" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Activity size={20} />
              <span>Monitoring</span>
            </NavLink>
          )}

          {(isSuperAdmin || (user?.role === 'bank_admin' && hasFeature('permissions'))) && (
            <NavLink to="/role-features" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Shield size={20} />
              <span>Permissions</span>
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="footer-actions">
            <NavLink to="/profile" className={({ isActive }) => isActive ? 'profile-link active' : 'profile-link'}>
              <div className="user-info">
                <div className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
                <div className="user-details">
                  <span className="user-name">{user?.username}</span>
                  <span className="user-role">{user?.role === 'super_admin' ? 'Admin' : user?.bank_name || 'Banque'}</span>
                </div>
              </div>
            </NavLink>

            <button className="logout-btn" onClick={handleLogout} title="Déconnexion">
              <LogOut size={18} />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
