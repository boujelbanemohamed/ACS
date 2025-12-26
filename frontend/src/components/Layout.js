import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Clock, Database, LogOut, History as HistoryIcon, Users, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'super_admin';
  const isBank = user?.role === 'bank';

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

          {isAdmin && (
            <NavLink to="/banks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Building2 size={20} />
              <span>Banques</span>
            </NavLink>
          )}

          {isBank && (
            <NavLink to="/banks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <Building2 size={20} />
              <span>Ma Banque</span>
            </NavLink>
          )}

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

          {isAdmin && (
            <>
              <NavLink to="/users" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                <Users size={20} />
                <span>Utilisateurs</span>
              </NavLink>

              <NavLink to="/cron" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                <Clock size={20} />
                <span>Scan Automatique</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <NavLink to="/profile" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <User size={20} />
            <span>Mon Profil</span>
          </NavLink>
          
          <div className="user-info">
            <div className="user-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <span className="user-name">{user?.username}</span>
              <span className="user-role">{user?.role === 'super_admin' ? 'Admin' : user?.bank_name || 'Banque'}</span>
            </div>
          </div>
          
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            <span>Deconnexion</span>
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
