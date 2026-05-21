jest.mock('../../config/database');

const db = require('../../config/database');
const roleFeaturesService = require('../../services/roleFeaturesService');

describe('RoleFeaturesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockEnsureTables = () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
  };

  describe('ensureTables', () => {
    it('creates all three feature tables', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.ensureTables();
      expect(db.query).toHaveBeenCalledTimes(3);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS role_features'));
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS bank_features'));
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS user_features'));
    });
  });

  describe('seedDefaults', () => {
    it('inserts default features for bank_admin and bank', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.seedDefaults();

      const calls = db.query.mock.calls;
      const inserts = calls.filter(c => c[0].includes('INSERT INTO role_features'));
      expect(inserts.length).toBeGreaterThan(0);

      const bankAdminCalls = inserts.filter(c => c[1][0] === 'bank_admin');
      const bankCalls = inserts.filter(c => c[1][0] === 'bank');
      expect(bankAdminCalls.length).toBeGreaterThan(0);
      expect(bankCalls.length).toBeGreaterThan(0);
    });
  });

  describe('getEffectiveFeatures', () => {
    it('returns user override when present', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [{ enabled: false }] })
        .mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank', 2);
      expect(features.dashboard).toBe(false);
    });

    it('falls back to bank override when no user override', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ enabled: false }] })
        .mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank_admin', 2);
      expect(features.dashboard).toBe(false);
    });

    it('falls back to role default when no overrides', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ enabled: false }] })
        .mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank', 2);
      expect(features.dashboard).toBe(false);
    });

    it('uses true as default when no role feature found', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank', 2);
      expect(features.dashboard).toBe(true);
    });

    it('prioritizes user override over bank override', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [{ enabled: true }] })
        .mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank', 2);
      expect(features.dashboard).toBe(true);
    });

    it('prioritizes bank override over role default', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ enabled: true }] })
        .mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank', 2);
      expect(features.dashboard).toBe(true);
    });

    it('works without bank_id (no bank scoping)', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ enabled: false }] })
        .mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank', null);
      expect(features.dashboard).toBe(false);
    });

    it('resolves all 15 features', async () => {
      mockEnsureTables();
      db.query.mockResolvedValue({ rows: [] });

      const features = await roleFeaturesService.getEffectiveFeatures(1, 'bank', 2);
      expect(Object.keys(features).length).toBe(15);
    });
  });

  describe('setRoleFeature', () => {
    it('inserts or updates role feature', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.setRoleFeature('bank', 'api_keys', true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (role, feature) DO UPDATE'),
        ['bank', 'api_keys', true]
      );
    });
  });

  describe('setBankFeature', () => {
    it('inserts or updates bank feature', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.setBankFeature(5, 'users', false);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (bank_id, feature) DO UPDATE'),
        [5, 'users', false]
      );
    });
  });

  describe('setUserFeature', () => {
    it('inserts or updates user feature', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.setUserFeature(10, 'settings', true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (user_id, feature) DO UPDATE'),
        [10, 'settings', true]
      );
    });
  });

  describe('deleteBankFeature', () => {
    it('deletes bank feature override', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.deleteBankFeature(5, 'users');
      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM bank_features WHERE bank_id = $1 AND feature = $2',
        [5, 'users']
      );
    });
  });

  describe('deleteUserFeature', () => {
    it('deletes user feature override', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.deleteUserFeature(10, 'settings');
      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM user_features WHERE user_id = $1 AND feature = $2',
        [10, 'settings']
      );
    });
  });

  describe('resetDefaults', () => {
    it('clears all overrides and reseeds from defaults', async () => {
      db.query.mockResolvedValue({ rows: [] });
      await roleFeaturesService.resetDefaults();
      const deleteCalls = db.query.mock.calls.filter(c =>
        c[0].includes('DELETE FROM') && !c[0].includes('INSERT INTO')
      );
      expect(deleteCalls.length).toBe(3);
      expect(deleteCalls[0][0]).toContain('bank_features');
      expect(deleteCalls[1][0]).toContain('user_features');
      expect(deleteCalls[2][0]).toContain('role_features');
    });
  });

  describe('getAll', () => {
    it('returns grouped features by role, bank, and user', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [{ role: 'bank', feature: 'dashboard', enabled: true }] })
        .mockResolvedValueOnce({ rows: [{ bank_id: 1, feature: 'users', enabled: false, bank_name: 'Bank A' }] })
        .mockResolvedValueOnce({ rows: [{ user_id: 5, feature: 'settings', enabled: true, username: 'jdoe' }] });

      const result = await roleFeaturesService.getAll();
      expect(result).toHaveProperty('roles');
      expect(result).toHaveProperty('banks');
      expect(result).toHaveProperty('users');
      expect(result.roles.bank.dashboard).toBe(true);
    });

    it('handles empty result sets', async () => {
      mockEnsureTables();
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await roleFeaturesService.getAll();
      expect(result.roles).toBeUndefined();
      expect(result.banks).toEqual([]);
      expect(result.users).toEqual([]);
    });
  });
});
