import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, Shield, Building2, Check, X, RefreshCw, Search, Key } from 'lucide-react';
import api from '../services/api';
import './Users.css';

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'bank',
    bankId: '',
    phone: '',
    isActive: true
  });

  useEffect(() => {
    fetchUsers();
    fetchBanks();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBanks = async () => {
    try {
      const response = await api.get('/banks');
      setBanks(response.data.data || []);
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.put('/users/' + editingUser.id, formData);
      } else {
        await api.post('/users', formData);
      }
      fetchUsers();
      closeModal();
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      bankId: user.bank_id || '',
      phone: user.phone || '',
      isActive: user.is_active
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    try {
      await api.delete('/users/' + id);
      fetchUsers();
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await api.put('/users/' + user.id, { isActive: !user.is_active });
      fetchUsers();
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      password: '',
      role: 'bank',
      bankId: '',
      phone: '',
      isActive: true
    });
  };

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.bank_name && user.bank_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getRoleBadge = (role) => {
    if (role === 'super_admin') {
      return <span className="role-badge super-admin"><Shield size={14} /> Super Admin</span>;
    }
    return <span className="role-badge bank"><Building2 size={14} /> Banque</span>;
  };

  return (
    <div className="users-page">
      <div className="page-header">
        <h1><Users size={28} /> Gestion des Utilisateurs</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> Nouvel Utilisateur
        </button>
      </div>

      <div className="search-bar">
        <Search size={20} />
        <input
          type="text"
          placeholder="Rechercher par nom, email ou banque..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading"><RefreshCw size={32} className="spin" /> Chargement...</div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Role</th>
                <th>Banque</th>
                <th>Derniere connexion</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id} className={!user.is_active ? 'inactive' : ''}>
                  <td>
                    <div className="user-info">
                      <div className="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
                      <span>{user.username}</span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>{getRoleBadge(user.role)}</td>
                  <td>{user.bank_name || '-'}</td>
                  <td>{user.last_login ? new Date(user.last_login).toLocaleString('fr-FR') : 'Jamais'}</td>
                  <td>
                    <span className={'status-badge ' + (user.is_active ? 'active' : 'inactive')}>
                      {user.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn-icon" onClick={() => handleEdit(user)} title="Modifier">
                        <Edit2 size={16} />
                      </button>
                      <button 
                        className="btn-icon" 
                        onClick={() => handleToggleActive(user)}
                        title={user.is_active ? 'Desactiver' : 'Activer'}
                      >
                        {user.is_active ? <X size={16} /> : <Check size={16} />}
                      </button>
                      <button className="btn-icon btn-danger" onClick={() => handleDelete(user.id)} title="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nom d'utilisateur *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value})}
                  required
                  disabled={editingUser}
                />
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>{editingUser ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe *'}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required={!editingUser}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="bank">Banque</option>
                  </select>
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
              </div>

              {formData.role === 'bank' && (
                <div className="form-group">
                  <label>Banque associee *</label>
                  <select
                    value={formData.bankId}
                    onChange={(e) => setFormData({...formData, bankId: e.target.value})}
                    required={formData.role === 'bank'}
                  >
                    <option value="">Selectionnez une banque</option>
                    {banks.map(bank => (
                      <option key={bank.id} value={bank.id}>{bank.name} ({bank.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {editingUser && (
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                    />
                    Compte actif
                  </label>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Modifier' : 'Creer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
