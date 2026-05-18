const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/database');
const authRoutes = require('./routes/auth');
const banksRoutes = require('./routes/banks');
const processingRoutes = require('./routes/processing');
const dashboardRoutes = require('./routes/dashboard');
const recordsRoutes = require('./routes/records');
const settingsRoutes = require('./routes/settings');
const xmlLogsRoutes = require('./routes/xmlLogs');
const historyRoutes = require('./routes/history');
const publicApiRoutes = require('./routes/publicApi');
const recordHistoryRoutes = require('./routes/recordHistory');
const apiKeysRoutes = require('./routes/apiKeys');
const usersRoutes = require('./routes/users');
const enrollmentRoutes = require('./routes/enrollment');
const notificationsRoutes = require('./routes/notifications');
const cronService = require('./services/cronService');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');
const { checkRole } = require('./middleware/roleMiddleware');

if (!process.env.JWT_SECRET) {
  console.error('ERREUR CRITIQUE: JWT_SECRET non configuré!');
  console.error('Définissez une variable JWT_SECRET sécurisée avant de démarrer.');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('ERREUR CRITIQUE: JWT_SECRET trop court (min 32 caractères)!');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Sécurité HTTP headers
app.use(helmet({
  crossOriginEmbedderPolicy: false
}));

// Compression des réponses
app.use(compression());

// Logging des requêtes (format différent selon l'environnement)
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de tentatives de connexion, veuillez réessayer dans une minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);



// Routes
app.use('/api/auth', authRoutes);
app.use('/api/banks', banksRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/xml-logs', xmlLogsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/v1', publicApiRoutes);
app.use('/api/record-history', recordHistoryRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/notifications', notificationsRoutes);

// Scan routes
app.get('/api/scanner/status', (req, res) => {
  res.json({ success: true, data: cronService.getStatus() });
});

app.post('/api/scanner/trigger', authMiddleware, checkRole('super_admin'), async (req, res) => {
  try {
    const results = await cronService.run();
    res.json({ success: true, message: 'Scan terminé', data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur scan', error: error.message });
  }
});

app.get('/api/scanner/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const result = await db.query('SELECT * FROM scan_logs ORDER BY scan_time DESC LIMIT $1 OFFSET $2', [limit, offset]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur logs', error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      success: true,
      message: 'API et base de donnees operationnelles',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Erreur de connexion a la base de donnees',
      error: error.message
    });
  }
});

// 404 handler
app.use(notFoundHandler);

// Error handler global
app.use(errorHandler);

// Start server
let server;
const startServer = async () => {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('Database connection established');
    
    if (process.env.NODE_ENV !== 'test') {
      await cronService.createTable();
      cronService.init();
    }
    
    server = app.listen(PORT, () => {
      console.log(`\nServer started on port ${PORT} | ${process.env.NODE_ENV || 'development'}`);
      console.log(`Scanner: ${cronService.schedule} (${cronService.describeCron(cronService.schedule)}) | ${cronService.enabled ? '✅ Enabled' : '🔴 Disabled'}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });
  }
  await db.pool.end();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

module.exports = app;
