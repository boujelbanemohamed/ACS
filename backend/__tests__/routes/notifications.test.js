const express = require('express');
const request = require('supertest');

const mockEmailService = {
  testConnection: jest.fn(),
  sendDailyReport: jest.fn(),
  sendAllDailyReports: jest.fn()
};

const mockCronService = {
  dailyReportSchedule: '0 8 * * *',
  dailyReportEnabled: true,
  startDailyReportTask: jest.fn()
};

jest.mock('../../config/database');
jest.mock('../../services/emailService', () => mockEmailService);
jest.mock('../../services/cronService', () => mockCronService);
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
const auditService = require('../../services/auditService');
const notificationsRoutes = require('../../routes/notifications');

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-here!!!';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRoutes);
  return app;
}

describe('Notifications Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/notifications/smtp', () => {
    it('returns SMTP config for super_admin', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, host: 'smtp.test.com', port: 587, secure: false, username: 'user', from_email: 'noreply@test.com', from_name: 'ACS', enabled: true }] });
      const res = await request(createTestApp())
        .get('/api/notifications/smtp')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.host).toBe('smtp.test.com');
    });

    it('returns null when no SMTP config', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const res = await request(createTestApp())
        .get('/api/notifications/smtp')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('blocks non-super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/notifications/smtp')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank');
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/notifications/smtp', () => {
    it('updates SMTP config', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({});
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/notifications/smtp')
        .send({ host: 'smtp.new.com', port: 587, secure: false, username: 'user', from_email: 'noreply@new.com', from_name: 'ACS', enabled: true })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('creates SMTP config if none exists', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/notifications/smtp')
        .send({ host: 'smtp.new.com', port: 587, secure: false, username: 'user', password: 'secret', from_email: 'noreply@new.com', from_name: 'ACS', enabled: true })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/notifications/smtp/test', () => {
    it('tests SMTP connection', async () => {
      auditService.logAction.mockResolvedValue();
      mockEmailService.testConnection.mockResolvedValue({ success: true, message: 'Connection OK' });
      const res = await request(createTestApp())
        .post('/api/notifications/smtp/test')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/notifications/emails/:bankId', () => {
    it('returns notification emails for bank', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'alert@bank.com', bank_id: 1, is_active: true }] });
      const res = await request(createTestApp())
        .get('/api/notifications/emails/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('blocks bank user accessing other bank', async () => {
      const res = await request(createTestApp())
        .get('/api/notifications/emails/2')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '1');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/notifications/emails/:bankId', () => {
    it('adds notification email', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, email: 'new@bank.com', bank_id: 1 }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .post('/api/notifications/emails/1')
        .send({ email: 'new@bank.com' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });

    it('rejects invalid email', async () => {
      const res = await request(createTestApp())
        .post('/api/notifications/emails/1')
        .send({ email: 'invalid' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
    });

    it('rejects duplicate email', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await request(createTestApp())
        .post('/api/notifications/emails/1')
        .send({ email: 'existing@bank.com' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/notifications/emails/:id', () => {
    it('deletes notification email', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, email: 'old@bank.com' }] })
        .mockResolvedValueOnce({});
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .delete('/api/notifications/emails/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/notifications/emails/:id/toggle', () => {
    it('toggles notification email active status', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, email: 'test@bank.com', is_active: false }] });
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/notifications/emails/1/toggle')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/notifications/send/:bankId', () => {
    it('sends daily report for bank', async () => {
      auditService.logAction.mockResolvedValue();
      mockEmailService.sendDailyReport.mockResolvedValue({ success: true, message: 'Sent' });
      const res = await request(createTestApp())
        .post('/api/notifications/send/1')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/notifications/send-all', () => {
    it('sends reports to all banks', async () => {
      auditService.logAction.mockResolvedValue();
      mockEmailService.sendAllDailyReports.mockResolvedValue({ success: true, sent: 5 });
      const res = await request(createTestApp())
        .post('/api/notifications/send-all')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/notifications/logs', () => {
    it('returns notification logs for super_admin', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, bank_id: 1, bank_name: 'Bank A', sent_at: new Date(), status: 'success' }] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const res = await request(createTestApp())
        .get('/api/notifications/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
    });

    it('filters logs by bank for bank user', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });
      const res = await request(createTestApp())
        .get('/api/notifications/logs')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'bank')
        .set('x-test-bank-id', '3');
      expect(res.status).toBe(200);
      expect(db.query.mock.calls[0][0]).toContain('WHERE nl.bank_id = $1');
    });
  });

  describe('GET /api/notifications/cron-config', () => {
    it('returns cron config for super_admin', async () => {
      const res = await request(createTestApp())
        .get('/api/notifications/cron-config')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(res.body.data.schedule).toBe('0 8 * * *');
    });
  });

  describe('PUT /api/notifications/cron-config', () => {
    it('updates cron config', async () => {
      auditService.logAction.mockResolvedValue();
      const res = await request(createTestApp())
        .put('/api/notifications/cron-config')
        .send({ schedule: '0 9 * * *', enabled: true })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(200);
      expect(mockCronService.startDailyReportTask).toHaveBeenCalled();
    });

    it('rejects invalid cron format', async () => {
      const res = await request(createTestApp())
        .put('/api/notifications/cron-config')
        .send({ schedule: 'invalid' })
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'super_admin');
      expect(res.status).toBe(400);
    });
  });
});
