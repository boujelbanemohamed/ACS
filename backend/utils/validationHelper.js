/**
 * Helper pour générer les résultats de validation compatibles avec l'historique
 * Utilisé par csvProcessor pour enregistrer chaque tentative
 */

const FIELD_EXPECTATIONS = {
  language: { format: 'fr, en, ar', description: 'Code langue' },
  firstName: { format: '2-255 caractères', description: 'Prénom' },
  lastName: { format: '2-255 caractères', description: 'Nom' },
  pan: { format: '16 chiffres (Luhn valide)', description: 'Numéro de carte' },
  expiry: { format: 'YYYYMM (non expiré)', description: 'Date d\'expiration' },
  phone: { format: '216XXXXXXXX (11 chiffres)', description: 'Numéro de téléphone' },
  behaviour: { format: 'otp, sms, email', description: 'Comportement' },
  action: { format: 'update, create, delete', description: 'Action' }
};

/**
 * Génère un résultat de validation pour un champ
 */
function createFieldValidation(field, value, isValid, errorType = null, errorMessage = null, severity = 'error') {
  return {
    field,
    value: value || '',
    expectedFormat: FIELD_EXPECTATIONS[field]?.format || '',
    isValid,
    errorType,
    errorMessage,
    severity
  };
}

/**
 * Valide une ligne complète et retourne les résultats de validation pour chaque champ
 */
