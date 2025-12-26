import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Lock, Save, Eye, EyeOff } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './Profile.css';

const Profile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    phone: ''
  });
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/users/me/profile');
      if (response.data.success) {
        const profile = response.data.data;
        setFormData({
          email: profile.email || '',
          phone: profile.phone || ''
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await api.put('/users/me/profile', formData);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Profil mis a jour avec succes!' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erreur lors de la mise a jour' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caracteres' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await api.put('/users/me/profile', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Mot de passe modifie avec succes!' });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Erreur lors du changement de mot de passe' });
    } finally {
      setLoading(false);
    }
  };

  const getRoleName = (role) => {
    if (role === 'super_admin') return 'Super Administrateur';
    if (role === 'bank') return 'Utilisateur Banque';
    return role;
  };

  return (
    <div className="profile-page">
      <div className="page-header">
        <h1><User size={28} /> Mon Profil</h1>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="profile-grid">
        <div className="profile-card">
          <div className="profile-avatar">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <h2>{user?.username}</h2>
          <p className="role-badge">{getRoleName(user?.role)}</p>
          {user?.bank_name && (
            <p className="bank-info">Banque: {user.bank_name}</p>
          )}
        </div>

        <div className="profile-forms">
          <div className="form-section">
            <h3><Mail size={20} /> Informations personnelles</h3>
            <form onSubmit={handleUpdateProfile}>
              <div className="form-group">
                <label>Nom d utilisateur</label>
                <input type="text" value={user?.username || ''} disabled />
              </div>
              
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="votre@email.com"
                />
              </div>
              
              <div className="form-group">
                <label>Telephone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="+216..."
                />
              </div>
              
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Save size={18} /> Enregistrer
              </button>
            </form>
          </div>

          <div className="form-section">
            <h3><Lock size={20} /> Changer le mot de passe</h3>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>Mot de passe actuel</label>
                <div className="password-input">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              
              <div className="form-group">
                <label>Nouveau mot de passe</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                  required
                  minLength={6}
                />
              </div>
              
              <div className="form-group">
                <label>Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                  required
                />
              </div>
              
              <button type="submit" className="btn btn-primary" disabled={loading}>
                <Lock size={18} /> Changer le mot de passe
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
