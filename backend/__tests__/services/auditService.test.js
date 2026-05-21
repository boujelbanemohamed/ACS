jest.mock('../../config/database');

const db = require('../../config/database');
const auditService = require('../../services/auditService');

describe('AuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('log()', () => {
    it('calls db.query with INSERT SQL containing all params', async () => {
      const req = { ip: '127.0.0.1', user: { bank_id: 1 } };
      await auditService.log(1, 'admin', 'super_admin', 'CREATE', 'banks', 1, { old: 'data' }, { new: 'data' }, req);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        [1, 'admin', 'super_admin', 'CREATE', 'banks', 1, 1, '{"old":"data"}', '{"new":"data"}', '127.0.0.1']
      );
    });

    it('log() with null oldData/newData stores null in DB', async () => {
      await auditService.log(1, 'admin', 'super_admin', 'LOGIN', 'users', 1, null, null, { ip: '127.0.0.1' });
      const params = db.query.mock.calls[0][1];
      expect(params[7]).toBeNull();
      expect(params[8]).toBeNull();
    });

    it('log() with explicitBankId uses that value for bank_id', async () => {
      await auditService.log(1, 'admin', 'super_admin', 'CREATE', 'banks', 1, null, null, { ip: '127.0.0.1' }, 42);
      expect(db.query.mock.calls[0][1][6]).toBe(42);
    });

    it('log() without explicitBankId falls back to req.user.bank_id', async () => {
      const req = { ip: '127.0.0.1', user: { bank_id: 99 } };
      await auditService.log(1, 'admin', 'super_admin', 'CREATE', 'banks', 1, null, null, req);
      expect(db.query.mock.calls[0][1][6]).toBe(99);
    });

    it('log() with ip from req.ip', async () => {
      await auditService.log(1, 'admin', 'super_admin', 'LOGIN', 'users', 1, null, null, { ip: '192.168.1.1' });
      expect(db.query.mock.calls[0][1][9]).toBe('192.168.1.1');
    });

    it('log() when db.query throws, catches error and calls console.error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      db.query.mockRejectedValueOnce(new Error('DB error'));
      await auditService.log(1, 'admin', 'super_admin', 'CREATE', 'banks', 1, null, null, { ip: '127.0.0.1' });
      expect(consoleSpy).toHaveBeenCalledWith('Audit log error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('logAction()', () => {
    it('logAction() calls this.log with correct extracted params from details and req', async () => {
      const logSpy = jest.spyOn(auditService, 'log').mockResolvedValue();
      const req = { user: { id: 1, username: 'admin', role: 'super_admin' } };
      const details = { tableName: 'banks', recordId: 5, oldData: { name: 'Old' }, newData: { name: 'New', bankId: 3 } };
      await auditService.logAction('UPDATE', details, req);
      expect(logSpy).toHaveBeenCalledWith(1, 'admin', 'super_admin', 'UPDATE', 'banks', 5, { name: 'Old' }, { name: 'New', bankId: 3 }, req, 3);
      logSpy.mockRestore();
    });
  });
});
