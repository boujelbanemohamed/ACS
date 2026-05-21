const db = require('../config/database');

class AuditService {
  async log(userId, username, userRole, action, tableName, recordId, oldData, newData, req) {
    try {
      const bankId = req?.user?.bank_id || null;
      await db.query(
        `INSERT INTO audit_logs (user_id, username, user_role, action, table_name, record_id, bank_id, old_data, new_data, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, username, userRole, action, tableName, recordId, bankId,
         oldData ? JSON.stringify(oldData) : null,
         newData ? JSON.stringify(newData) : null,
         req?.ip || req?.connection?.remoteAddress || 'unknown']
      );
    } catch (error) {
      console.error('Audit log error:', error);
    }
  }

  async logAction(action, details, req) {
    await this.log(
      req?.user?.id, req?.user?.username, req?.user?.role,
      action, details?.tableName, details?.recordId,
      details?.oldData, details?.newData, req
    );
  }
}

module.exports = new AuditService();
