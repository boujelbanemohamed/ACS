class CSVValidator {
  constructor() {
    // Expected CSV structure based on the provided example
    this.requiredFields = [
      'language',
      'firstName',
      'lastName',
      'pan',
      'expiry',
      'phone',
      'behaviour',
      'action'
    ];

    this.validLanguages = ['fr', 'en', 'ar'];
    this.validBehaviours = ['otp', 'sms', 'email'];
    this.validActions = ['update', 'create', 'delete'];
  }

  /**
   * Validate CSV header structure
   */
  validateHeader(headers) {
    const errors = [];
    const cleanHeaders = headers.map(h => h.trim()).filter(h => h !== '');

    // Check for required fields
    for (const field of this.requiredFields) {
      if (!cleanHeaders.includes(field)) {
        errors.push({
          field: 'header',
          error: `Champ requis manquant: ${field}`,
          severity: 'error'
        });
      }
    }

    // Check for unexpected fields
    const unexpectedFields = cleanHeaders.filter(
      h => !this.requiredFields.includes(h)
    );

    if (unexpectedFields.length > 0) {
      errors.push({
        field: 'header',
        error: `Champs inattendus trouvés: ${unexpectedFields.join(', ')}`,
        severity: 'warning'
      });
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors
    };
  }

  /**
   * Validate a single row of data
   */
  validateRow(row, rowNumber) {
    const errors = [];

    // Validate language
    if (!row.language || row.language.trim() === '') {
      errors.push({
        rowNumber,
        field: 'language',
        value: row.language,
        error: 'Le champ language est requis',
        severity: 'error'
      });
    } else if (!this.validLanguages.includes(row.language.toLowerCase())) {
      errors.push({
        rowNumber,
        field: 'language',
        value: row.language,
        error: `Language invalide. Valeurs acceptées: ${this.validLanguages.join(', ')}`,
        severity: 'error'
      });
    }

    // Validate firstName
    if (!row.firstName || row.firstName.trim() === '') {
      errors.push({
        rowNumber,
        field: 'firstName',
        value: row.firstName,
        error: 'Le champ firstName est requis',
        severity: 'error'
      });
    } else if (row.firstName.length < 2 || row.firstName.length > 255) {
      errors.push({
        rowNumber,
        field: 'firstName',
        value: row.firstName,
        error: 'firstName doit contenir entre 2 et 255 caractères',
        severity: 'error'
      });
    }

    // Validate lastName
    if (!row.lastName || row.lastName.trim() === '') {
      errors.push({
        rowNumber,
        field: 'lastName',
        value: row.lastName,
        error: 'Le champ lastName est requis',
        severity: 'error'
      });
    } else if (row.lastName.length < 2 || row.lastName.length > 255) {
      errors.push({
        rowNumber,
        field: 'lastName',
        value: row.lastName,
        error: 'lastName doit contenir entre 2 et 255 caractères',
        severity: 'error'
      });
    }

    // Validate PAN (Primary Account Number)
    if (!row.pan || row.pan.trim() === '') {
      errors.push({
        rowNumber,
        field: 'pan',
        value: row.pan,
        error: 'Le champ PAN est requis',
        severity: 'error'
      });
    } else {
      const panClean = row.pan.replace(/\s/g, '');
      if (!/^\d{16}$/.test(panClean)) {
        errors.push({
          rowNumber,
          field: 'pan',
          value: row.pan,
          error: 'PAN doit contenir exactement 16 chiffres',
          severity: 'error'
        });
      } else if (!this.luhnCheck(panClean)) {
        errors.push({
          rowNumber,
          field: 'pan',
          value: row.pan,
          error: 'PAN invalide (échec de la validation Luhn)',
          severity: 'warning'
        });
      }
    }

    // Validate expiry date (format: YYYYMM)
    if (!row.expiry || row.expiry.trim() === '') {
      errors.push({
        rowNumber,
        field: 'expiry',
        value: row.expiry,
        error: 'Le champ expiry est requis',
        severity: 'error'
      });
    } else if (!/^\d{6}$/.test(row.expiry)) {
      errors.push({
        rowNumber,
        field: 'expiry',
        value: row.expiry,
        error: 'Format expiry invalide. Format attendu: YYYYMM (ex: 202411)',
        severity: 'error'
      });
    } else {
      const year = parseInt(row.expiry.substring(0, 4));
      const month = parseInt(row.expiry.substring(4, 6));
      
      if (year < 2024 || year > 2050) {
        errors.push({
          rowNumber,
          field: 'expiry',
          value: row.expiry,
          error: 'Année d\'expiration invalide (doit être entre 2024 et 2050)',
          severity: 'error'
        });
      }
      
      if (month < 1 || month > 12) {
        errors.push({
          rowNumber,
          field: 'expiry',
          value: row.expiry,
          error: 'Mois d\'expiration invalide (doit être entre 01 et 12)',
          severity: 'error'
        });
      }

      // Check if card is expired
      const expiryDate = new Date(year, month - 1);
      const currentDate = new Date();
      if (expiryDate < currentDate) {
        errors.push({
          rowNumber,
          field: 'expiry',
          value: row.expiry,
          error: 'La carte est expirée',
          severity: 'warning'
        });
      }
    }

    // Validate phone number (Tunisian format)
    if (!row.phone || row.phone.trim() === '') {
      errors.push({
        rowNumber,
        field: 'phone',
        value: row.phone,
        error: 'Le champ phone est requis',
        severity: 'error'
      });
    } else {
      const phoneClean = row.phone.replace(/\s/g, '');
      // Tunisian phone format: 216XXXXXXXX (11 digits)
      if (!/^216\d{8}$/.test(phoneClean)) {
        errors.push({
          rowNumber,
          field: 'phone',
          value: row.phone,
          error: 'Format téléphone invalide. Format attendu: 216XXXXXXXX (ex: 21624080852)',
          severity: 'error'
        });
      }
    }

    // Validate behaviour
    if (!row.behaviour || row.behaviour.trim() === '') {
      errors.push({
        rowNumber,
        field: 'behaviour',
        value: row.behaviour,
        error: 'Le champ behaviour est requis',
        severity: 'error'
      });
    } else if (!this.validBehaviours.includes(row.behaviour.toLowerCase())) {
      errors.push({
        rowNumber,
        field: 'behaviour',
        value: row.behaviour,
        error: `Behaviour invalide. Valeurs acceptées: ${this.validBehaviours.join(', ')}`,
        severity: 'error'
      });
    }

    // Validate action
    if (!row.action || row.action.trim() === '') {
      errors.push({
        rowNumber,
        field: 'action',
        value: row.action,
        error: 'Le champ action est requis',
        severity: 'error'
      });
    } else if (!this.validActions.includes(row.action.toLowerCase())) {
      errors.push({
        rowNumber,
        field: 'action',
        value: row.action,
        error: `Action invalide. Valeurs acceptées: ${this.validActions.join(', ')}`,
        severity: 'error'
      });
    }

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors
    };
  }

  /**
   * Luhn algorithm for PAN validation
   */
  luhnCheck(pan) {
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
   * Check if row is duplicate
   */
  isDuplicateKey(row1, row2) {
    return (
      row1.pan === row2.pan &&
      row1.expiry === row2.expiry &&
      row1.phone === row2.phone
    );
  }
}

module.exports = CSVValidator;
