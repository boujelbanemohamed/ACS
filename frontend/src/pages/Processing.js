import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api, { banksAPI, processingAPI } from '../services/api';
import { Upload, Link as LinkIcon, PlayCircle, Download, RefreshCw, AlertTriangle, CheckCircle, X, Check, FileText, Send, ArrowRight, PenLine, Plus, Trash2, Globe } from 'lucide-react';
import './Processing.css';

const Processing = () => {
  const { user } = useAuth();
  const [banks, setBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://175.0.2.15/ACS');
  const [processing, setProcessing] = useState(false);
  const handleReset = () => {
    setValidRows([]);
    setErrors([]);
    setStats(null);
    setResult(null);
    setManualEntries([]);
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
    showNotification('Formulaire reinitialise');
  };

  const handleApiCall = async () => {
    if (!apiConfig.url || !selectedBank) {
      alert('Veuillez renseigner l\'URL de l\'API et selectionner une banque');
      return;
    }

    setApiLoading(true);
    setApiResponse(null);

    try {
      const response = await processingAPI.callExternalApi({
        bankId: selectedBank,
        url: apiConfig.url,
        method: apiConfig.method,
        headers: apiConfig.headers ? JSON.parse(apiConfig.headers) : {},
        body: apiConfig.body ? JSON.parse(apiConfig.body) : null,
        authType: apiConfig.authType,
        authToken: apiConfig.authToken,
        dataPath: apiConfig.dataPath
      });

      if (response.data.success) {
        setApiResponse({
          success: true,
          statusCode: 200,
          dataCount: response.data.data?.validRows?.length || 0
        });
        
        if (response.data.data?.validRows) {
          setValidRows(response.data.data.validRows);
        }
        if (response.data.data?.errors) {
          setErrors(response.data.data.errors);
        }
        if (response.data.data?.stats) {
          setStats(response.data.data.stats);
        }
        
        showNotification('API appelee avec succes ! ' + (response.data.data?.validRows?.length || 0) + ' enregistrements recuperes.');
      } else {
        setApiResponse({
          success: false,
          error: response.data.message || 'Erreur lors de l\'appel API'
        });
      }
    } catch (error) {
      console.error('API call error:', error);
      setApiResponse({
        success: false,
        statusCode: error.response?.status,
        error: error.response?.data?.message || error.message || 'Erreur lors de l\'appel API'
      });
    } finally {
      setApiLoading(false);
    }
  };

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
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'url', 'manual', 'api'
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
  const [apiConfig, setApiConfig] = useState({
    url: '',
    method: 'GET',
    headers: '',
    body: '',
    authType: 'none',
    authToken: '',
    dataPath: ''
  });
  const [apiResponse, setApiResponse] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [apiKeyForm, setApiKeyForm] = useState({ name: '', institution: '', bankId: '', expiresAt: '' });
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);
  const [apiKeyStats, setApiKeyStats] = useState(null);
  const [manualFormErrors, setManualFormErrors] = useState({});

  useEffect(() => {
    fetchBanks();
  }, []);

  // Auto-select bank for bank users
  useEffect(() => {
    if (user?.role === 'bank' && user?.bank_id && banks.length > 0) {
      setSelectedBank(user.bank_id.toString());
    }
  }, [user, banks]);

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

  const fetchApiKeys = async () => {
    try {
      const response = await api.get('/api-keys');
      setApiKeys(response.data.data || []);
    } catch (error) {
      console.error('Error fetching API keys:', error);
    }
  };

  const fetchApiKeyStats = async () => {
    try {
      const response = await api.get('/api-keys/stats');
      setApiKeyStats(response.data.data);
    } catch (error) {
      console.error('Error fetching API key stats:', error);
    }
  };

  const handleCreateApiKey = async () => {
    if (!apiKeyForm.name) {
      alert('Veuillez saisir un nom pour la cle API');
      return;
    }
    try {
      const response = await api.post('/api-keys', {
        name: apiKeyForm.name,
        institution: apiKeyForm.institution,
        bankId: apiKeyForm.bankId || null,
        expiresAt: apiKeyForm.expiresAt || null
      });
      if (response.data.success) {
        setNewlyCreatedKey(response.data.data.api_key);
        setApiKeyForm({ name: '', institution: '', bankId: '', expiresAt: '' });
        fetchApiKeys();
        showNotification('Cle API creee avec succes!');
      }
    } catch (error) {
      alert('Erreur: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleToggleApiKey = async (id, isActive) => {
    try {
      await api.put('/api-keys/' + id, { isActive: !isActive });
      fetchApiKeys();
      showNotification('Cle API ' + (isActive ? 'desactivee' : 'activee'));
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  };

  const handleDeleteApiKey = async (id) => {
    if (!window.confirm('Supprimer cette cle API ?')) return;
    try {
      await api.delete('/api-keys/' + id);
      fetchApiKeys();
      showNotification('Cle API supprimee');
    } catch (error) {
      alert('Erreur: ' + error.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showNotification('Copie dans le presse-papier!');
  };

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
    if (!selectedBank || validRows.length === 0) {
      alert('Veuillez selectionner une banque et avoir des lignes valides');
      return;
    }
    
    setProcessing(true);
    try {
      const response = await processingAPI.processManualEntries({
        bankId: selectedBank,
        entries: validRows.map(row => ({
          language: row.language || 'fr',
          firstName: row.firstName || row.first_name || '',
          lastName: row.lastName || row.last_name || '',
          pan: row.pan || '',
          expiry: row.expiry || '',
          phone: row.phone || '',
          behaviour: row.behaviour || 'otp',
          action: row.action || 'update'
        }))
      });
      
      if (response.data.success) {
        showNotification('Traitement reussi ! ' + validRows.length + ' lignes traitees. XML genere.');
        setValidRows([]);
        setErrors([]);
        setStats(null);
      } else {
        alert('Erreur: ' + (response.data.message || 'Erreur inconnue'));
      }
    } catch (error) {
      console.error('Final process error:', error);
      alert('Erreur lors du traitement: ' + (error.response?.data?.message || error.message));
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
        <button 
          className={`tab-btn ${activeTab === 'api' ? 'active' : ''}`}
          onClick={() => setActiveTab('api')}
        >
          <Globe size={18} /> API Externe
        </button>
        <button 
          className={`tab-btn ${activeTab === 'api-internal' ? 'active' : ''}`}
          onClick={() => setActiveTab('api-internal')}
        >
          <FileText size={18} /> API Interne
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
              <button type="button" className="btn btn-secondary" onClick={handleReset} style={{marginLeft: '10px'}}>
                <RefreshCw size={18} /> Reinitialiser
              </button>
            </form>
            
            <div className="doc-section">
              <h4>📋 Guide d'utilisation</h4>
              <div className="steps-guide">
                <div className="step-item"><span className="step-number">1</span> Selectionnez la banque concernee dans la liste deroulante ci-dessus</div>
                <div className="step-item"><span className="step-number">2</span> Cliquez sur "Choisir un fichier" et selectionnez votre fichier CSV</div>
                <div className="step-item"><span className="step-number">3</span> Cliquez sur "Uploader et traiter" pour lancer le traitement</div>
                <div className="step-item"><span className="step-number">4</span> Corrigez les erreurs eventuelles et validez</div>
                <div className="step-item"><span className="step-number">5</span> Le fichier XML sera genere automatiquement</div>
              </div>
              
              <h4>📄 Format du fichier CSV requis</h4>
              <div className="format-info">
                <p><strong>Encodage :</strong> UTF-8 | <strong>Separateur :</strong> Point-virgule (;) | <strong>Extension :</strong> .csv</p>
                <table className="format-table">
                  <thead>
                    <tr><th>Colonne</th><th>Description</th><th>Obligatoire</th><th>Exemple</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>language</td><td>Code langue (fr, en, ar)</td><td>Non</td><td>fr</td></tr>
                    <tr><td>first_name</td><td>Prenom du porteur</td><td>Non</td><td>Mohamed</td></tr>
                    <tr><td>last_name</td><td>Nom du porteur</td><td>Non</td><td>Ben Ali</td></tr>
                    <tr><td>pan</td><td>Numero de carte (13-19 chiffres)</td><td><strong>Oui</strong></td><td>4111111111111111</td></tr>
                    <tr><td>expiry</td><td>Date d'expiration (MM/YY)</td><td><strong>Oui</strong></td><td>12/25</td></tr>
                    <tr><td>phone</td><td>Telephone avec indicatif</td><td><strong>Oui</strong></td><td>+21612345678</td></tr>
                    <tr><td>behaviour</td><td>Comportement OTP</td><td>Non</td><td>otp</td></tr>
                    <tr><td>action</td><td>Action (update, add, delete)</td><td>Non</td><td>update</td></tr>
                  </tbody>
                </table>
                <div className="example-csv">
                  <strong>Exemple de fichier :</strong>
                  <pre>{`language;first_name;last_name;pan;expiry;phone;behaviour;action
fr;Mohamed;Ben Ali;4111111111111111;12/25;+21612345678;otp;update
fr;Ahmed;Trabelsi;4222222222222222;06/26;+21698765432;otp;update`}</pre>
                </div>
              </div>
            </div>
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
            
            <div className="doc-section">
              <h4>📋 Guide d'utilisation</h4>
              <div className="steps-guide">
                <div className="step-item"><span className="step-number">1</span> Selectionnez la banque concernee</div>
                <div className="step-item"><span className="step-number">2</span> L'URL du dossier source est configuree dans les parametres de la banque</div>
                <div className="step-item"><span className="step-number">3</span> Cliquez sur "Lancer le traitement" pour analyser le dossier</div>
                <div className="step-item"><span className="step-number">4</span> Les fichiers CSV trouves seront traites automatiquement</div>
                <div className="step-item"><span className="step-number">5</span> Les fichiers traites seront deplaces vers le dossier d'archive</div>
              </div>
              
              <h4>🔗 Configuration des URLs</h4>
              <div className="format-info">
                <p><strong>URL Source :</strong> Chemin vers le dossier contenant les fichiers CSV a traiter</p>
                <p><strong>URL Destination :</strong> Chemin vers le dossier de sortie des fichiers valides</p>
                <p><strong>URL Archive :</strong> Chemin vers le dossier d'archivage des fichiers traites</p>
                <p><strong>Note :</strong> Ces URLs sont configurees dans la page "Banques" pour chaque etablissement</p>
              </div>
            </div>
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
                    <button type="button" className="btn btn-secondary" onClick={handleReset} style={{marginLeft: '10px'}}>
                      <RefreshCw size={18} /> Reinitialiser
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
            
            <div className="doc-section">
              <h4>📋 Guide d'utilisation</h4>
              <div className="steps-guide">
                <div className="step-item"><span className="step-number">1</span> Selectionnez la banque concernee</div>
                <div className="step-item"><span className="step-number">2</span> Remplissez le formulaire avec les informations de la carte</div>
                <div className="step-item"><span className="step-number">3</span> Cliquez sur "Ajouter" pour ajouter l'entree a la liste</div>
                <div className="step-item"><span className="step-number">4</span> Repetez pour ajouter plusieurs cartes</div>
                <div className="step-item"><span className="step-number">5</span> Cliquez sur "Traiter et Generer CSV/XML" pour finaliser</div>
              </div>
              
              <h4>📝 Description des champs</h4>
              <div className="format-info">
                <table className="format-table">
                  <thead>
                    <tr><th>Champ</th><th>Description</th><th>Obligatoire</th><th>Format</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Langue</td><td>Langue de communication SMS</td><td>Non</td><td>fr, en, ar</td></tr>
                    <tr><td>Prenom</td><td>Prenom du porteur</td><td>Non</td><td>Texte</td></tr>
                    <tr><td>Nom</td><td>Nom du porteur</td><td>Non</td><td>Texte</td></tr>
                    <tr><td>PAN</td><td>Numero de carte bancaire</td><td><strong>Oui</strong></td><td>13-19 chiffres</td></tr>
                    <tr><td>Expiration</td><td>Date d'expiration carte</td><td><strong>Oui</strong></td><td>MM/YY</td></tr>
                    <tr><td>Telephone</td><td>Numero pour recevoir OTP</td><td><strong>Oui</strong></td><td>+216XXXXXXXX</td></tr>
                    <tr><td>Comportement</td><td>Mode d'authentification</td><td>Non</td><td>OTP SMS</td></tr>
                    <tr><td>Action</td><td>Type d'operation</td><td>Non</td><td>update, add, delete</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Section (for Upload and URL tabs) */}
      {activeTab === 'api' && (
          <div className="api-section">
            <div className="section-card">
              <h3><Globe size={20} /> Configuration API Externe</h3>
              
              <div className="doc-section">
                <h4>📋 Guide d'utilisation</h4>
                <div className="steps-guide">
                  <div className="step-item"><span className="step-number">1</span> Selectionnez la banque concernee</div>
                  <div className="step-item"><span className="step-number">2</span> Entrez l'URL de l'API externe a consommer</div>
                  <div className="step-item"><span className="step-number">3</span> Configurez la methode HTTP (GET/POST)</div>
                  <div className="step-item"><span className="step-number">4</span> Ajoutez l'authentification si necessaire</div>
                  <div className="step-item"><span className="step-number">5</span> Specifiez le chemin des donnees dans la reponse JSON</div>
                  <div className="step-item"><span className="step-number">6</span> Cliquez sur "Appeler l'API" pour recuperer les donnees</div>
                </div>
                
                <h4>🔧 Configuration</h4>
                <div className="format-info">
                  <table className="format-table">
                    <thead>
                      <tr><th>Parametre</th><th>Description</th><th>Exemple</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>URL</td><td>Endpoint de l'API</td><td>https://api.banque.com/cards</td></tr>
                      <tr><td>Methode</td><td>GET, POST, PUT</td><td>GET</td></tr>
                      <tr><td>Auth</td><td>Type d'authentification</td><td>Bearer Token, API Key</td></tr>
                      <tr><td>Chemin</td><td>Chemin JSON des donnees</td><td>data.records</td></tr>
                    </tbody>
                  </table>
                  <p><strong>Mapping automatique :</strong> Les champs pan, phone, firstName, lastName, expiry sont mappes automatiquement depuis la reponse JSON.</p>
                </div>
              </div>
              
              <div className="form-group">
                <label>URL de l'API *</label>
                <input
                  type="text"
                  placeholder="https://api.example.com/cards"
                  value={apiConfig.url}
                  onChange={(e) => setApiConfig({...apiConfig, url: e.target.value})}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Methode HTTP</label>
                  <select 
                    value={apiConfig.method}
                    onChange={(e) => setApiConfig({...apiConfig, method: e.target.value})}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Authentification</label>
                  <select 
                    value={apiConfig.authType}
                    onChange={(e) => setApiConfig({...apiConfig, authType: e.target.value})}
                  >
                    <option value="none">Aucune</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                    <option value="apikey">API Key</option>
                  </select>
                </div>
              </div>

              {apiConfig.authType !== 'none' && (
                <div className="form-group">
                  <label>Token / Credentials</label>
                  <input
                    type="password"
                    placeholder={apiConfig.authType === 'bearer' ? 'Bearer token...' : apiConfig.authType === 'basic' ? 'username:password' : 'API Key...'}
                    value={apiConfig.authToken}
                    onChange={(e) => setApiConfig({...apiConfig, authToken: e.target.value})}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Headers personnalises (JSON)</label>
                <textarea
                  placeholder='{"Content-Type": "application/json"}'
                  value={apiConfig.headers}
                  onChange={(e) => setApiConfig({...apiConfig, headers: e.target.value})}
                  rows={3}
                />
              </div>

              {(apiConfig.method === 'POST' || apiConfig.method === 'PUT') && (
                <div className="form-group">
                  <label>Corps de la requete (JSON)</label>
                  <textarea
                    placeholder='{"filter": "active"}'
                    value={apiConfig.body}
                    onChange={(e) => setApiConfig({...apiConfig, body: e.target.value})}
                    rows={4}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Chemin des donnees (ex: data.records ou results)</label>
                <input
                  type="text"
                  placeholder="data.records"
                  value={apiConfig.dataPath}
                  onChange={(e) => setApiConfig({...apiConfig, dataPath: e.target.value})}
                />
                <small>Laissez vide si les donnees sont a la racine de la reponse</small>
              </div>

              <div className="form-group">
                <label>Banque *</label>
                <select 
                  value={selectedBank} 
                  onChange={(e) => setSelectedBank(e.target.value)}
                >
                  <option value="">Selectionnez une banque</option>
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>{bank.name} ({bank.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-actions">
                <button 
                  className="btn btn-primary"
                  onClick={handleApiCall}
                  disabled={apiLoading || !apiConfig.url || !selectedBank}
                >
                  {apiLoading ? <><RefreshCw size={18} className="spin" /> Appel en cours...</> : <><Globe size={18} /> Appeler l'API</>}
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    setApiConfig({
                      url: '',
                      method: 'GET',
                      headers: '',
                      body: '',
                      authType: 'none',
                      authToken: '',
                      dataPath: ''
                    });
                    setApiResponse(null);
                    setValidRows([]);
                    setErrors([]);
                  }}
                >
                  <RefreshCw size={18} /> Reinitialiser
                </button>
              </div>
            </div>

            {apiResponse && (
              <div className="section-card api-response">
                <h3><FileText size={20} /> Reponse API</h3>
                <div className="api-response-info">
                  <span className={'api-status ' + (apiResponse.success ? 'success' : 'error')}>
                    Status: {apiResponse.statusCode || 'N/A'}
                  </span>
                  <span>Donnees recues: {apiResponse.dataCount || 0} enregistrements</span>
                </div>
                {apiResponse.error && (
                  <div className="api-error">{apiResponse.error}</div>
                )}
              </div>
            )}
          </div>
        )}

      {activeTab === 'api-internal' && (
        <div className="api-internal-section">
          <div className="section-card">
            <h3><FileText size={20} /> Documentation API</h3>
            <p>Votre API est accessible à l'adresse : <code>http://localhost:8000/api/v1</code></p>
            
            <div className="api-docs">
              <h4>Endpoints disponibles :</h4>
              <div className="endpoint-list">
                <div className="endpoint">
                  <span className="method get">GET</span>
                  <span className="path">/api/v1/banks</span>
                  <span className="desc">Liste des banques</span>
                </div>
                <div className="endpoint">
                  <span className="method post">POST</span>
                  <span className="path">/api/v1/cards/validate</span>
                  <span className="desc">Valider des cartes</span>
                </div>
                <div className="endpoint">
                  <span className="method post">POST</span>
                  <span className="path">/api/v1/cards/register</span>
                  <span className="desc">Enregistrer des cartes + XML</span>
                </div>
                <div className="endpoint">
                  <span className="method get">GET</span>
                  <span className="path">/api/v1/status/:id</span>
                  <span className="desc">Statut d'un traitement</span>
                </div>
                <div className="endpoint">
                  <span className="method get">GET</span>
                  <span className="path">/api/v1/docs</span>
                  <span className="desc">Documentation JSON</span>
                </div>
              </div>

              <h4>Exemple d'appel :</h4>
              <pre className="code-block">{`curl -X POST http://localhost:8000/api/v1/cards/register \
  -H "X-API-Key: votre_cle_api" \
  -H "Content-Type: application/json" \
  -d '{
    "bankCode": "BT",
    "cards": [
      {
        "pan": "4111111111111111",
        "phone": "+21612345678",
        "expiry": "12/25",
        "firstName": "Mohamed",
        "lastName": "Ben Ali"
      }
    ]
  }'`}</pre>
            </div>
          </div>

          <div className="section-card">
            <div className="card-header">
              <h3><CheckCircle size={20} /> Cles API</h3>
              <button className="btn btn-primary btn-sm" onClick={() => { setShowNewKeyModal(true); fetchApiKeys(); }}>
                <Plus size={16} /> Nouvelle Cle
              </button>
            </div>

            {apiKeyStats && (
              <div className="api-stats-mini">
                <span><strong>{apiKeyStats.active_keys || 0}</strong> cles actives</span>
                <span><strong>{apiKeyStats.calls_today || 0}</strong> appels aujourd'hui</span>
                <span><strong>{apiKeyStats.total_api_calls || 0}</strong> appels total</span>
              </div>
            )}

            <div className="api-keys-list">
              {apiKeys.length === 0 ? (
                <p className="no-data">Aucune cle API. Cliquez sur "Nouvelle Cle" pour en creer une.</p>
              ) : (
                apiKeys.map(key => (
                  <div key={key.id} className={'api-key-item ' + (key.is_active ? 'active' : 'inactive')}>
                    <div className="api-key-info">
                      <span className="api-key-name">{key.name}</span>
                      <span className="api-key-institution">{key.institution || 'N/A'}</span>
                      <code className="api-key-value">{key.api_key.substring(0, 20)}...</code>
                      <button className="btn-icon" onClick={() => copyToClipboard(key.api_key)} title="Copier">
                        <FileText size={14} />
                      </button>
                    </div>
                    <div className="api-key-meta">
                      <span className={'status-badge ' + (key.is_active ? 'success' : 'error')}>
                        {key.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span>{key.calls_today || 0} appels/jour</span>
                      <button className="btn-icon" onClick={() => handleToggleApiKey(key.id, key.is_active)}>
                        {key.is_active ? <X size={14} /> : <Check size={14} />}
                      </button>
                      <button className="btn-icon btn-danger" onClick={() => handleDeleteApiKey(key.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {showNewKeyModal && (
            <div className="modal-overlay" onClick={() => setShowNewKeyModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Creer une nouvelle cle API</h3>
                
                {newlyCreatedKey ? (
                  <div className="new-key-display">
                    <p><strong>Votre nouvelle cle API :</strong></p>
                    <code className="full-api-key">{newlyCreatedKey}</code>
                    <button className="btn btn-primary" onClick={() => copyToClipboard(newlyCreatedKey)}>
                      Copier la cle
                    </button>
                    <p className="warning-text">
                      <AlertTriangle size={16} /> Conservez cette cle en securite. Elle ne sera plus affichee.
                    </p>
                    <button className="btn btn-secondary" onClick={() => { setShowNewKeyModal(false); setNewlyCreatedKey(null); }}>
                      Fermer
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Nom *</label>
                      <input
                        type="text"
                        placeholder="Ex: API Production Client X"
                        value={apiKeyForm.name}
                        onChange={(e) => setApiKeyForm({...apiKeyForm, name: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Institution</label>
                      <input
                        type="text"
                        placeholder="Ex: Banque XYZ"
                        value={apiKeyForm.institution}
                        onChange={(e) => setApiKeyForm({...apiKeyForm, institution: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Banque associee</label>
                      <select
                        value={apiKeyForm.bankId}
                        onChange={(e) => setApiKeyForm({...apiKeyForm, bankId: e.target.value})}
                      >
                        <option value="">Toutes les banques</option>
                        {banks.map(bank => (
                          <option key={bank.id} value={bank.id}>{bank.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date d'expiration</label>
                      <input
                        type="date"
                        value={apiKeyForm.expiresAt}
                        onChange={(e) => setApiKeyForm({...apiKeyForm, expiresAt: e.target.value})}
                      />
                    </div>
                    <div className="modal-actions">
                      <button className="btn btn-secondary" onClick={() => setShowNewKeyModal(false)}>Annuler</button>
                      <button className="btn btn-primary" onClick={handleCreateApiKey}>Creer la cle</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {result && activeTab !== 'manual' && activeTab !== 'api' && activeTab !== 'api-internal' && (
        <div className="result-section">
          <div className={`result-header ${errors.length === 0 ? 'success' : 'error'}`}>
            {errors.length === 0 ? <CheckCircle size={32} /> : <AlertTriangle size={32} />}
            <h2>{errors.length === 0 ? 'Toutes les lignes sont valides !' : `${errors.length} erreur(s) a corriger`}</h2>
          </div>

{stats && (
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
          )}

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
