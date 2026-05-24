const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const cronService = require('../services/cronService');
const emailService = require('../services/emailService');

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Acces refuse' });
  }
  next();
};

async function checkDatabase() {
  const start = Date.now();
  try {
    await db.query('SELECT 1');
    return { status: 'up', latency: Date.now() - start + 'ms' };
  } catch (error) {
    return { status: 'down', latency: null, error: error.message };
  }
}

async function checkSmtp() {
  try {
    const config = await emailService.loadConfig();
    if (!config) {
      return { status: 'not_configured', message: 'SMTP non configuré' };
    }
    if (!config.enabled) {
      return { status: 'disabled', message: 'SMTP désactivé' };
    }
    const result = await emailService.testConnection();
    return {
      status: result.success ? 'up' : 'error',
      host: config.host,
      from: config.from_email,
      error: result.success ? null : result.message
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

async function checkCron() {
  const status = cronService.getStatus();
  const task = cronService.scanTask;
  if (!task && !status.enabled) {
    return { status: 'stopped', message: 'Scan automatique arrêté' };
  }
  if (!status.enabled) {
    return { status: 'disabled', message: 'Scan automatique désactivé' };
  }
  return {
    status: 'up',
    schedule: status.schedule,
    description: status.description,
    nextRun: status.nextScan ? status.nextScan.toISOString() : null,
    isScanning: status.isScanning,
    lastScan: status.lastScan ? status.lastScan.toISOString() : null
  };
}

async function checkSystem() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return {
    nodeVersion: process.version,
    platform: process.platform,
    uptime: `${days}j ${hours}h ${minutes}m`,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB'
    },
    env: process.env.NODE_ENV || 'development'
  };
}

router.get('/health', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.json({
      success: true,
      data: {
        globalStatus: 'up',
        checkedAt: new Date().toISOString(),
        components: {
          database: { status: 'up', message: 'Connecté' },
          smtp: { status: 'not_configured', message: 'Non disponible pour votre profil' },
          cron: { status: 'up', message: 'Actif' }
        },
        system: { uptime: process.uptime(), role: req.user.role }
      }
    });
  }

  try {
    const [dbStatus, smtpStatus, cronStatus, systemInfo] = await Promise.all([
      checkDatabase(),
      checkSmtp(),
      checkCron(),
      checkSystem()
    ]);

    const allUp = dbStatus.status === 'up';
    const globalStatus = allUp ? 'healthy' : 'degraded';

    res.json({
      success: true,
      data: {
        globalStatus,
        checkedAt: new Date().toISOString(),
        components: {
          database: dbStatus,
          smtp: {
            ...smtpStatus,
            hint: smtpStatus.status === 'not_configured'
              ? "Allez dans Notifications > Configuration SMTP pour param\u00e9trer"
              : smtpStatus.status === 'disabled'
                ? "Activez le SMTP dans Notifications pour autoriser l'envoi"
                : null
          },
          cron: {
            ...cronStatus,
            hint: cronStatus.status === 'stopped'
              ? "Le scan automatique n'est pas en cours. V\u00e9rifiez Scan Automatique."
              : cronStatus.status === 'disabled'
                ? "Le scan automatique est d\u00e9sactiv\u00e9"
                : null
          }
        },
        system: systemInfo
      }
    });
  } catch (error) {
    console.error('Monitoring error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/debug', authMiddleware, async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'super_admin';
    const bankId = req.query.bankId || (!isSuperAdmin ? req.user.bank_id : null);

    const bankFilter = bankId ? 'AND fl.bank_id = $1' : '';
    const bankFilterVE = bankId
      ? 'AND ve.file_log_id IN (SELECT id FROM file_logs WHERE bank_id = $1)'
      : '';
    const bankParam = bankId ? [bankId] : [];
    const bankParam2 = bankId ? [bankId, bankId] : [];

    const nonEmptyValue = bankId ? '$1' : '1';

    const [
      unresolvedValidations,
      fileProcessingErrors,
      apiCallErrors,
      xmlGenerationErrors,
      scanErrors,
      notificationErrors,
      rejectedRecords,
      enrollmentErrors,
      topFieldErrors,
      recentFileErrors,
      recentScanLogs
    ] = await Promise.all([
      db.query(
        bankId
          ? `SELECT COUNT(*)::int as count FROM validation_errors ve WHERE ve.is_resolved = false AND ve.file_log_id IN (SELECT id FROM file_logs WHERE bank_id = $1)`
          : `SELECT COUNT(*)::int as count FROM validation_errors WHERE is_resolved = false`,
        bankId ? [bankId] : []
      ),
      db.query(
        bankId
          ? `SELECT status, COUNT(*)::int as count, COALESCE(SUM(invalid_rows), 0)::int as invalid_rows, COALESCE(SUM(duplicate_rows), 0)::int as duplicate_rows FROM file_logs WHERE status IN ('error','validation_error') AND bank_id = $1 GROUP BY status ORDER BY count DESC`
          : `SELECT status, COUNT(*)::int as count, COALESCE(SUM(invalid_rows), 0)::int as invalid_rows, COALESCE(SUM(duplicate_rows), 0)::int as duplicate_rows FROM file_logs WHERE status IN ('error','validation_error') GROUP BY status ORDER BY count DESC`,
        bankId ? [bankId] : []
      ),
      db.query(`SELECT COUNT(*)::int as total, COUNT(DISTINCT endpoint)::int as endpoints FROM api_logs WHERE response_status >= 400`),
      db.query(`SELECT COUNT(*)::int as total FROM xml_logs WHERE status = 'error'`),
      db.query(
        bankId
          ? `SELECT COUNT(*)::int as total, COALESCE(SUM(errors_count), 0)::int as scan_errors FROM scan_logs WHERE errors_count > 0 AND bank_id = $1`
          : `SELECT COUNT(*)::int as total, COALESCE(SUM(errors_count), 0)::int as scan_errors FROM scan_logs WHERE errors_count > 0`,
        bankId ? [bankId] : []
      ),
      db.query(`SELECT COUNT(*)::int as total FROM notification_logs WHERE status = 'error'`),
      db.query(
        bankId
          ? `SELECT COUNT(*)::int as total FROM record_history WHERE status = 'REJECTED' AND bank_id = $1`
          : `SELECT COUNT(*)::int as total FROM record_history WHERE status = 'REJECTED'`,
        bankId ? [bankId] : []
      ),
      db.query(
        bankId
          ? `SELECT COUNT(*)::int as total FROM enrollment_logs WHERE error_count > 0 AND bank_id = $1`
          : `SELECT COUNT(*)::int as total FROM enrollment_logs WHERE error_count > 0`,
        bankId ? [bankId] : []
      ),
      db.query(
        bankId
          ? `SELECT rhd.error_type, rhd.error_message, rhd.field_name, COUNT(*)::int as count FROM record_history_details rhd JOIN record_history rh ON rhd.history_id = rh.id WHERE rhd.is_valid = false AND rh.bank_id = $1 GROUP BY rhd.error_type, rhd.error_message, rhd.field_name ORDER BY count DESC LIMIT 20`
          : `SELECT rhd.error_type, rhd.error_message, rhd.field_name, COUNT(*)::int as count FROM record_history_details rhd WHERE rhd.is_valid = false GROUP BY rhd.error_type, rhd.error_message, rhd.field_name ORDER BY count DESC LIMIT 20`,
        bankId ? [bankId] : []
      ),
      db.query(
        bankId
          ? `SELECT fl.id, fl.file_name, fl.status, fl.bank_id, fl.error_details, fl.invalid_rows, fl.processed_at, b.code as bank_code, COALESCE(( SELECT json_agg(json_build_object('field', ve.field_name, 'value', ve.field_value, 'message', ve.error_message, 'severity', ve.severity, 'row', ve.row_number, 'resolved', ve.is_resolved)) FROM validation_errors ve WHERE ve.file_log_id = fl.id ORDER BY ve.row_number, ve.field_name LIMIT 15 ), '[]'::json) as validation_errors, COALESCE(( SELECT json_agg(json_build_object('field', rhd.field_name, 'value', rhd.field_value, 'message', rhd.error_message, 'severity', rhd.severity, 'type', rhd.error_type)) FROM record_history rh JOIN record_history_details rhd ON rhd.history_id = rh.id WHERE (rh.file_log_id = fl.id OR (rh.file_name = fl.file_name AND rh.bank_id = fl.bank_id)) AND rhd.is_valid = false LIMIT 15 ), '[]'::json) as record_history_errors FROM file_logs fl LEFT JOIN banks b ON fl.bank_id = b.id WHERE fl.status IN ('error','validation_error') AND fl.bank_id = $1 ORDER BY fl.processed_at DESC LIMIT 20`
          : `SELECT fl.id, fl.file_name, fl.status, fl.bank_id, fl.error_details, fl.invalid_rows, fl.processed_at, b.code as bank_code, COALESCE(( SELECT json_agg(json_build_object('field', ve.field_name, 'value', ve.field_value, 'message', ve.error_message, 'severity', ve.severity, 'row', ve.row_number, 'resolved', ve.is_resolved)) FROM validation_errors ve WHERE ve.file_log_id = fl.id ORDER BY ve.row_number, ve.field_name LIMIT 15 ), '[]'::json) as validation_errors, COALESCE(( SELECT json_agg(json_build_object('field', rhd.field_name, 'value', rhd.field_value, 'message', rhd.error_message, 'severity', rhd.severity, 'type', rhd.error_type)) FROM record_history rh JOIN record_history_details rhd ON rhd.history_id = rh.id WHERE (rh.file_log_id = fl.id OR (rh.file_name = fl.file_name AND rh.bank_id = fl.bank_id)) AND rhd.is_valid = false LIMIT 15 ), '[]'::json) as record_history_errors FROM file_logs fl LEFT JOIN banks b ON fl.bank_id = b.id WHERE fl.status IN ('error','validation_error') ORDER BY fl.processed_at DESC LIMIT 20`,
        bankId ? [bankId] : []
      ),
      db.query(
        bankId
          ? `SELECT id, scan_time, errors_count, errors_detail FROM scan_logs WHERE errors_count > 0 AND bank_id = $1 ORDER BY scan_time DESC LIMIT 10`
          : `SELECT id, scan_time, errors_count, errors_detail FROM scan_logs WHERE errors_count > 0 ORDER BY scan_time DESC LIMIT 10`,
        bankId ? [bankId] : []
      )
    ]);

    const summary = {
      unresolved_validation_errors: unresolvedValidations.rows[0]?.count || 0,
      file_processing_errors: fileProcessingErrors.rows.reduce((acc, r) => acc + r.count, 0),
      api_call_errors: apiCallErrors.rows[0]?.total || 0,
      xml_generation_errors: xmlGenerationErrors.rows[0]?.total || 0,
      scan_errors_total: scanErrors.rows[0]?.total || 0,
      failed_notifications: notificationErrors.rows[0]?.total || 0,
      rejected_records: rejectedRecords.rows[0]?.total || 0,
      enrollment_errors: enrollmentErrors.rows[0]?.total || 0,
    };

    res.json({
      success: true,
      data: {
        summary,
        file_errors_by_status: fileProcessingErrors.rows,
        top_field_validation_errors: topFieldErrors.rows,
        recent_file_errors: recentFileErrors.rows,
        recent_scan_errors: recentScanLogs.rows,
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
