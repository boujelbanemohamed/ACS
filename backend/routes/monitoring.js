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

router.get('/health', authMiddleware, superAdminOnly, async (req, res) => {
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

module.exports = router;
