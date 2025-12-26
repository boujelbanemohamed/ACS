import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Building2, FileText, Clock, Database, LogOut, History as HistoryIcon } from 'lucide-react';
import './Layout.css';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Banking CSV</h2>
          <p>Processeur</p>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/banks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <Building2 size={20} />
            <span>Banques</span>
          </NavLink>

          <NavLink to="/processing" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <FileText size={20} />
            <span>Traitement</span>
          </NavLink>

          <NavLink to="/records" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <Database size={20} />
            <span>Enregistrements</span>
          </NavLink>

          <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <HistoryIcon size={20} />
            <span>Historique</span>
          </NavLink>

          <NavLink to="/cron" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <Clock size={20} />
            <span>Scan Automatique</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <p className="user-name">{user?.username}</p>
              <p className="user-role">{user?.role}</p>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
