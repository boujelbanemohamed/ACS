import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { banksAPI } from '../services/api';
import { Plus, Edit2, Trash2, Building2, FolderTree, FolderInput, Folder, FolderOutput, FileCode } from 'lucide-react';
import './Banks.css';

const Banks = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    source_url: '',
    destination_url: '',
    old_url: '',
    xml_output_url: '',
    is_active: true,
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchBanks();
  }, []);

  const fetchBanks = async () => {
    try {
      const response = await banksAPI.getAll();
      setBanks(response.data.data);
    } catch (error) {
      console.error('Error fetching banks:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.code.trim()) errors.code = 'Le code est obligatoire';
    if (!formData.name.trim()) errors.name = 'Le nom est obligatoire';
    if (!formData.source_url.trim()) errors.source_url = 'URL Source est obligatoire';
    if (!formData.destination_url.trim()) errors.destination_url = 'URL Destination est obligatoire';
    if (!formData.old_url.trim()) errors.old_url = 'URL Archives est obligatoire';
    if (!formData.xml_output_url.trim()) errors.xml_output_url = 'XML Output est obligatoire';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    try {
      if (editingBank) {
        await banksAPI.update(editingBank.id, formData);
      } else {
        await banksAPI.create(formData);
      }
      setShowModal(false);
      setEditingBank(null);
      resetForm();
      fetchBanks();
    } catch (error) {
      alert(error.response?.data?.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleEdit = (bank) => {
    setEditingBank(bank);
    setFormData({
      code: bank.code || '',
      name: bank.name || '',
      source_url: bank.source_url || '',
      destination_url: bank.destination_url || '',
      old_url: bank.old_url || '',
      xml_output_url: bank.xml_output_url || '',
      is_active: bank.is_active,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Etes-vous sur de vouloir supprimer cette banque ?')) {
      try {
        await banksAPI.delete(id);
        fetchBanks();
      } catch (error) {
        alert(error.response?.data?.message || 'Erreur lors de la suppression');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      source_url: '',
      destination_url: '',
      old_url: '',
      xml_output_url: '',
      is_active: true,
    });
    setFormErrors({});
  };

  const handleOpenModal = () => {
    resetForm();
    setEditingBank(null);
    setShowModal(true);
  };

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <div className="banks-page">
      <div className="page-header">
        <h1>Liste des Banques</h1>
        <button className="btn btn-primary" onClick={handleOpenModal}>
          <Plus size={20} /> Ajouter une banque
        </button>
      </div>

      <div className="banks-grid">
        {banks.map((bank) => (
          <div key={bank.id} className="bank-card">
            <div className="bank-header">
              <div className="bank-icon">
                <Building2 size={32} />
              </div>
              <div>
                <h3>{bank.name}</h3>
                <span className="bank-code">{bank.code}</span>
              </div>
              {bank.is_active && <span className="badge badge-success">Active</span>}
            </div>

            <div className="bank-stats-small">
              <div className="stat-item">
                <span className="stat-label">Fichiers</span>
                <span className="stat-value">{bank.total_files_processed || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Enregistrements</span>
                <span className="stat-value">{bank.total_records || 0}</span>
              </div>
            </div>

            <div className="bank-urls">
              <div className="url-item">
                <strong>Source:</strong> <span>{bank.source_url}</span>
              </div>
              <div className="url-item">
                <strong>Destination:</strong> <span>{bank.destination_url}</span>
              </div>
              <div className="url-item">
                <strong>Archives:</strong> <span>{bank.old_url}</span>
              </div>
              <div className={`url-item ${bank.xml_output_url ? 'xml-url' : 'xml-url-missing'}`}>
                <strong>XML Output:</strong> <span>{bank.xml_output_url || 'Non defini'}</span>
              </div>
            </div>

            <div className="bank-actions">
              <button className="btn btn-sm btn-secondary" onClick={() => handleEdit(bank)}>
                <Edit2 size={16} /> Modifier
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(bank.id)}>
                <Trash2 size={16} /> Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Section Structure des dossiers */}
      <div className="folder-structure-section">
        <div className="section-header">
          <FolderTree size={24} />
          <h2>Structure typique des dossiers</h2>
        </div>
        
        <div className="folder-structure-content">
          <div className="folder-explanation">
            <p>Voici comment organiser vos dossiers pour chaque banque. L'application utilise cette structure pour traiter automatiquement les fichiers CSV et generer les fichiers XML.</p>
          </div>

          <div className="folder-tree">
            <div className="tree-container">
              <pre>{`/data/banks/
├── STB/
│   ├── input/          <- URL Source (fichiers CSV a traiter)
│   ├── output/         <- URL Destination (fichiers CSV traites)
│   ├── archives/       <- URL Archives (historique)
│   └── xml_output/     <- XML Output (fichiers XML generes)
├── BNA/
│   ├── input/
│   ├── output/
│   ├── archives/
│   └── xml_output/
└── BIAT/
    ├── input/
    ├── output/
    ├── archives/
    └── xml_output/`}</pre>
            </div>
          </div>

          <div className="folder-flow">
            <h3>Flux de traitement des fichiers</h3>
            <div className="flow-steps">
              <div className="flow-step">
                <div className="step-icon source">
                  <FolderInput size={24} />
                </div>
                <div className="step-content">
                  <h4>1. Depot CSV</h4>
                  <p>Le fichier CSV est depose dans le dossier input (URL Source)</p>
                </div>
              </div>
              
              <div className="flow-arrow">→</div>
              
              <div className="flow-step">
                <div className="step-icon process">
                  <Folder size={24} />
                </div>
                <div className="step-content">
                  <h4>2. Traitement</h4>
                  <p>L'application detecte, lit et valide le fichier CSV</p>
                </div>
              </div>
              
              <div className="flow-arrow">→</div>
              
              <div className="flow-step">
                <div className="step-icon destination">
                  <FolderOutput size={24} />
                </div>
                <div className="step-content">
                  <h4>3. Sortie CSV</h4>
                  <p>CSV valide deplace vers output et copie dans archives</p>
                </div>
              </div>

              <div className="flow-arrow">→</div>
              
              <div className="flow-step">
                <div className="step-icon xml">
                  <FileCode size={24} />
                </div>
                <div className="step-content">
                  <h4>4. Generation XML</h4>
                  <p>Fichier XML genere dans xml_output</p>
                </div>
              </div>
            </div>
          </div>

          <div className="xml-format-info">
            <h3>Format du fichier XML genere</h3>
            <div className="xml-example">
              <pre>{`<?xml version="1.0" encoding="ISO-8859-15"?>
<cardRegistryRecords xmlns="http://cardRegistry.acs.bpcbt.com/v2/types">
  <add id="1" cardNumber="4741560171719668" profileId="STB" cardStatus="ACTIVE">
    <oneTimePasswordSMS phoneNumber="+21624080852"></oneTimePasswordSMS>
  </add>
  <setAuthMethod id="2" cardNumber="4741560171719668" profileId="STB">
    <oneTimePasswordSMS phoneNumber="+21624080852"></oneTimePasswordSMS>
  </setAuthMethod>
</cardRegistryRecords>`}</pre>
            </div>
            <div className="xml-mapping">
              <h4>Correspondance CSV vers XML</h4>
              <table>
                <thead>
                  <tr>
                    <th>Champ CSV</th>
                    <th>Attribut XML</th>
                    <th>Transformation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>pan</code></td>
                    <td><code>cardNumber</code></td>
                    <td>Conversion notation scientifique vers nombre complet</td>
                  </tr>
                  <tr>
                    <td><code>phone</code></td>
                    <td><code>phoneNumber</code></td>
                    <td>Ajout du prefixe +</td>
                  </tr>
                  <tr>
                    <td>Code banque</td>
                    <td><code>profileId</code></td>
                    <td>Code de la banque (STB, BNA, etc.)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="folder-notes">
            <h3>Points importants</h3>
            <ul>
              <li>Les dossiers doivent exister sur le serveur avant de configurer la banque</li>
              <li>L'application doit avoir les droits de lecture/ecriture sur ces dossiers</li>
              <li>Le scan automatique verifie periodiquement l'URL Source de chaque banque active</li>
              <li>Utilisez des chemins absolus (ex: /data/banks/STB/input)</li>
              <li>Le fichier XML est genere automatiquement apres le traitement reussi du CSV</li>
              <li>Le profileId dans le XML correspond au code de la banque</li>
            </ul>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingBank ? 'Modifier la banque' : 'Ajouter une banque'}</h2>
            <form onSubmit={handleSubmit}>
              <div className={`form-group ${formErrors.code ? 'has-error' : ''}`}>
                <label>Code <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="STB"
                />
                {formErrors.code && <span className="error-text">{formErrors.code}</span>}
                <small>Identifiant court unique - sera utilise comme profileId dans le XML</small>
              </div>
              
              <div className={`form-group ${formErrors.name ? 'has-error' : ''}`}>
                <label>Nom <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Societe Tunisienne de Banque"
                />
                {formErrors.name && <span className="error-text">{formErrors.name}</span>}
              </div>
              
              <div className={`form-group ${formErrors.source_url ? 'has-error' : ''}`}>
                <label>URL Source (CSV Input) <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.source_url}
                  onChange={(e) => setFormData({ ...formData, source_url: e.target.value })}
                  placeholder="/data/banks/STB/input"
                />
                {formErrors.source_url && <span className="error-text">{formErrors.source_url}</span>}
                <small>Dossier ou deposer les fichiers CSV a traiter</small>
              </div>
              
              <div className={`form-group ${formErrors.destination_url ? 'has-error' : ''}`}>
                <label>URL Destination (CSV Output) <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.destination_url}
                  onChange={(e) => setFormData({ ...formData, destination_url: e.target.value })}
                  placeholder="/data/banks/STB/output"
                />
                {formErrors.destination_url && <span className="error-text">{formErrors.destination_url}</span>}
                <small>Dossier ou seront deplaces les fichiers CSV traites</small>
              </div>
              
              <div className={`form-group ${formErrors.old_url ? 'has-error' : ''}`}>
                <label>URL Archives <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.old_url}
                  onChange={(e) => setFormData({ ...formData, old_url: e.target.value })}
                  placeholder="/data/banks/STB/archives"
                />
                {formErrors.old_url && <span className="error-text">{formErrors.old_url}</span>}
                <small>Dossier pour l'archivage des fichiers</small>
              </div>
              
              <div className={`form-group ${formErrors.xml_output_url ? 'has-error' : ''}`}>
                <label>XML Output <span className="required">*</span></label>
                <input
                  type="text"
                  value={formData.xml_output_url}
                  onChange={(e) => setFormData({ ...formData, xml_output_url: e.target.value })}
                  placeholder="/data/banks/STB/xml_output"
                />
                {formErrors.xml_output_url && <span className="error-text">{formErrors.xml_output_url}</span>}
                <small>Dossier ou seront generes les fichiers XML (obligatoire)</small>
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  Banque active
                </label>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingBank ? 'Mettre a jour' : 'Creer'}
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
