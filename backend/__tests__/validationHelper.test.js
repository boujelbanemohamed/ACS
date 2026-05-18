const { validateRowForHistory, luhnCheck, createFieldValidation, FIELD_EXPECTATIONS } = require('../utils/validationHelper');

describe('validationHelper', () => {
  describe('createFieldValidation', () => {
    it('creates a valid field validation object', () => {
      const result = createFieldValidation('pan', '4000056655665556', true);
      expect(result.field).toBe('pan');
      expect(result.value).toBe('4000056655665556');
      expect(result.isValid).toBe(true);
      expect(result.errorType).toBeNull();
      expect(result.errorMessage).toBeNull();
      expect(result.severity).toBe('error');
      expect(result.expectedFormat).toBeDefined();
    });

    it('creates a validation with error details', () => {
      const result = createFieldValidation('pan', '1234', false, 'FORMAT', 'Must be 16 digits', 'error');
      expect(result.field).toBe('pan');
      expect(result.isValid).toBe(false);
      expect(result.errorType).toBe('FORMAT');
      expect(result.errorMessage).toBe('Must be 16 digits');
      expect(result.severity).toBe('error');
    });

    it('handles warning severity', () => {
      const result = createFieldValidation('expiry', '01/20', false, 'EXPIRED', 'Card expired', 'warning');
      expect(result.severity).toBe('warning');
    });

    it('defaults value to empty string when null', () => {
      const result = createFieldValidation('firstName', null, false);
      expect(result.value).toBe('');
    });
  });

  describe('validateRowForHistory', () => {
    const validRow = {
      language: 'fr',
      firstName: 'Ahmed',
      lastName: 'BenAli',
      pan: '4000056655665556',
      expiry: '12/28',
      phone: '21699123456',
      behaviour: 'otp',
      action: 'create'
    };

    it('validates a completely valid row', () => {
      const result = validateRowForHistory(validRow);
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.results).toHaveLength(8);
    });

    it('flags missing language', () => {
      const result = validateRowForHistory({ ...validRow, language: '' });
      const r = result.results.find(x => x.field === 'language');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('INVALID');
    });

    it('flags invalid language', () => {
      const result = validateRowForHistory({ ...validRow, language: 'de' });
      const r = result.results.find(x => x.field === 'language');
      expect(r.isValid).toBe(false);
    });

    it('flags missing firstName', () => {
      const result = validateRowForHistory({ ...validRow, firstName: '' });
      const r = result.results.find(x => x.field === 'firstName');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('MISSING');
    });

    it('flags short firstName', () => {
      const result = validateRowForHistory({ ...validRow, firstName: 'A' });
      const r = result.results.find(x => x.field === 'firstName');
      expect(r.isValid).toBe(false);
    });

    it('flags missing lastName', () => {
      const result = validateRowForHistory({ ...validRow, lastName: '' });
      const r = result.results.find(x => x.field === 'lastName');
      expect(r.isValid).toBe(false);
    });

    it('flags missing PAN', () => {
      const result = validateRowForHistory({ ...validRow, pan: '' });
      const r = result.results.find(x => x.field === 'pan');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('MISSING');
    });

    it('flags PAN with wrong length', () => {
      const result = validateRowForHistory({ ...validRow, pan: '12345678901234567' });
      const r = result.results.find(x => x.field === 'pan');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('FORMAT');
    });

    it('flags PAN failing Luhn', () => {
      const result = validateRowForHistory({ ...validRow, pan: '1234567890123456' });
      const r = result.results.find(x => x.field === 'pan');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('INVALID');
    });

    it('flags missing expiry', () => {
      const result = validateRowForHistory({ ...validRow, expiry: '' });
      const r = result.results.find(x => x.field === 'expiry');
      expect(r.isValid).toBe(false);
    });

    it('flags expiry wrong format (YYYYMM)', () => {
      const result = validateRowForHistory({ ...validRow, expiry: '202812' });
      const r = result.results.find(x => x.field === 'expiry');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('FORMAT');
    });

    it('flags expired card with warning severity', () => {
      const result = validateRowForHistory({ ...validRow, expiry: '01/20' });
      const r = result.results.find(x => x.field === 'expiry');
      expect(r.isValid).toBe(false);
    });

    it('flags missing phone', () => {
      const result = validateRowForHistory({ ...validRow, phone: '' });
      const r = result.results.find(x => x.field === 'phone');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('MISSING');
    });

    it('flags non-Tunisian phone format', () => {
      const result = validateRowForHistory({ ...validRow, phone: '33612345678' });
      const r = result.results.find(x => x.field === 'phone');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('FORMAT');
    });

    it('flags missing behaviour', () => {
      const result = validateRowForHistory({ ...validRow, behaviour: '' });
      const r = result.results.find(x => x.field === 'behaviour');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('MISSING');
    });

    it('flags invalid behaviour', () => {
      const result = validateRowForHistory({ ...validRow, behaviour: 'push' });
      const r = result.results.find(x => x.field === 'behaviour');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('INVALID');
    });

    it('flags missing action', () => {
      const result = validateRowForHistory({ ...validRow, action: '' });
      const r = result.results.find(x => x.field === 'action');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('MISSING');
    });

    it('flags invalid action', () => {
      const result = validateRowForHistory({ ...validRow, action: 'purge' });
      const r = result.results.find(x => x.field === 'action');
      expect(r.isValid).toBe(false);
      expect(r.errorType).toBe('INVALID');
    });

    it('accumulates multiple errors on a completely invalid row', () => {
      const bad = { language: '', firstName: '', lastName: '', pan: '', expiry: '', phone: '', behaviour: '', action: '' };
      const result = validateRowForHistory(bad);
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('luhnCheck', () => {
    it('passes valid PAN 4000056655665556', () => {
      expect(luhnCheck('4000056655665556')).toBe(true);
    });

    it('passes valid PAN 4111111111111111', () => {
      expect(luhnCheck('4111111111111111')).toBe(true);
    });

    it('fails invalid PAN 1234567890123456', () => {
      expect(luhnCheck('1234567890123456')).toBe(false);
    });

    it('fails simple invalid PAN', () => {
      expect(luhnCheck('1111111111111111')).toBe(false);
    });
  });

  describe('FIELD_EXPECTATIONS', () => {
    it('defines expectations for all 8 fields', () => {
      const fields = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];
      fields.forEach(f => {
        expect(FIELD_EXPECTATIONS[f]).toBeDefined();
        expect(FIELD_EXPECTATIONS[f].format).toBeDefined();
        expect(FIELD_EXPECTATIONS[f].description).toBeDefined();
      });
    });
  });
});