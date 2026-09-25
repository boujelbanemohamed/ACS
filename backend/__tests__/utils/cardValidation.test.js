const { validateCard, validateCards, normalizePhone } = require('../../utils/cardValidation');

const now = new Date('2026-09-25T10:00:00Z');
const card = (overrides = {}) => ({ pan: '4000056655665556', phone: '+21699123456', expiry: '12/28', ...overrides });

describe('cardValidation', () => {
  it('normalizes phone numbers', () => {
    expect(normalizePhone('+216 99 123 456')).toBe('21699123456');
    expect(normalizePhone('0021699123456')).toBe('21699123456');
    expect(normalizePhone('99123456')).toBe('21699123456');
    expect(normalizePhone(null)).toBe('');
  });

  it('accepts a valid card and applies defaults', () => {
    const result = validateCard(card(), now);
    expect(result.isValid).toBe(true);
    expect(result.card).toEqual(expect.objectContaining({
      pan: '4000056655665556', phone: '+21699123456', language: 'fr', behaviour: 'otp', action: 'update'
    }));
  });

  it('accepts alternative field names (API payloads)', () => {
    const result = validateCard({ cardNumber: '4000 0566 5566 5556', phoneNumber: '99123456', expiryDate: '12/28', prenom: 'Ali', nom: 'Ben' }, now);
    expect(result.isValid).toBe(true);
    expect(result.card.firstName).toBe('Ali');
    expect(result.card.pan).toBe('4000056655665556');
  });

  it('flags a Luhn failure as a warning, not an error', () => {
    const result = validateCard(card({ pan: '4000056655665557' }), now);
    expect(result.isValid).toBe(true);
    expect(result.warnings[0].field).toBe('pan');
  });

  it.each([
    [{ pan: '123' }, 'pan'],
    [{ pan: '4000a56655665556' }, 'pan'],
    [{ phone: '' }, 'phone'],
    [{ phone: '12' }, 'phone'],
    [{ expiry: '2028-12' }, 'expiry'],
    [{ expiry: '13/28' }, 'expiry'],
    [{ expiry: '08/26' }, 'expiry'],
    [{ expiry: '12/99' }, 'expiry'],
    [{ language: 'de' }, 'language'],
    [{ behaviour: 'push' }, 'behaviour'],
    [{ action: 'drop' }, 'action'],
    [{ firstName: 'A'.repeat(256) }, 'firstName'],
    [{ lastName: 'Ben\u0000Ali' }, 'lastName']
  ])('rejects %j', (overrides, field) => {
    const result = validateCard(card(overrides), now);
    expect(result.isValid).toBe(false);
    expect(result.errors.map(e => e.field)).toContain(field);
  });

  it('a card expiring this month is still valid', () => {
    expect(validateCard(card({ expiry: '09/26' }), now).isValid).toBe(true);
  });

  it('validateCards detects duplicate PANs in the same batch and keeps indexes', () => {
    const { valid, invalid } = validateCards([card(), card({ pan: '1' }), card()], now);
    expect(valid.map(v => v.index)).toEqual([0]);
    expect(invalid.map(i => i.index)).toEqual([1, 2]);
    expect(invalid[1].errors[0].message).toContain('double');
  });

  it('validateCards tolerates a non-array input', () => {
    expect(validateCards(null)).toEqual({ valid: [], invalid: [] });
  });
});
