const crypto = require('crypto');

const ENCRYPTION_KEY = 'test-encryption-key-32bytes!!';

describe('EncryptionService', () => {
  beforeEach(() => {
    process.env.PAN_ENCRYPTION_KEY = ENCRYPTION_KEY;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.PAN_ENCRYPTION_KEY;
  });

  describe('encrypt / decrypt roundtrip', () => {
    it('encrypts and decrypts a PAN correctly', () => {
      const { encrypt, decrypt } = require('../../services/encryptionService');
      const pan = '4741000000000006';
      const encrypted = encrypt(pan);
      expect(encrypted).not.toBe(pan);
      expect(encrypted.split(':')).toHaveLength(3);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(pan);
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const { encrypt } = require('../../services/encryptionService');
      const pan = '4000056655665556';
      const a = encrypt(pan);
      const b = encrypt(pan);
      expect(a).not.toBe(b);
    });

    it('decrypts a known encrypted value', () => {
      const { encrypt, decrypt } = require('../../services/encryptionService');
      const pan = '4987654321098765';
      const encrypted = encrypt(pan);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(pan);
    });

    it('handles short PAN values', () => {
      const { encrypt, decrypt } = require('../../services/encryptionService');
      const pan = '1234';
      const decrypted = decrypt(encrypt(pan));
      expect(decrypted).toBe(pan);
    });
  });

  describe('encrypt edge cases', () => {
    it('returns falsy input as-is', () => {
      const { encrypt } = require('../../services/encryptionService');
      expect(encrypt(null)).toBeNull();
      expect(encrypt(undefined)).toBeUndefined();
      expect(encrypt('')).toBe('');
    });

    it('encrypts numeric input converted to string', () => {
      const { encrypt, decrypt } = require('../../services/encryptionService');
      const decrypted = decrypt(encrypt(4741000000000006));
      expect(decrypted).toBe('4741000000000006');
    });
  });

  describe('decrypt edge cases', () => {
    it('returns falsy input as-is', () => {
      const { decrypt } = require('../../services/encryptionService');
      expect(decrypt(null)).toBeNull();
      expect(decrypt(undefined)).toBeUndefined();
      expect(decrypt('')).toBe('');
    });

    it('returns plaintext back if not colon-delimited', () => {
      const { decrypt } = require('../../services/encryptionService');
      expect(decrypt('not-encrypted')).toBe('not-encrypted');
      expect(decrypt('plainpan0001')).toBe('plainpan0001');
    });

    it('returns plaintext if it has wrong format parts', () => {
      const { decrypt } = require('../../services/encryptionService');
      expect(decrypt('abc:def')).toBe('abc:def');
    });
  });

  describe('maskPan', () => {
    it('masks all but last 4 digits of a 16-digit PAN', () => {
      const { maskPan } = require('../../services/encryptionService');
      expect(maskPan('4741000000000006')).toBe('************0006');
    });

    it('masks a 19-digit PAN correctly', () => {
      const { maskPan } = require('../../services/encryptionService');
      const pan = '1234567890123456789';
      const result = maskPan(pan);
      expect(result).toBe('***************6789');
      expect(result.length).toBe(pan.length);
    });

    it('returns the value as-is if 4 digits or fewer', () => {
      const { maskPan } = require('../../services/encryptionService');
      expect(maskPan('1234')).toBe('1234');
      expect(maskPan('12')).toBe('12');
      expect(maskPan('')).toBe('');
    });

    it('strips non-numeric characters before masking', () => {
      const { maskPan } = require('../../services/encryptionService');
      expect(maskPan('4741-0000-0000-0006')).toBe('************0006');
    });

    it('handles null/undefined', () => {
      const { maskPan } = require('../../services/encryptionService');
      expect(maskPan(null)).toBeNull();
      expect(maskPan(undefined)).toBeUndefined();
    });
  });

  describe('maskResponseData', () => {
    it('masks pan field in a flat object', () => {
      const { maskResponseData } = require('../../services/encryptionService');
      const result = maskResponseData({ pan: '4741000000000006', success: true });
      expect(result.pan).toBe('************0006');
      expect(result.success).toBe(true);
    });

    it('masks pan fields in an array of objects', () => {
      const { maskResponseData } = require('../../services/encryptionService');
      const data = [
        { pan: '4000056655665556', name: 'Alice' },
        { pan: '4111111111111111', name: 'Bob' },
      ];
      const result = maskResponseData(data);
      expect(result[0].pan).toBe('************5556');
      expect(result[1].pan).toBe('************1111');
    });

    it('masks nested pan in data_received', () => {
      const { maskResponseData } = require('../../services/encryptionService');
      const data = {
        pan: '4741000000000006',
        data_received: {
          pan: '4000056655665556',
          cardholder: 'John',
        },
      };
      const result = maskResponseData(data);
      expect(result.pan).toBe('************0006');
      expect(result.data_received.pan).toBe('************5556');
    });

    it('does not modify non-pan fields', () => {
      const { maskResponseData } = require('../../services/encryptionService');
      const data = { id: 42, name: 'Test', amount: '100.50' };
      const result = maskResponseData(data);
      expect(result).toEqual(data);
    });

    it('handles primitives and null values', () => {
      const { maskResponseData } = require('../../services/encryptionService');
      expect(maskResponseData('hello')).toBe('hello');
      expect(maskResponseData(42)).toBe(42);
      expect(maskResponseData(null)).toBeNull();
      expect(maskResponseData(undefined)).toBeUndefined();
    });
  });

  describe('missing encryption key', () => {
    it('throws on encrypt when PAN_ENCRYPTION_KEY is missing', () => {
      delete process.env.PAN_ENCRYPTION_KEY;
      jest.resetModules();
      const { encrypt } = require('../../services/encryptionService');
      expect(() => encrypt('4741000000000006')).toThrow('PAN_ENCRYPTION_KEY');
    });

    it('returns ciphertext unchanged on decrypt when key is missing (graceful degradation)', () => {
      const { encrypt } = require('../../services/encryptionService');
      const ciphertext = encrypt('4741000000000006');
      delete process.env.PAN_ENCRYPTION_KEY;
      jest.resetModules();
      const { decrypt } = require('../../services/encryptionService');
      const result = decrypt(ciphertext);
      expect(result).toBe(ciphertext);
    });
  });
});
