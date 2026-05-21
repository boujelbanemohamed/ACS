import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Banks from './pages/Banks';
import Processing from './pages/Processing';
import CronManager from './pages/CronManager';
import Notifications from './pages/Notifications';
import Monitor from './pages/Monitor';
import Records from './pages/Records';
import History from './pages/History';
import ApiTester from './pages/ApiTester';
import Users from './pages/Users';
import Profile from './pages/Profile';
import AuditLogs from './pages/AuditLogs';
import RoleFeatures from './pages/RoleFeatures';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Chargement...</div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="banks" element={<Banks />} />
            <Route path="processing" element={<Processing />} />
            <Route path="cron" element={<CronManager />} />
            <Route path="records" element={<Records />} />
            <Route path="history" element={<History />} />
            <Route path="api-tester" element={<ApiTester />} />
            <Route path="users" element={<Users />} />
            <Route path="profile" element={<Profile />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="monitoring" element={<Monitor />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="role-features" element={<RoleFeatures />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
