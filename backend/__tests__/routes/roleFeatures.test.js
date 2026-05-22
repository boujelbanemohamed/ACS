const express = require('express');
const request = require('supertest');

jest.mock('../../config/database');
jest.mock('../../services/roleFeaturesService');
jest.mock('../../services/auditService');

jest.mock('../../middleware/auth', () => ({
  authMiddleware: (req, res, next) => {
    if (req.headers['x-test-role']) {
      req.user = {
        id: parseInt(req.headers['x-test-id'] || '1'),
        username: req.headers['x-test-username'] || 'admin',
        role: req.headers['x-test-role'],
        bank_id: parseInt(req.headers['x-test-bank-id'] || '0') || null
      };
    } else {
      req.user = { id: 1, username: 'admin', role: 'super_admin', bank_id: null };
    }
    next();
  }
}));

const db = require('../../config/database');
const roleFeaturesService = require('../../services/roleFeaturesService');
const auditService = require('../../services/auditService');
const roleFeaturesRoutes = require('../../routes/roleFeatures');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/role-features', roleFeaturesRoutes);
  return app;
}

describe('Role Features Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/role-features/me', () => {
    it('returns empty features for super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/role-features/me')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({});
    });

    it('returns effective features for bank user', async () => {
      roleFeaturesService.getEffectiveFeatures.mockResolvedValue({ dashboard: true, banks: false });
      const res = await request(createTestApp())
        .get('/api/role-features/me')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-id', '5')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
      expect(res.body.data.dashboard).toBe(true);
      expect(res.body.data.banks).toBe(false);
      expect(roleFeaturesService.getEffectiveFeatures).toHaveBeenCalledWith(5, 'bank', 3);
    });
  });

  describe('GET /api/role-features', () => {
    it('returns all features for super_admin', async () => {
      roleFeaturesService.getAll.mockResolvedValue({ roles: {}, banks: [], users: [] });
      const res = await request(createTestApp())
        .get('/api/role-features')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('blocks bank_admin from listing all features', async () => {
      const res = await request(createTestApp())
        .get('/api/role-features')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin');
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/role-features/role/:role/:feature', () => {
    it('updates role feature', async () => {
      roleFeaturesService.setRoleFeature.mockResolvedValue();
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/role-features/role/bank_admin/dashboard')
        .send({ enabled: false })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(roleFeaturesService.setRoleFeature).toHaveBeenCalledWith('bank_admin', 'dashboard', false);
    });
  });

  describe('PUT /api/role-features/bank/:bankId/:feature', () => {
    it('updates bank feature', async () => {
      roleFeaturesService.setBankFeature.mockResolvedValue();
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/role-features/bank/5/users')
        .send({ enabled: true })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(roleFeaturesService.setBankFeature).toHaveBeenCalledWith(5, 'users', true);
    });
  });

  describe('PUT /api/role-features/user/:userId/:feature', () => {
    it('updates user feature', async () => {
      roleFeaturesService.setUserFeature.mockResolvedValue();
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/role-features/user/10/settings')
        .send({ enabled: false })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(roleFeaturesService.setUserFeature).toHaveBeenCalledWith(10, 'settings', false);
    });

    it('returns 404 when user not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .put('/api/role-features/user/999/settings')
        .send({ enabled: true })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/role-features/bank/:bankId/:feature', () => {
    it('deletes bank feature override', async () => {
      roleFeaturesService.deleteBankFeature.mockResolvedValue();
      const res = await request(createTestApp())
        .delete('/api/role-features/bank/5/users')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(roleFeaturesService.deleteBankFeature).toHaveBeenCalledWith(5, 'users');
    });
  });

  describe('DELETE /api/role-features/user/:userId/:feature', () => {
    it('deletes user feature override', async () => {
      roleFeaturesService.deleteUserFeature.mockResolvedValue();
      const res = await request(createTestApp())
        .delete('/api/role-features/user/10/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(roleFeaturesService.deleteUserFeature).toHaveBeenCalledWith(10, 'settings');
    });

    it('returns 404 when user not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .delete('/api/role-features/user/999/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank_admin')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/role-features/reset', () => {
    it('resets all permissions to defaults', async () => {
      roleFeaturesService.resetDefaults.mockResolvedValue();
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/role-features/reset')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(roleFeaturesService.resetDefaults).toHaveBeenCalled();
    });
  });

  describe('GET /api/role-features/banks', () => {
    it('lists active banks', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1, name: 'Bank A', code: 'BA' }] });
      const res = await request(createTestApp())
        .get('/api/role-features/banks')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/role-features/users', () => {
    it('lists users with optional bank filter', async () => {
      db.query.mockResolvedValue({ rows: [{ id: 1, username: 'user1', role: 'bank', bank_id: 1, bank_name: 'Bank A' }] });
      const res = await request(createTestApp())
        .get('/api/role-features/users')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('filters by bankId for super_admin', async () => {
      db.query.mockResolvedValue({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/role-features/users?bankId=2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain('u.bank_id = $1');
      expect(db.query.mock.calls[0][1]).toEqual([2]);
    });
  });

  describe('GET /api/role-features/bank/:bankId', () => {
    it('returns bank features', async () => {
      db.query.mockResolvedValue({ rows: [{ feature: 'users', enabled: false }] });
      const res = await request(createTestApp())
        .get('/api/role-features/bank/5')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.users).toBe(false);
    });
  });

  describe('GET /api/role-features/user/:userId', () => {
    it('returns user features', async () => {
      db.query.mockResolvedValue({ rows: [{ feature: 'settings', enabled: true }] });
      const res = await request(createTestApp())
        .get('/api/role-features/user/10')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.settings).toBe(true);
    });
  });

  describe('Error handling - 500 errors', () => {
    it('GET /me returns 500 on service error', async () => {
      roleFeaturesService.getEffectiveFeatures.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .get('/api/role-features/me')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(500);
    });

    it('GET / returns 500 on service error', async () => {
      roleFeaturesService.getAll.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .get('/api/role-features')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('GET /users returns 500 on db error', async () => {
      db.query.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .get('/api/role-features/users')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('GET /bank/:bankId returns 500 on db error', async () => {
      db.query.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .get('/api/role-features/bank/5')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('GET /banks returns 500 on db error', async () => {
      db.query.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .get('/api/role-features/banks')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('PUT /role/:role/:feature returns 500 on service error', async () => {
      roleFeaturesService.setRoleFeature.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .put('/api/role-features/role/bank_admin/dashboard')
        .send({ enabled: false })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('PUT /bank/:bankId/:feature returns 500 on service error', async () => {
      roleFeaturesService.setBankFeature.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .put('/api/role-features/bank/5/users')
        .send({ enabled: true })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('PUT /user/:userId/:feature returns 500 on service error', async () => {
      roleFeaturesService.setUserFeature.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .put('/api/role-features/user/10/settings')
        .send({ enabled: false })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('DELETE /bank/:bankId/:feature returns 500 on service error', async () => {
      roleFeaturesService.deleteBankFeature.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .delete('/api/role-features/bank/5/users')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('DELETE /user/:userId/:feature returns 500 on service error', async () => {
      roleFeaturesService.deleteUserFeature.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .delete('/api/role-features/user/10/settings')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });

    it('POST /reset returns 500 on service error', async () => {
      roleFeaturesService.resetDefaults.mockRejectedValue(new Error('fail'));
      const res = await request(createTestApp())
        .post('/api/role-features/reset')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(500);
    });
  });

  describe('Bank admin access', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('GET /api/role-features', () => {
      it('blocks bank_admin from listing all features', async () => {
        const res = await request(createTestApp())
          .get('/api/role-features')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin');
        expect(res.status).toBe(403);
      });
    });

    describe('PUT /api/role-features/role/:role/:feature', () => {
      it('blocks bank_admin from updating role defaults', async () => {
        const res = await request(createTestApp())
          .put('/api/role-features/role/bank/dashboard')
          .send({ enabled: true })
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin');
        expect(res.status).toBe(403);
      });
    });

    describe('POST /api/role-features/reset', () => {
      it('blocks bank_admin from resetting all permissions', async () => {
        const res = await request(createTestApp())
          .post('/api/role-features/reset')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin');
        expect(res.status).toBe(403);
      });
    });

    describe('GET /api/role-features/banks', () => {
      it('returns only bank_admin own bank', async () => {
        db.query.mockResolvedValue({ rows: [{ id: 3, name: 'My Bank', code: 'MB' }] });
        const res = await request(createTestApp())
          .get('/api/role-features/banks')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(3);
        expect(db.query.mock.calls[0][0]).toContain('AND id = $1');
        expect(db.query.mock.calls[0][1]).toEqual([3]);
      });
    });

    describe('GET /api/role-features/users', () => {
      it('auto-filters users by bank_admin own bank', async () => {
        db.query.mockResolvedValue({ rows: [{ id: 5, username: 'user1', role: 'bank', bank_id: 3, bank_name: 'My Bank' }] });
        const res = await request(createTestApp())
          .get('/api/role-features/users')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(db.query.mock.calls[0][0]).toContain('u.bank_id = $1');
        expect(db.query.mock.calls[0][1]).toEqual([3]);
      });
    });

    describe('GET /api/role-features/bank/:bankId', () => {
      it('allows bank_admin to access their own bank features', async () => {
        db.query.mockResolvedValue({ rows: [{ feature: 'users', enabled: false }] });
        const res = await request(createTestApp())
          .get('/api/role-features/bank/3')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(res.body.data.users).toBe(false);
      });

      it('blocks bank_admin from accessing another bank features', async () => {
        const res = await request(createTestApp())
          .get('/api/role-features/bank/5')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(403);
      });
    });

    describe('GET /api/role-features/user/:userId', () => {
      it('allows bank_admin to get features for user in their bank', async () => {
        db.query
          .mockResolvedValueOnce({ rows: [{ bank_id: 3 }] })
          .mockResolvedValueOnce({ rows: [{ feature: 'dashboard', enabled: true }] });
        const res = await request(createTestApp())
          .get('/api/role-features/user/10')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(res.body.data.dashboard).toBe(true);
      });

      it('blocks bank_admin from getting features for user in another bank', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ bank_id: 5 }] });
        const res = await request(createTestApp())
          .get('/api/role-features/user/10')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(403);
      });

      it('returns 404 for non-existent user', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(createTestApp())
          .get('/api/role-features/user/999')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(404);
      });
    });

    describe('PUT /api/role-features/bank/:bankId/:feature', () => {
      it('allows bank_admin to update their own bank feature', async () => {
        roleFeaturesService.setBankFeature.mockResolvedValue();
        auditService.logAction.mockResolvedValue();
        const res = await request(createTestApp())
          .put('/api/role-features/bank/3/users')
          .send({ enabled: true })
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(roleFeaturesService.setBankFeature).toHaveBeenCalledWith(3, 'users', true);
      });

      it('blocks bank_admin from updating another bank feature', async () => {
        const res = await request(createTestApp())
          .put('/api/role-features/bank/5/users')
          .send({ enabled: false })
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(403);
      });
    });

    describe('PUT /api/role-features/user/:userId/:feature', () => {
      it('allows bank_admin to update user in their bank', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ bank_id: 3 }] });
        roleFeaturesService.setUserFeature.mockResolvedValue();
        auditService.logAction.mockResolvedValue();
        const res = await request(createTestApp())
          .put('/api/role-features/user/10/settings')
          .send({ enabled: false })
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(roleFeaturesService.setUserFeature).toHaveBeenCalledWith(10, 'settings', false);
      });

      it('blocks bank_admin from updating user in another bank', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ bank_id: 5 }] });
        const res = await request(createTestApp())
          .put('/api/role-features/user/10/settings')
          .send({ enabled: false })
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(403);
      });
    });

    describe('DELETE /api/role-features/bank/:bankId/:feature', () => {
      it('allows bank_admin to delete override from their own bank', async () => {
        roleFeaturesService.deleteBankFeature.mockResolvedValue();
        const res = await request(createTestApp())
          .delete('/api/role-features/bank/3/users')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(roleFeaturesService.deleteBankFeature).toHaveBeenCalledWith(3, 'users');
      });

      it('blocks bank_admin from deleting override from another bank', async () => {
        const res = await request(createTestApp())
          .delete('/api/role-features/bank/5/users')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(403);
      });
    });

    describe('DELETE /api/role-features/user/:userId/:feature', () => {
      it('allows bank_admin to delete override for user in their bank', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ bank_id: 3 }] });
        roleFeaturesService.deleteUserFeature.mockResolvedValue();
        const res = await request(createTestApp())
          .delete('/api/role-features/user/10/settings')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(200);
        expect(roleFeaturesService.deleteUserFeature).toHaveBeenCalledWith(10, 'settings');
      });

      it('blocks bank_admin from deleting override for user in another bank', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ bank_id: 5 }] });
        const res = await request(createTestApp())
          .delete('/api/role-features/user/10/settings')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(403);
      });
    });

    describe('Error paths for inline bank_admin checks', () => {
      it('GET user returns 500 when db.query fails', async () => {
        db.query.mockRejectedValue(new Error('DB connection failed'));
        const res = await request(createTestApp())
          .get('/api/role-features/user/10')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(500);
      });

      it('PUT user returns 500 when db.query fails', async () => {
        db.query.mockRejectedValue(new Error('DB connection failed'));
        const res = await request(createTestApp())
          .put('/api/role-features/user/10/settings')
          .send({ enabled: true })
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(500);
      });

      it('DELETE user returns 500 when db.query fails', async () => {
        db.query.mockRejectedValue(new Error('DB connection failed'));
        const res = await request(createTestApp())
          .delete('/api/role-features/user/10/settings')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank_admin')
          .set('x-test-bank-id', '3');
        expect(res.status).toBe(500);
      });
    });

    describe('Bank role blocked from all bank_admin endpoints', () => {
      it('blocks bank from GET bank features', async () => {
        const res = await request(createTestApp())
          .get('/api/role-features/bank/3')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank');
        expect(res.status).toBe(403);
      });

      it('blocks bank from PUT user feature', async () => {
        const res = await request(createTestApp())
          .put('/api/role-features/user/10/settings')
          .send({ enabled: true })
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank');
        expect(res.status).toBe(403);
      });

      it('blocks bank from DELETE bank feature', async () => {
        const res = await request(createTestApp())
          .delete('/api/role-features/bank/3/users')
          .set('Authorization', 'Bearer token')
          .set('x-test-role', 'bank');
        expect(res.status).toBe(403);
      });
    });
  });
});
