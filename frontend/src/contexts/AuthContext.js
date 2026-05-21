import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedMustChange = localStorage.getItem('must_change_password');

    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      setMustChangePassword(savedMustChange === 'true');
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      setError(null);
      const response = await authAPI.login(credentials);
      const { token, user, must_change_password } = response.data.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('must_change_password', must_change_password ? 'true' : 'false');
      setUser(user);
      setMustChangePassword(!!must_change_password);

      return { success: true, must_change_password: !!must_change_password };
    } catch (err) {
      const message = err.response?.data?.message || 'Erreur de connexion';
      setError(message);
      return { success: false, error: message };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('must_change_password');
    setUser(null);
    setMustChangePassword(false);
  };

  const clearMustChangePassword = () => {
    localStorage.setItem('must_change_password', 'false');
    setMustChangePassword(false);
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    mustChangePassword,
    clearMustChangePassword,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'super_admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
