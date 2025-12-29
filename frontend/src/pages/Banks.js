import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Plus, Edit2, Trash2, Eye, Check, X, RefreshCw, ExternalLink, FileText, ArrowRight } from 'lucide-react';
import api from '../services/api';
import './Banks.css';

const Banks = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';
  
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingBank, setViewingBank] = useState(null);
  const [editingBank, setEditingBank] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    source_url: '',
    destination_url: '',
    old_url: '',
    xml_output_url: '',
    is_active: true
  });

  useEffect(() => {
    fetchBanks();
  }, []);

  const fetchBanks = async () => {
    try {
      const bankParam = user?.role === 'bank' && user?.bank_id ? '?bankId=' + user.bank_id : '';
      const response = await api.get('/banks' + bankParam);
      setBanks(response.data.data || []);
    } catch (error) {
      console.error('Error fetching banks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (bank) => {
    setViewingBank(bank);
    setShowViewModal(true);
  };

  const handleEdit = (bank) => {
    setEditingBank(bank);
    setFormData({
      code: bank.code,
      name: bank.name,
      source_url: bank.source_url || '',
      destination_url: bank.destination_url || '',
      old_url: bank.old_url || '',
      xml_output_url: bank.xml_output_url || '',
      is_active: bank.is_active
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBank) {
        await api.put('/banks/' + editingBank.id, formData);
      } else {
        await api.post('/banks', formData);
      }
      fetchBanks();
      closeModal();
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette banque ?')) return;
    try {
      await api.delete('/banks/' + id);
      fetchBanks();
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBank(null);
    setFormData({
      code: '',
      name: '',
      source_url: '',
      destination_url: '',
      old_url: '',
      xml_output_url: '',
      is_active: true
    });
  };

  if (loading) {
    return <div className="loading"><RefreshCw size={32} className="spin" /> Chargement...</div>;
  }

  return (
    <div className="banks-page">
      <div className="page-header">
        <h1><Building2 size={28} /> {isAdmin ? 'Gestion des Banques' : 'Ma Banque'}</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} /> Nouvelle Banque
          </button>
        )}
      </div>

      <div className="banks-grid">
        {banks.map(bank => (
          <div key={bank.id} className={'bank-card ' + (bank.is_active ? 'active' : 'inactive')}>
            <div className="bank-header">
              <div className="bank-icon">
                <Building2 size={32} />
              </div>
              <div className="bank-info">
                <h3>{bank.name}</h3>
                <span className="bank-code">{bank.code}</span>
              </div>
              <span className={'status-badge ' + (bank.is_active ? 'active' : 'inactive')}>
                {bank.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="bank-stats">
              <div className="stat">
                <span className="stat-value">{bank.total_records || 0}</span>
                <span className="stat-label">Enregistrements</span>
              </div>
              <div className="stat">
                <span className="stat-value">{bank.total_files_processed || 0}</span>
                <span className="stat-label">Fichiers</span>
              </div>
            </div>

            <div className="bank-actions">
              <button className="btn btn-secondary" onClick={() => handleView(bank)}>
                <Eye size={16} /> Voir
              </button>
              {isAdmin && (
                <>
                  <button className="btn btn-secondary" onClick={() => handleEdit(bank)}>
                    <Edit2 size={16} /> Modifier
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(bank.id)}>
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Documentation - visible uniquement pour admin */}
      {isAdmin && (
        <div className="bank-documentation">
          <h2>Documentation</h2>
          
          <div className="doc-section">
            <h3>Structure typique des dossiers</h3>
            <div className="folder-structure">
              <code>
                /ACS/[CODE_BANQUE]/<br/>
                ├── source/      (fichiers CSV a traiter)<br/>
                ├── destination/ (fichiers traites)<br/>
                ├── archive/     (anciens fichiers)<br/>
                └── xml/         (fichiers XML generes)
              </code>
            </div>
          </div>

          <div className="doc-section">
            <h3>Format du fichier XML genere</h3>
            <div className="xml-example">
              <code>
{`<?xml version="1.0" encoding="UTF-8"?>
<CardList>
  <Card>
    <PAN>4111111111111111</PAN>
    <ExpiryDate>12/25</ExpiryDate>
    <PhoneNumber>+21612345678</PhoneNumber>
    ...
  </Card>
</CardList>`}
              </code>
            </div>
          </div>

          <div className="doc-section">
            <h3>Points importants</h3>
            <ul>
              <li>Les fichiers CSV doivent utiliser le point-virgule (;) comme separateur</li>
              <li>L encodage doit etre UTF-8</li>
              <li>Le numero de telephone doit commencer par +216</li>
              <li>Le PAN doit contenir entre 13 et 19 chiffres</li>
            </ul>
          </div>
        </div>
      )}

      {/* Modal Vue - pour utilisateurs banque */}
      {showViewModal && viewingBank && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content modal-view" onClick={(e) => e.stopPropagation()}>
            <h2><Building2 size={24} /> {viewingBank.name}</h2>
            
            <div className="view-section">
              <h3>Informations generales</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Code</label>
                  <span>{viewingBank.code}</span>
                </div>
                <div className="info-item">
                  <label>Nom</label>
                  <span>{viewingBank.name}</span>
                </div>
                <div className="info-item">
                  <label>Statut</label>
                  <span className={'status-badge ' + (viewingBank.is_active ? 'active' : 'inactive')}>
                    {viewingBank.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <div className="view-section">
              <h3>Flux de traitement</h3>
              <div className="flow-diagram">
                <div className="flow-step">
                  <div className="flow-icon"><FileText size={24} /></div>
                  <div className="flow-label">Fichier CSV</div>
                  <div className="flow-desc">Upload ou scan automatique</div>
                </div>
                <ArrowRight size={24} className="flow-arrow" />
                <div className="flow-step">
                  <div className="flow-icon"><Check size={24} /></div>
                  <div className="flow-label">Validation</div>
                  <div className="flow-desc">Verification des donnees</div>
                </div>
                <ArrowRight size={24} className="flow-arrow" />
                <div className="flow-step">
                  <div className="flow-icon"><FileText size={24} /></div>
                  <div className="flow-label">Generation XML</div>
                  <div className="flow-desc">Fichier ACS</div>
                </div>
              </div>
            </div>

            <div className="view-section">
              <h3>Statistiques</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Total enregistrements</label>
                  <span>{viewingBank.total_records || 0}</span>
                </div>
                <div className="info-item">
                  <label>Fichiers traites</label>
                  <span>{viewingBank.total_files_processed || 0}</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowViewModal(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edition - admin seulement */}
      {showModal && isAdmin && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingBank ? 'Modifier la banque' : 'Nouvelle banque'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Code *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    required
                    maxLength={10}
                    placeholder="Ex: ATB"
                  />
                </div>
                <div className="form-group">
                  <label>Nom *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                    placeholder="Arab Tunisian Bank"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>URL Source *</label>
                <input
                  type="text"
                  value={formData.source_url}
                  onChange={(e) => setFormData({...formData, source_url: e.target.value})}
                  required
                  placeholder="https://serveur/ACS/ATB/source"
                />
              </div>

              <div className="form-group">
                <label>URL Destination *</label>
                <input
                  type="text"
                  value={formData.destination_url}
                  onChange={(e) => setFormData({...formData, destination_url: e.target.value})}
                  required
                  placeholder="https://serveur/ACS/ATB/destination"
                />
              </div>

              <div className="form-group">
                <label>URL Archive *</label>
                <input
                  type="text"
                  value={formData.old_url}
                  onChange={(e) => setFormData({...formData, old_url: e.target.value})}
                  required
                  placeholder="https://serveur/ACS/ATB/archive"
                />
              </div>

              <div className="form-group">
                <label>URL Sortie XML *</label>
                <input
                  type="text"
                  value={formData.xml_output_url}
                  onChange={(e) => setFormData({...formData, xml_output_url: e.target.value})}
                  required
                  placeholder="https://serveur/ACS/ATB/xml"
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  />
                  Banque active
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingBank ? 'Modifier' : 'Creer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Banks;
