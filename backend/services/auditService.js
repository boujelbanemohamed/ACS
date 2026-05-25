const db = require('../config/database');
const liveEventService = require('./liveEventService');

class AuditService {
  async log(userId, username, userRole, action, tableName, recordId, oldData, newData, req, explicitBankId) {
    try {
      const ipAddress = req?.ip || req?.connection?.remoteAddress || 'unknown';
      const bankId = explicitBankId !== undefined ? explicitBankId : (req?.user?.bank_id || null);
      await db.query(
        `INSERT INTO audit_logs (user_id, username, user_role, action, table_name, record_id, bank_id, old_data, new_data, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, username, userRole, action, tableName, recordId, bankId,
         oldData ? JSON.stringify(oldData) : null,
         newData ? JSON.stringify(newData) : null,
         ipAddress]
      );

      liveEventService.emitEvent({
        type: 'audit',
        userId,
        username,
        userRole,
        action,
        tableName,
        recordId,
        bankId,
        ipAddress,
        description: describeAction(action, tableName, username)
      });
    } catch (error) {
      console.error('Audit log error:', error);
    }
  }

  async logAction(action, details, req) {
    const bankId = details?.newData?.bankId || details?.bankId;
    await this.log(
      req?.user?.id, req?.user?.username, req?.user?.role,
      action, details?.tableName, details?.recordId,
      details?.oldData, details?.newData, req, bankId
    );
  }
}

function describeAction(action, tableName, username) {
  const name = username || 'Inconnu';
  const table = tableName || '';
  const actionMap = {
    LOGIN_SUCCESS: `${name} s'est connecté`,
    LOGIN_FAILED: `${name} a échoué à se connecter`,
    LOGOUT: `${name} s'est déconnecté`,
    CHANGE_PASSWORD_SUCCESS: `${name} a changé son mot de passe`,
    CHANGE_PASSWORD_FAILED: `${name} a échoué à changer son mot de passe`,
    FORGOT_PASSWORD: `${name} a demandé un reset de mot de passe`,
    RESET_PASSWORD: `${name} a réinitialisé son mot de passe`,
    CREATE_USER: `${name} a créé un utilisateur (${table || '?'})`,
    UPDATE_USER: `${name} a modifié un utilisateur (${table || '?'})`,
    DELETE_USER: `${name} a supprimé un utilisateur (${table || '?'})`,
    UPDATE_PROFILE: `${name} a mis à jour son profil`,
    UPLOAD_FILE: `${name} a importé un fichier CSV`,
    UPLOAD_ENROLLMENT: `${name} a importé un fichier d'enrôlement`,
    PROCESS_URL: `${name} a traité une URL`,
    PROCESS_MANUAL: `${name} a saisi des données manuelles`,
    CALL_API: `${name} a appelé une API externe`,
    DOWNLOAD_FILE: `${name} a téléchargé un fichier`,
    DELETE_RECORD: `${name} a supprimé un enregistrement`,
    RESOLVE_ERROR: `${name} a résolu une erreur`,
    UPDATE_SMTP_CONFIG: `${name} a modifié la config SMTP`,
    TEST_SMTP: `${name} a testé SMTP`,
    ADD_NOTIFICATION_EMAIL: `${name} a ajouté un email de notification`,
    DELETE_NOTIFICATION_EMAIL: `${name} a supprimé un email de notification`,
    TOGGLE_NOTIFICATION_EMAIL: `${name} a modifié l'état d'un email de notification`,
    TRIGGER_SCAN: `${name} a déclenché un scan manuel`,
    SEND_REPORT: `${name} a envoyé un rapport`,
    SEND_ALL_REPORTS: `${name} a envoyé tous les rapports`,
    UPDATE_CRON_CONFIG: `${name} a modifié la config CRON`,
  };
  return actionMap[action] || `${name} a effectué l'action ${action}${table ? ` sur ${table}` : ''}`;
}

module.exports = new AuditService();
module.exports.describeAction = describeAction;
