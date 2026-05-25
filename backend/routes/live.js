const express = require('express');
const router = express.Router();
const liveEventService = require('../services/liveEventService');
const db = require('../config/database');
const { describeAction } = require('../services/auditService');

const MAX_EVENTS_INITIAL = 200;

router.get('/stream', (req, res) => {
  if (typeof req.destroyed !== 'undefined' && req.destroyed) return;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const recentEvents = liveEventService.recentEvents.slice(-MAX_EVENTS_INITIAL);
  for (const event of recentEvents) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  liveEventService.addClient(res);

  const keepAlive = setInterval(() => {
    if (req.destroyed) {
      clearInterval(keepAlive);
      return;
    }
    res.write(':keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    liveEventService.removeClient(res);
  });

  req.on('error', () => {
    clearInterval(keepAlive);
    liveEventService.removeClient(res);
  });
});

router.post('/track', async (req, res) => {
  try {
    const { page, action, details } = req.body;
    const description = `${req.user.username} est sur ${page}${details ? ` - ${details}` : ''}`;
    const event = liveEventService.emitEvent({
      type: 'page_view',
      userId: req.user.id,
      username: req.user.username,
      userRole: req.user.role,
      action: action || 'PAGE_VIEW',
      tableName: null,
      recordId: null,
      bankId: req.user.bank_id,
      ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
      description,
      page
    });
    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Track event error:', error);
    res.status(500).json({ success: false, message: 'Erreur de tracking' });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await db.query(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );

    const events = result.rows.map(row => ({
      id: row.id,
      type: 'audit',
      userId: row.user_id,
      username: row.username,
      userRole: row.user_role,
      action: row.action,
      tableName: row.table_name,
      recordId: row.record_id,
      bankId: row.bank_id,
      ipAddress: row.ip_address,
      description: describeAction(row.action, row.table_name, row.username),
      timestamp: row.created_at
    }));

    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Recent events error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des événements' });
  }
});

module.exports = router;
