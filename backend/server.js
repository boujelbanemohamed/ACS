const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Sentry (APM) — activé via SENTRY_DSN
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
  });
  console.log('Sentry APM initialisé');
}

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
const apiDocsRoutes = require('./routes/apiDocs');
const cronService = require('./services/cronService');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');
const { checkRole, checkFeature, isSuperAdmin } = require('./middleware/roleMiddleware');
const { maskResponseData } = require('./services/encryptionService');

if (!process.env.PAN_ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERREUR CRITIQUE: PAN_ENCRYPTION_KEY non configurée en production!');
    process.exit(1);
  }
  console.warn('⚠️  PAN_ENCRYPTION_KEY non configurée - le PAN est stocké en clair dans la DB');
  console.warn('   Définissez une clé AES-256 sécurisée pour la production.');
}

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

// Derrière un reverse proxy (nginx) : adresse IP réelle du client pour les limites de débit
const parseTrustProxy = (value) => {
  if (value === undefined || value === '') return 'loopback, uniquelocal';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
};
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

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

// Logging des requêtes : l'URL journalisée ne contient ni jeton ni numéro de carte
morgan.token('safe-url', (req) => (req.originalUrl || req.url || '')
  .replace(/([?&](token|api_key|apikey|key|pan)=)[^&]*/gi, '$1***')
  .replace(/\d{12,19}/g, (digits) => '*'.repeat(digits.length - 4) + digits.slice(-4)));
if (process.env.NODE_ENV === 'production') {
  app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
} else {
  app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));
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

// Anti force brute : échecs de connexion comptés par adresse IP (les connexions réussies ne comptent pas)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 30,
  skipSuccessfulRequests: true,
  skip: require('./utils/passwordPolicy').rateLimitDisabled,
  message: { success: false, message: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);

// Production error sanitizer — masque les messages d'erreur interne dans les réponses 5xx
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 500 && body) {
        body.message = 'Erreur serveur interne';
        delete body.error;
        delete body.stack;
      }
      return originalJson(body);
    };
  }
  next();
});

// PAN masking middleware - masque automatiquement tous les PAN dans les réponses JSON
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.locals.skipMask) {
      return originalJson(body);
    }
    return originalJson(maskResponseData(body));
  };
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/banks', authMiddleware, checkFeature('banks'), banksRoutes);
app.use('/api/processing', authMiddleware, checkFeature('processing'), processingRoutes);
app.use('/api/dashboard', authMiddleware, checkFeature('dashboard'), dashboardRoutes);
app.use('/api/records', authMiddleware, checkFeature('records'), recordsRoutes);
app.use('/api/settings', authMiddleware, checkFeature('settings'), settingsRoutes);
app.use('/api/xml-logs', authMiddleware, checkFeature('xml_logs'), xmlLogsRoutes);
app.use('/api/history', authMiddleware, checkFeature('history'), historyRoutes);
app.use('/api/v1', publicApiRoutes);
app.use('/api/record-history', authMiddleware, checkFeature('history'), recordHistoryRoutes);
app.use('/api/api-keys', authMiddleware, checkFeature('api_keys'), apiKeysRoutes);
app.use('/api/users', authMiddleware, checkFeature('users'), usersRoutes);
app.use('/api/enrollment', authMiddleware, checkFeature('enrollment'), enrollmentRoutes);
app.use('/api/notifications', authMiddleware, checkFeature('notifications'), notificationsRoutes);
app.use('/api/scanner', authMiddleware, checkFeature('cron'), require('./routes/scanner'));
app.use('/api/monitoring', authMiddleware, checkFeature('monitoring'), require('./routes/monitoring'));
app.use('/api/audit-logs', authMiddleware, checkFeature('audit_logs'), require('./routes/audit'));
app.use('/api/role-features', authMiddleware, require('./routes/roleFeatures'));
app.use('/api/api-docs', authMiddleware, isSuperAdmin, apiDocsRoutes);
app.use('/api/platform-tests', authMiddleware, isSuperAdmin, require('./routes/platformTests'));
// Le suivi de navigation (POST /track) est ouvert à tout utilisateur connecté ; le reste du flux est réservé au super_admin
app.use('/api/live', authMiddleware, (req, res, next) => (
  req.method === 'POST' && req.path === '/track' ? next() : isSuperAdmin(req, res, next)
), require('./routes/live'));

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
      message: process.env.NODE_ENV === 'production' ? 'Erreur de connexion a la base de donnees' : error.message
    });
  }
});

// 404 handler
app.use(notFoundHandler);

// Sentry error handler (must be before the global error handler)
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  app.use(Sentry.Handlers.errorHandler());
}

// Error handler global
app.use(errorHandler);

// Start server
let server;
const startServer = async () => {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('Database connection established');

    // Migrations SQL en attente + recalcul des empreintes de PAN (une seule instance à la fois)
    await require('./services/startupTasks').runStartupTasks();
    
    if (process.env.NODE_ENV !== 'test') {
      await cronService.createTable();
      cronService.init();
      await require('./services/roleFeaturesService').seedDefaults();
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
  cronService.stop();
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
