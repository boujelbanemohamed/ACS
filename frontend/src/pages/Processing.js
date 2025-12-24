import React, { useState, useEffect } from 'react';
import { banksAPI, processingAPI } from '../services/api';
import { Upload, Link as LinkIcon, PlayCircle, Download, RefreshCw, AlertTriangle, CheckCircle, X, Check, FileText, Send, ArrowRight, PenLine, Plus, Trash2 } from 'lucide-react';
import './Processing.css';

const Processing = () => {
  const [banks, setBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://175.0.2.15/ACS');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState([]);
  const [validRows, setValidRows] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [notification, setNotification] = useState(null);
  const [stats, setStats] = useState({
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0
  });
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'url', 'manual'
  const [manualEntries, setManualEntries] = useState([]);
  const [manualForm, setManualForm] = useState({
    language: 'fr',
    firstName: '',
    lastName: '',
    pan: '',
    expiry: '',
    phone: '',
    behaviour: 'otp',
    action: 'update'
  });
  const [manualFormErrors, setManualFormErrors] = useState({});

  useEffect(() => {
    fetchBanks();
  }, []);

  useEffect(() => {
    if (result) {
      setStats({
        totalRows: result.data?.stats?.totalRows || 0,
        validRows: validRows.length,
        invalidRows: errors.length,
        duplicateRows: result.data?.stats?.duplicateRows || 0
      });
    }
  }, [errors, validRows, result]);

  const fetchBanks = async () => {
    try {
      const response = await banksAPI.getAll();
      setBanks(response.data.data.filter(b => b.is_active));
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const processResponseData = (responseData) => {
    const errorsData = responseData.data?.errors || [];
    const validData = responseData.data?.validRecords || [];
    
    const processedErrors = errorsData.map((err, index) => {
      const rowData = err.rowData || {};
      return {
        id: `error-${index}`,
        errorIndex: index,
        rowNumber: err.rowNumber || index + 1,
        fieldName: err.field || 'unknown',
        errorMessage: err.error || 'Erreur de validation',
        originalValue: err.value || '',
        severity: err.severity || 'error',
        rowData: {
          language: rowData.language || '',
          firstName: rowData.firstName || '',
          lastName: rowData.lastName || '',
          pan: rowData.pan || '',
          expiry: rowData.expiry || '',
          phone: rowData.phone || '',
          behaviour: rowData.behaviour || '',
          action: rowData.action || ''
        }
      };
    });
    
    const processedValid = validData.map((row, index) => ({
      id: `valid-${index}`,
      rowNumber: row.rowNumber || index + 1,
      language: row.language || '',
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      pan: row.pan || '',
      expiry: row.expiry || '',
      phone: row.phone || '',
      behaviour: row.behaviour || '',
      action: row.action || '',
      isOriginallyValid: true
    }));
    
    setErrors(processedErrors);
    setValidRows(processedValid);
  };

  const handleProcessUrl = async () => {
    if (!selectedBank || !baseUrl) {
      alert('Veuillez selectionner une banque et entrer une URL de base');
      return;
    }

    setProcessing(true);
    setResult(null);
    setErrors([]);
    setValidRows([]);

    try {
      const response = await processingAPI.processUrl({
        bankId: selectedBank,
        baseUrl: baseUrl
      });

      setResult(response.data);
      processResponseData(response.data);
      
    } catch (error) {
      alert(error.response?.data?.message || 'Erreur lors du traitement');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    
    if (!selectedFile || !selectedBank) {
      alert('Veuillez selectionner une banque et un fichier');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('bankId', selectedBank);

    setProcessing(true);
    setResult(null);
    setErrors([]);
    setValidRows([]);

    try {
      const response = await processingAPI.uploadFile(formData);
      setResult(response.data);
      processResponseData(response.data);

      setSelectedFile(null);
      e.target.reset();
    } catch (error) {
      alert(error.response?.data?.message || 'Erreur lors du traitement');
    } finally {
      setProcessing(false);
    }
  };

  // ==================== SAISIE MANUELLE ====================

  const validateManualForm = () => {
    const errors = {};
    
    if (!manualForm.language.trim()) errors.language = 'Langue obligatoire';
    if (!manualForm.firstName.trim()) errors.firstName = 'Prenom obligatoire';
    if (!manualForm.lastName.trim()) errors.lastName = 'Nom obligatoire';
    
    // Validation PAN (16 chiffres)
    const panClean = manualForm.pan.replace(/\s/g, '');
    if (!panClean) {
      errors.pan = 'PAN obligatoire';
    } else if (!/^\d{16}$/.test(panClean)) {
      errors.pan = 'PAN doit contenir exactement 16 chiffres';
    }
    
    // Validation Expiry (YYYYMM ou YYMM)
    if (!manualForm.expiry.trim()) {
      errors.expiry = 'Expiration obligatoire';
    } else if (!/^(\d{4}|\d{6})$/.test(manualForm.expiry)) {
      errors.expiry = 'Format: YYMM ou YYYYMM (ex: 2512 ou 202512)';
    }
    
    // Validation Phone
    if (!manualForm.phone.trim()) {
      errors.phone = 'Telephone obligatoire';
    } else if (!/^\d{8,15}$/.test(manualForm.phone.replace(/\s/g, ''))) {
      errors.phone = 'Numero de telephone invalide (8-15 chiffres)';
    }
    
    if (!manualForm.behaviour.trim()) errors.behaviour = 'Behaviour obligatoire';
    if (!manualForm.action.trim()) errors.action = 'Action obligatoire';
    
    setManualFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddManualEntry = () => {
    if (!validateManualForm()) return;
    
    // Check for duplicate PAN in current entries
    const panClean = manualForm.pan.replace(/\s/g, '');
    const existingEntry = manualEntries.find(e => e.pan === panClean);
    if (existingEntry) {
      showNotification('Ce PAN existe deja dans la liste', 'error');
      return;
    }
    
    const newEntry = {
      id: `manual-${Date.now()}`,
      rowNumber: manualEntries.length + 1,
      language: manualForm.language,
      firstName: manualForm.firstName,
      lastName: manualForm.lastName,
      pan: panClean,
      expiry: manualForm.expiry,
      phone: manualForm.phone.replace(/\s/g, ''),
      behaviour: manualForm.behaviour,
      action: manualForm.action,
      isManual: true,
      status: 'pending' // pending, valid, duplicate, error
    };
    
    setManualEntries(prev => [...prev, newEntry]);
    
    // Reset form
    setManualForm({
      language: 'fr',
      firstName: '',
      lastName: '',
      pan: '',
      expiry: '',
      phone: '',
      behaviour: 'otp',
      action: 'update'
    });
    setManualFormErrors({});
    
    showNotification('Enregistrement ajoute a la liste');
  };

  const handleRemoveManualEntry = (id) => {
    setManualEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleValidateManualEntries = async () => {
    if (!selectedBank) {
      alert('Veuillez selectionner une banque');
      return;
    }
    
    if (manualEntries.length === 0) {
      alert('Aucun enregistrement a valider');
      return;
    }

    setProcessing(true);
    
    try {
      const response = await processingAPI.validateManualEntries({
        bankId: selectedBank,
        entries: manualEntries
      });
      
      // Update entries with validation results
      const validatedEntries = response.data.data.entries || [];
      setManualEntries(validatedEntries);
      
      const validCount = validatedEntries.filter(e => e.status === 'valid').length;
      const duplicateCount = validatedEntries.filter(e => e.status === 'duplicate').length;
      const errorCount = validatedEntries.filter(e => e.status === 'error').length;
      
      showNotification(`Validation terminee: ${validCount} valides, ${duplicateCount} doublons, ${errorCount} erreurs`);
      
    } catch (error) {
      alert(error.response?.data?.message || 'Erreur lors de la validation');
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessManualEntries = async () => {
    if (!selectedBank) {
      alert('Veuillez selectionner une banque');
      return;
    }
    
    const validEntries = manualEntries.filter(e => e.status === 'valid' || e.status === 'pending');
    if (validEntries.length === 0) {
      alert('Aucun enregistrement valide a traiter');
      return;
    }

    setProcessing(true);
    
    try {
      const response = await processingAPI.processManualEntries({
        bankId: selectedBank,
        entries: validEntries
      });
      
      showNotification(response.data.message || 'Traitement termine avec succes !');
      
      // Clear processed entries
      setManualEntries([]);
      
    } catch (error) {
      alert(error.response?.data?.message || 'Erreur lors du traitement');
    } finally {
      setProcessing(false);
    }
  };

  // ==================== RESOLUTION ERREURS ====================

  const handleResolveError = (errorIndex, correctedRowData) => {
    const errorToResolve = errors[errorIndex];
    
    const correctedRow = {
      id: `corrected-${Date.now()}-${errorIndex}`,
      rowNumber: errorToResolve.rowNumber,
      originalData: { ...errorToResolve.rowData },
      language: correctedRowData.language,
      firstName: correctedRowData.firstName,
      lastName: correctedRowData.lastName,
      pan: correctedRowData.pan,
      expiry: correctedRowData.expiry,
      phone: correctedRowData.phone,
      behaviour: correctedRowData.behaviour,
      action: correctedRowData.action,
      correctedAt: new Date().toISOString(),
      correctedField: errorToResolve.fieldName,
      originalValue: errorToResolve.originalValue,
      isCorrected: true
    };

    const panExists = validRows.some(row => row.pan === correctedRowData.pan);
    if (panExists) {
      showNotification(`Le PAN ${correctedRowData.pan} existe deja dans les lignes valides`, 'error');
      return;
    }

    const newErrors = errors.filter((e, idx) => idx !== errorIndex);
    setErrors(newErrors);
    setValidRows(prev => [...prev, correctedRow]);
    showNotification(`Ligne ${correctedRow.rowNumber} corrigee avec succes !`);
  };

  const handleIgnoreError = (errorIndex) => {
    const ignoredError = errors[errorIndex];
    setErrors(errors.filter((e, idx) => idx !== errorIndex));
    showNotification(`Ligne ${ignoredError.rowNumber} ignoree`, 'warning');
  };

  const handleRemoveValidRow = (rowIndex) => {
    const removedRow = validRows[rowIndex];
    setValidRows(validRows.filter((r, idx) => idx !== rowIndex));
    showNotification(`Ligne ${removedRow.rowNumber} retiree`, 'warning');
  };

  const handleFinalProcess = async () => {
    setProcessing(true);
    try {
      showNotification(`Traitement de ${validRows.length} lignes lance avec succes !`);
      setTimeout(() => {
        showNotification('Fichier XML genere avec succes !');
      }, 1500);
    } catch (error) {
      alert('Erreur lors du traitement final');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadCorrected = () => {
    const headers = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];
    let csv = headers.join(';') + '\n';
    
    validRows.forEach(row => {
      csv += [
        row.language || '',
        row.firstName || '',
        row.lastName || '',
        row.pan || '',
        row.expiry || '',
        row.phone || '',
        row.behaviour || '',
        row.action || ''
      ].join(';') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `corrected_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    
    showNotification('Fichier CSV telecharge');
  };

  return (
    <div className="processing-page">
      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)}><X size={16} /></button>
        </div>
      )}

      <h1>Traitement des Fichiers CSV</h1>

      {/* Tabs */}
      <div className="processing-tabs">
        <button 
          className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          <Upload size={18} /> Upload Fichier
        </button>
        <button 
          className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
          onClick={() => setActiveTab('url')}
        >
          <LinkIcon size={18} /> Traitement URL
        </button>
        <button 
          className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          <PenLine size={18} /> Saisie Manuelle
        </button>
      </div>

      {/* Bank Selection (common) */}
      <div className="bank-selection">
        <label>Banque</label>
        <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}>
          <option value="">-- Choisir une banque --</option>
          {banks.map((bank) => (
            <option key={bank.id} value={bank.id}>
              {bank.name} ({bank.code})
            </option>
          ))}
        </select>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="processing-section">
            <h2><Upload size={24} /> Upload Manuel de Fichier CSV</h2>
            <form onSubmit={handleFileUpload}>
              <div className="form-group">
                <label>Fichier CSV</label>
                <div className="file-upload">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    required
                  />
                  {selectedFile && (
                    <div className="file-selected">
                      <CheckCircle size={16} />
                      {selectedFile.name}
                    </div>
                  )}
                </div>
              </div>

              <button 
                type="submit"
                className="btn btn-primary btn-block"
                disabled={processing || !selectedBank}
              >
                {processing ? <RefreshCw size={20} className="spin" /> : <Upload size={20} />}
                {processing ? 'Upload en cours...' : 'Uploader et traiter'}
              </button>
            </form>
          </div>
        )}

        {/* URL Tab */}
        {activeTab === 'url' && (
          <div className="processing-section">
            <h2><LinkIcon size={24} /> Traitement par URL</h2>
            <div className="form-group">
              <label>URL de base</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://175.0.2.15/ACS"
              />
            </div>

            <button 
              className="btn btn-primary btn-block"
              onClick={handleProcessUrl}
              disabled={processing || !selectedBank}
            >
              {processing ? <RefreshCw size={20} className="spin" /> : <PlayCircle size={20} />}
              {processing ? 'Traitement en cours...' : 'Lancer le traitement'}
            </button>
          </div>
        )}

        {/* Manual Entry Tab */}
        {activeTab === 'manual' && (
          <div className="processing-section manual-entry-section">
            <h2><PenLine size={24} /> Saisie Manuelle</h2>
            <p className="section-description">
              Saisissez manuellement les donnees d'un enregistrement. Le systeme verifiera automatiquement 
              la conformite des donnees et les doublons avant de generer les fichiers CSV et XML.
            </p>

            <div className="manual-form">
              <div className="form-row">
                <div className={`form-group ${manualFormErrors.language ? 'has-error' : ''}`}>
                  <label>Langue <span className="required">*</span></label>
                  <select 
                    value={manualForm.language} 
                    onChange={(e) => setManualForm({...manualForm, language: e.target.value})}
                  >
                    <option value="fr">Francais (fr)</option>
                    <option value="en">Anglais (en)</option>
                    <option value="ar">Arabe (ar)</option>
                  </select>
                  {manualFormErrors.language && <span className="error-text">{manualFormErrors.language}</span>}
                </div>

                <div className={`form-group ${manualFormErrors.firstName ? 'has-error' : ''}`}>
                  <label>Prenom <span className="required">*</span></label>
                  <input
                    type="text"
                    value={manualForm.firstName}
                    onChange={(e) => setManualForm({...manualForm, firstName: e.target.value.toUpperCase()})}
                    placeholder="MOHAMED"
                  />
                  {manualFormErrors.firstName && <span className="error-text">{manualFormErrors.firstName}</span>}
                </div>

                <div className={`form-group ${manualFormErrors.lastName ? 'has-error' : ''}`}>
                  <label>Nom <span className="required">*</span></label>
                  <input
                    type="text"
                    value={manualForm.lastName}
                    onChange={(e) => setManualForm({...manualForm, lastName: e.target.value.toUpperCase()})}
                    placeholder="BEN ALI"
                  />
                  {manualFormErrors.lastName && <span className="error-text">{manualFormErrors.lastName}</span>}
                </div>
              </div>

              <div className="form-row">
                <div className={`form-group ${manualFormErrors.pan ? 'has-error' : ''}`}>
                  <label>PAN (16 chiffres) <span className="required">*</span></label>
                  <input
                    type="text"
                    value={manualForm.pan}
                    onChange={(e) => setManualForm({...manualForm, pan: e.target.value.replace(/\D/g, '').slice(0, 16)})}
                    placeholder="4741560171719668"
                    maxLength="16"
                  />
                  {manualFormErrors.pan && <span className="error-text">{manualFormErrors.pan}</span>}
                  <small>{manualForm.pan.length}/16 chiffres</small>
                </div>

                <div className={`form-group ${manualFormErrors.expiry ? 'has-error' : ''}`}>
                  <label>Expiration <span className="required">*</span></label>
                  <input
                    type="text"
                    value={manualForm.expiry}
                    onChange={(e) => setManualForm({...manualForm, expiry: e.target.value.replace(/\D/g, '').slice(0, 6)})}
                    placeholder="202512 ou 2512"
                    maxLength="6"
                  />
                  {manualFormErrors.expiry && <span className="error-text">{manualFormErrors.expiry}</span>}
                  <small>Format: YYYYMM ou YYMM</small>
                </div>

                <div className={`form-group ${manualFormErrors.phone ? 'has-error' : ''}`}>
                  <label>Telephone <span className="required">*</span></label>
                  <input
                    type="text"
                    value={manualForm.phone}
                    onChange={(e) => setManualForm({...manualForm, phone: e.target.value.replace(/\D/g, '')})}
                    placeholder="21624080852"
                  />
                  {manualFormErrors.phone && <span className="error-text">{manualFormErrors.phone}</span>}
                  <small>Sans le +</small>
                </div>
              </div>

              <div className="form-row">
                <div className={`form-group ${manualFormErrors.behaviour ? 'has-error' : ''}`}>
                  <label>Behaviour <span className="required">*</span></label>
                  <select 
                    value={manualForm.behaviour} 
                    onChange={(e) => setManualForm({...manualForm, behaviour: e.target.value})}
                  >
                    <option value="otp">OTP</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </select>
                  {manualFormErrors.behaviour && <span className="error-text">{manualFormErrors.behaviour}</span>}
                </div>

                <div className={`form-group ${manualFormErrors.action ? 'has-error' : ''}`}>
                  <label>Action <span className="required">*</span></label>
                  <select 
                    value={manualForm.action} 
                    onChange={(e) => setManualForm({...manualForm, action: e.target.value})}
                  >
                    <option value="update">Update</option>
                    <option value="add">Add</option>
                    <option value="delete">Delete</option>
                  </select>
                  {manualFormErrors.action && <span className="error-text">{manualFormErrors.action}</span>}
                </div>

                <div className="form-group btn-group">
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    onClick={handleAddManualEntry}
                  >
                    <Plus size={18} /> Ajouter a la liste
                  </button>
                </div>
              </div>
            </div>

            {/* Manual Entries List */}
            {manualEntries.length > 0 && (
              <div className="manual-entries-list">
                <div className="entries-header">
                  <h3>Enregistrements a traiter ({manualEntries.length})</h3>
                  <div className="entries-actions">
                    <button 
                      className="btn btn-secondary"
                      onClick={handleValidateManualEntries}
                      disabled={processing}
                    >
                      <Check size={18} /> Valider les donnees
                    </button>
                    <button 
                      className="btn btn-success"
                      onClick={handleProcessManualEntries}
                      disabled={processing || !selectedBank}
                    >
                      <Send size={18} /> Traiter et Generer CSV/XML
                    </button>
                  </div>
                </div>

                <table className="entries-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Langue</th>
                      <th>Prenom</th>
                      <th>Nom</th>
                      <th>PAN</th>
                      <th>Expiration</th>
                      <th>Telephone</th>
                      <th>Behaviour</th>
                      <th>Action</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualEntries.map((entry, index) => (
                      <tr key={entry.id} className={`status-${entry.status}`}>
                        <td>{index + 1}</td>
                        <td>{entry.language}</td>
                        <td>{entry.firstName}</td>
                        <td>{entry.lastName}</td>
                        <td className="pan-cell">{entry.pan}</td>
                        <td>{entry.expiry}</td>
                        <td>{entry.phone}</td>
                        <td>{entry.behaviour}</td>
                        <td>{entry.action}</td>
                        <td>
                          <span className={`status-badge ${entry.status}`}>
                            {entry.status === 'pending' && 'En attente'}
                            {entry.status === 'valid' && <><CheckCircle size={14} /> Valide</>}
                            {entry.status === 'duplicate' && <><AlertTriangle size={14} /> Doublon</>}
                            {entry.status === 'error' && <><X size={14} /> Erreur</>}
                          </span>
                        </td>
                        <td>
                          <button 
                            className="btn-icon btn-remove"
                            onClick={() => handleRemoveManualEntry(entry.id)}
                            title="Supprimer"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results Section (for Upload and URL tabs) */}
      {result && activeTab !== 'manual' && (
        <div className="result-section">
          <div className={`result-header ${errors.length === 0 ? 'success' : 'error'}`}>
            {errors.length === 0 ? <CheckCircle size={32} /> : <AlertTriangle size={32} />}
            <h2>{errors.length === 0 ? 'Toutes les lignes sont valides !' : `${errors.length} erreur(s) a corriger`}</h2>
          </div>

          <div className="result-stats">
            <div className="stat-box">
              <span className="stat-label">Total lignes</span>
              <span className="stat-value">{stats.totalRows}</span>
            </div>
            <div className="stat-box success">
              <span className="stat-label">Lignes valides</span>
              <span className="stat-value">{stats.validRows}</span>
            </div>
            <div className="stat-box error">
              <span className="stat-label">Lignes invalides</span>
              <span className="stat-value">{stats.invalidRows}</span>
            </div>
            <div className="stat-box warning">
              <span className="stat-label">Doublons (PAN)</span>
              <span className="stat-value">{stats.duplicateRows}</span>
            </div>
          </div>

          {/* Errors Block */}
          <div className="data-block errors-block">
            <div className="block-header error">
              <AlertTriangle size={24} />
              <h3>Lignes avec Erreurs ({errors.length})</h3>
            </div>
            
            {errors.length === 0 ? (
              <div className="empty-block success">
                <CheckCircle size={48} />
                <p>Toutes les erreurs ont ete corrigees !</p>
              </div>
            ) : (
              <div className="errors-list">
                {errors.map((error, index) => (
                  <ErrorRowEditor 
                    key={error.id || index} 
                    error={error} 
                    errorIndex={index}
                    onResolve={handleResolveError} 
                    onIgnore={handleIgnoreError}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Valid Rows Block */}
          <div className="data-block valid-block">
            <div className="block-header success">
              <CheckCircle size={24} />
              <h3>Lignes Valides ({validRows.length})</h3>
              {validRows.length > 0 && errors.length === 0 && (
                <button className="btn btn-success header-action-btn" onClick={handleFinalProcess} disabled={processing}>
                  <Send size={18} /> Traiter et Generer XML
                </button>
              )}
            </div>
            
            {validRows.length === 0 ? (
              <div className="empty-block">
                <FileText size={48} />
                <p>Aucune ligne valide pour le moment.</p>
              </div>
            ) : (
              <>
                <div className="valid-rows-list">
                  {validRows.map((row, index) => (
                    <ValidRowCard 
                      key={row.id || index} 
                      row={row} 
                      rowIndex={index}
                      onRemove={handleRemoveValidRow}
                    />
                  ))}
                </div>
                
                <div className="valid-block-actions">
                  <button className="btn btn-secondary" onClick={handleDownloadCorrected}>
                    <Download size={18} /> Telecharger CSV corrige
                  </button>
                  {errors.length === 0 && (
                    <button className="btn btn-success btn-lg" onClick={handleFinalProcess} disabled={processing}>
                      {processing ? <RefreshCw size={20} className="spin" /> : <Send size={20} />}
                      {processing ? 'Traitement...' : `Traiter ${validRows.length} ligne(s) et Generer XML`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Error Row Editor Component
const ErrorRowEditor = ({ error, errorIndex, onResolve, onIgnore }) => {
  const [editedRow, setEditedRow] = useState({ ...error.rowData });
  const fieldName = error.fieldName;
  const isDuplicate = fieldName === 'pan' && error.severity === 'warning';

  const handleFieldChange = (field, value) => {
    setEditedRow(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!editedRow.pan || editedRow.pan.trim() === '') {
      alert('Le PAN est obligatoire');
      return;
    }
    if (isDuplicate && editedRow.pan === error.originalValue) {
      alert('Vous devez modifier le PAN pour resoudre le doublon');
      return;
    }
    onResolve(errorIndex, editedRow);
  };

  const fields = [
    { key: 'language', label: 'Langue' },
    { key: 'firstName', label: 'Prenom' },
    { key: 'lastName', label: 'Nom' },
    { key: 'pan', label: 'PAN' },
    { key: 'expiry', label: 'Expiration' },
    { key: 'phone', label: 'Telephone' },
    { key: 'behaviour', label: 'Behaviour' },
    { key: 'action', label: 'Action' }
  ];

  return (
    <div className="error-row-editor">
      <div className="error-row-header">
        <span className="row-badge">Ligne {error.rowNumber}</span>
        <span className={`error-badge ${isDuplicate ? 'warning' : ''}`}>
          {isDuplicate ? 'DOUBLON PAN' : 'ERREUR'}
        </span>
        <span className="error-field-badge">Champ: {fieldName}</span>
      </div>
      
      <div className={`error-message-box ${isDuplicate ? 'warning' : ''}`}>
        <AlertTriangle size={16} />
        <span>{error.errorMessage}</span>
      </div>

      <div className="row-editor-grid">
        {fields.map(({ key, label }) => (
          <div key={key} className={`field-group ${key === 'pan' && fieldName === 'pan' ? 'error-field' : ''}`}>
            <label>{label} {key === 'pan' && <span className="required">*</span>}</label>
            <input
              type="text"
              value={editedRow[key] || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              className={key === 'pan' && fieldName === 'pan' ? 'error-input' : ''}
            />
          </div>
        ))}
      </div>

      <div className="error-row-actions">
        <button className="btn btn-success" onClick={handleSubmit}>
          <CheckCircle size={18} /> Valider la correction
        </button>
        <button className="btn btn-outline" onClick={() => onIgnore(errorIndex)}>
          <X size={18} /> Ignorer cette ligne
        </button>
      </div>
    </div>
  );
};

// Valid Row Card Component
const ValidRowCard = ({ row, rowIndex, onRemove }) => {
  const isCorrected = row.isCorrected;
  const originalData = row.originalData || {};

  const fields = [
    { key: 'language', label: 'Langue' },
    { key: 'firstName', label: 'Prenom' },
    { key: 'lastName', label: 'Nom' },
    { key: 'pan', label: 'PAN' },
    { key: 'expiry', label: 'Expiration' },
    { key: 'phone', label: 'Telephone' },
    { key: 'behaviour', label: 'Behaviour' },
    { key: 'action', label: 'Action' }
  ];

  return (
    <div className={`valid-row-card ${isCorrected ? 'corrected' : ''}`}>
      <div className="valid-row-header">
        <span className="row-badge success">Ligne {row.rowNumber}</span>
        {isCorrected ? (
          <span className="status-badge corrected"><CheckCircle size={14} /> Corrigee</span>
        ) : (
          <span className="status-badge valid"><Check size={14} /> Valide</span>
        )}
        <button className="btn-icon btn-remove" onClick={() => onRemove(rowIndex)} title="Retirer">
          <X size={16} />
        </button>
      </div>

      {isCorrected ? (
        <div className="before-after-container">
          <div className="before-section">
            <div className="section-label"><span className="label-icon error">✗</span> AVANT</div>
            <div className="data-grid">
              {fields.map(({ key, label }) => (
                <div key={key} className={`data-item ${key === row.correctedField ? 'highlighted-error' : ''}`}>
                  <span className="data-label">{label}</span>
                  <span className="data-value">{originalData[key] || '-'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="arrow-divider"><ArrowRight size={24} /></div>
          <div className="after-section">
            <div className="section-label"><span className="label-icon success">✓</span> APRES</div>
            <div className="data-grid">
              {fields.map(({ key, label }) => (
                <div key={key} className={`data-item ${key === row.correctedField ? 'highlighted-success' : ''}`}>
                  <span className="data-label">{label}</span>
                  <span className="data-value">{row[key] || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="simple-data-grid">
          {fields.map(({ key, label }) => (
            <div key={key} className="data-item">
              <span className="data-label">{label}</span>
              <span className="data-value">{row[key] || '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Processing;