function validateRowForHistory(row) {
  const results = [];
  
  // Language
  const validLanguages = ['fr', 'en', 'ar'];
  const languageValid = row.language && validLanguages.includes(row.language.toLowerCase());
  results.push(createFieldValidation(
    'language',
    row.language,
    languageValid,
    !languageValid ? 'INVALID' : null,
    !languageValid ? `Valeur "${row.language}" non reconnue. Attendu: fr, en, ar` : null
  ));
  
  // FirstName
  const firstNameValid = row.firstName && row.firstName.trim().length >= 2 && row.firstName.trim().length <= 255;
  results.push(createFieldValidation(
    'firstName',
    row.firstName,
    firstNameValid,
    !row.firstName ? 'MISSING' : !firstNameValid ? 'FORMAT' : null,
    !row.firstName ? 'Prénom requis' : !firstNameValid ? 'Prénom doit contenir 2-255 caractères' : null
  ));
  
  // LastName
  const lastNameValid = row.lastName && row.lastName.trim().length >= 2 && row.lastName.trim().length <= 255;
  results.push(createFieldValidation(
    'lastName',
    row.lastName,
    lastNameValid,
    !row.lastName ? 'MISSING' : !lastNameValid ? 'FORMAT' : null,
    !row.lastName ? 'Nom requis' : !lastNameValid ? 'Nom doit contenir 2-255 caractères' : null
  ));
  
  // PAN
  let panValid = false;
  let panError = null;
  let panErrorType = null;
  const panClean = (row.pan || '').replace(/\s/g, '');
  
  if (!panClean) {
    panError = 'PAN requis';
    panErrorType = 'MISSING';
  } else if (!/^\d+$/.test(panClean)) {
    panError = 'PAN doit contenir uniquement des chiffres';
    panErrorType = 'FORMAT';
  } else if (panClean.length !== 16) {
    panError = `PAN contient ${panClean.length} chiffres au lieu de 16`;
    panErrorType = 'FORMAT';
  } else if (!luhnCheck(panClean)) {
    panError = 'PAN invalide (échec validation Luhn)';
    panErrorType = 'INVALID';
  } else {
    panValid = true;
  }
  results.push(createFieldValidation('pan', row.pan, panValid, panErrorType, panError));
  
  // Expiry
  let expiryValid = false;
  let expiryError = null;
  let expiryErrorType = null;
  const expiry = row.expiry || '';
  
  if (!expiry) {
    expiryError = 'Date d\'expiration requise';
    expiryErrorType = 'MISSING';
  } else if (!/^\d{6}$/.test(expiry)) {
    expiryError = `Format invalide "${expiry}". Attendu: YYYYMM (ex: 202612)`;
    expiryErrorType = 'FORMAT';
  } else {
    const year = parseInt(expiry.substring(0, 4));
    const month = parseInt(expiry.substring(4, 6));
    
    if (month < 1 || month > 12) {
      expiryError = `Mois invalide: ${month}. Doit être entre 01 et 12`;
      expiryErrorType = 'FORMAT';
    } else {
      const expiryDate = new Date(year, month - 1);
      const now = new Date();
      if (expiryDate < now) {
        expiryError = `Carte expirée depuis ${expiryDate.toLocaleDateString('fr-FR')}`;
        expiryErrorType = 'EXPIRED';
      } else {
        expiryValid = true;
      }
    }
  }
  results.push(createFieldValidation('expiry', row.expiry, expiryValid, expiryErrorType, expiryError));
  
  // Phone
  let phoneValid = false;
  let phoneError = null;
  let phoneErrorType = null;
  const phoneClean = (row.phone || '').replace(/\s/g, '');
  
  if (!phoneClean) {
    phoneError = 'Numéro de téléphone requis';
    phoneErrorType = 'MISSING';
  } else if (!/^216\d{8}$/.test(phoneClean)) {
    if (phoneClean.length !== 11) {
      phoneError = `Numéro contient ${phoneClean.length} chiffres au lieu de 11 (216 + 8 chiffres)`;
    } else if (!phoneClean.startsWith('216')) {
      phoneError = `Numéro doit commencer par 216. Reçu: ${phoneClean.substring(0, 3)}`;
    } else {
      phoneError = `Format invalide "${phoneClean}". Attendu: 216XXXXXXXX`;
    }
    phoneErrorType = 'FORMAT';
  } else {
    phoneValid = true;
  }
  results.push(createFieldValidation('phone', row.phone, phoneValid, phoneErrorType, phoneError));
  
  // Behaviour
  const validBehaviours = ['otp', 'sms', 'email'];
  const behaviourValue = (row.behaviour || '').toLowerCase();
  const behaviourValid = behaviourValue && validBehaviours.includes(behaviourValue);
  results.push(createFieldValidation(
    'behaviour',
    row.behaviour,
    behaviourValid,
    !row.behaviour ? 'MISSING' : !behaviourValid ? 'INVALID' : null,
    !row.behaviour ? 'Comportement requis' : !behaviourValid ? `Valeur "${row.behaviour}" non reconnue. Attendu: otp, sms, email` : null
  ));
  
  // Action
  const validActions = ['update', 'create', 'delete'];
  const actionValue = (row.action || '').toLowerCase();
  const actionValid = actionValue && validActions.includes(actionValue);
  results.push(createFieldValidation(
    'action',
    row.action,
    actionValid,
    !row.action ? 'MISSING' : !actionValid ? 'INVALID' : null,
    !row.action ? 'Action requise' : !actionValid ? `Valeur "${row.action}" non reconnue. Attendu: update, create, delete` : null
  ));
  
  return {
    results,
    isValid: results.every(r => r.isValid),
    errorCount: results.filter(r => !r.isValid && r.severity === 'error').length,
    warningCount: results.filter(r => !r.isValid && r.severity === 'warning').length
  };
}

/**
 * Algorithme de Luhn pour validation PAN
 */
function luhnCheck(pan) {
  let sum = 0;
  let isEven = false;
  
  for (let i = pan.length - 1; i >= 0; i--) {
    let digit = parseInt(pan.charAt(i), 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * Vérifie si un PAN est un doublon
 */
async function checkDuplicate(db, bankId, pan) {
  const result = await db.query(
    'SELECT id FROM processed_records WHERE bank_id = $1 AND pan = $2',
    [bankId, pan]
  );
  return result.rows.length > 0;
}

module.exports = {
  createFieldValidation,
  validateRowForHistory,
  luhnCheck,
  checkDuplicate,
  FIELD_EXPECTATIONS
};
