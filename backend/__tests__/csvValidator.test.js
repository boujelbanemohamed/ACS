const CSVValidator = require('../utils/csvValidator');

const validator = new CSVValidator();

describe('CSVValidator', () => {
  describe('validateHeader', () => {
    it('accepts valid headers', () => {
      const valid = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action'];
      const result = validator.validateHeader(valid);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing required fields', () => {
      const missing = ['language', 'firstName'];
      const result = validator.validateHeader(missing);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.error.includes('pan'))).toBe(true);
      expect(result.errors.some(e => e.error.includes('Champ requis'))).toBe(true);
    });

    it('warns on unexpected fields', () => {
      const extra = ['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action', 'extraField'];
      const result = validator.validateHeader(extra);
      expect(result.errors.some(e => e.severity === 'warning')).toBe(true);
    });
  });

  describe('validateRow', () => {
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

    it('accepts a valid row (MM/YY)', () => {
      const result = validator.validateRow(validRow, 1);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing language', () => {
      const result = validator.validateRow({ ...validRow, language: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'language')).toBe(true);
    });

    it('rejects invalid language', () => {
      const result = validator.validateRow({ ...validRow, language: 'de' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'language')).toBe(true);
    });

    it('rejects missing firstName', () => {
      const result = validator.validateRow({ ...validRow, firstName: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'firstName')).toBe(true);
    });

    it('rejects short firstName', () => {
      const result = validator.validateRow({ ...validRow, firstName: 'A' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'firstName')).toBe(true);
    });

    it('rejects missing lastName', () => {
      const result = validator.validateRow({ ...validRow, lastName: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'lastName')).toBe(true);
    });

    it('rejects empty PAN', () => {
      const result = validator.validateRow({ ...validRow, pan: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'pan')).toBe(true);
    });

    it('rejects PAN with non-16 digits', () => {
      const result = validator.validateRow({ ...validRow, pan: '123456789012345' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'pan' && e.error.includes('16 chiffres'))).toBe(true);
    });

    it('warns on PAN failing Luhn check', () => {
      const result = validator.validateRow({ ...validRow, pan: '1111111111111111' }, 1);
      expect(result.errors.some(e => e.field === 'pan' && e.severity === 'warning')).toBe(true);
    });

    it('rejects missing expiry', () => {
      const result = validator.validateRow({ ...validRow, expiry: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'expiry')).toBe(true);
    });

    it('rejects expiry in YYYYMM format (old format)', () => {
      const result = validator.validateRow({ ...validRow, expiry: '202812' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'expiry' && e.error.includes('MM/YY'))).toBe(true);
    });

    it('rejects invalid month in expiry', () => {
      const result = validator.validateRow({ ...validRow, expiry: '13/28' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'expiry' && e.error.includes('Mois'))).toBe(true);
    });

    it('rejects month zero in expiry', () => {
      const result = validator.validateRow({ ...validRow, expiry: '00/28' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'expiry' && e.error.includes('Mois'))).toBe(true);
    });

    it('warns on expired card', () => {
      const result = validator.validateRow({ ...validRow, expiry: '01/20' }, 1);
      expect(result.errors.some(e => e.field === 'expiry' && e.severity === 'warning' && e.error.includes('expirée'))).toBe(true);
    });

    it('rejects missing phone', () => {
      const result = validator.validateRow({ ...validRow, phone: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'phone')).toBe(true);
    });

    it('rejects non-Tunisian phone format', () => {
      const result = validator.validateRow({ ...validRow, phone: '33612345678' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'phone')).toBe(true);
    });

    it('rejects missing behaviour', () => {
      const result = validator.validateRow({ ...validRow, behaviour: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'behaviour')).toBe(true);
    });

    it('rejects invalid behaviour', () => {
      const result = validator.validateRow({ ...validRow, behaviour: 'push' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'behaviour')).toBe(true);
    });

    it('rejects missing action', () => {
      const result = validator.validateRow({ ...validRow, action: '' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'action')).toBe(true);
    });

    it('rejects invalid action', () => {
      const result = validator.validateRow({ ...validRow, action: 'purge' }, 1);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.field === 'action')).toBe(true);
    });

    it('accumulates multiple errors on bad row', () => {
      const badRow = { language: '', firstName: '', lastName: '', pan: '', expiry: '', phone: '', behaviour: '', action: '' };
      const result = validator.validateRow(badRow, 1);
      expect(result.isValid).toBe(false);
      const fields = result.errors.map(e => e.field);
      expect(new Set(fields)).toEqual(new Set(['language', 'firstName', 'lastName', 'pan', 'expiry', 'phone', 'behaviour', 'action']));
    });
  });

  describe('luhnCheck', () => {
    it('passes valid PAN', () => {
      expect(validator.luhnCheck('4000056655665556')).toBe(true);
    });

    it('passes another valid PAN', () => {
      expect(validator.luhnCheck('4111111111111111')).toBe(true);
    });

    it('passes yet another valid PAN', () => {
      expect(validator.luhnCheck('4532015112830366')).toBe(true);
    });

    it('fails invalid PAN', () => {
      expect(validator.luhnCheck('1234567890123456')).toBe(false);
    });

    it('fails simple invalid PAN', () => {
      expect(validator.luhnCheck('1111111111111111')).toBe(false);
    });
  });

  describe('isDuplicateKey', () => {
    it('detects duplicate by pan, expiry, phone', () => {
      const a = { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' };
      const b = { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' };
      expect(validator.isDuplicateKey(a, b)).toBe(true);
    });

    it('does not flag different PANs as duplicate', () => {
      const a = { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' };
      const b = { pan: '4111111111111111', expiry: '12/28', phone: '21699123456' };
      expect(validator.isDuplicateKey(a, b)).toBe(false);
    });

    it('does not flag different expiry as duplicate', () => {
      const a = { pan: '4000056655665556', expiry: '12/28', phone: '21699123456' };
      const b = { pan: '4000056655665556', expiry: '06/29', phone: '21699123456' };
      expect(validator.isDuplicateKey(a, b)).toBe(false);
    });
  });
});