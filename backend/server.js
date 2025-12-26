const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
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
const apiKeysRoutes = require('./routes/apiKeys');
const FileScanner = require('./services/fileScanner');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize file scanner
const fileScanner = new FileScanner();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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
app.use('/api/api-keys', apiKeysRoutes);

// Cron and scanning routes
app.get('/api/scanner/status', async (req, res) => {
  try {
    const stats = await fileScanner.getStats();
    res.json({
      success: true,
      data: {
        ...stats,
        cronSchedule: process.env.CRON_SCHEDULE || '*/5 * * * *',
        cronDescription: getCronDescription(process.env.CRON_SCHEDULE || '*/5 * * * *'),
        timezone: process.env.TZ || 'Africa/Tunis'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation du statut',
      error: error.message
    });
  }
});

// Manual trigger for scanning (admin only)
app.post('/api/scanner/trigger', async (req, res) => {
  try {
    // Check authentication
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    console.log('Manual scan triggered via API');
    const results = await fileScanner.scanAllBanks();
    
    res.json({
      success: true,
      message: 'Scan manuel termine',
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors du scan manuel',
      error: error.message
    });
  }
});

// Get scan logs
app.get('/api/scanner/logs', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    const query = `
      SELECT * FROM scan_logs 
      ORDER BY scan_time DESC 
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des logs',
      error: error.message
    });
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
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvee'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: 'Erreur de telechargement de fichier',
      error: err.message
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur serveur interne',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Automated file checking (runs every 5 minutes by default)
const scheduleAutomatedProcessing = () => {
  let cronSchedule = process.env.CRON_SCHEDULE || '*/5 * * * *';
  
  console.log('Configuring automated file scanning...');
  console.log(`Schedule: ${cronSchedule} (${getCronDescription(cronSchedule)})`);
  
  // Validate cron expression
  if (!cron.validate(cronSchedule)) {
    console.error('Invalid cron schedule expression:', cronSchedule);
    console.error('Using default: */5 * * * * (every 5 minutes)');
    cronSchedule = '*/5 * * * *';
  }
  
  // Schedule the task
  const scheduledTask = cron.schedule(cronSchedule, async () => {
    console.log('\n' + '='.repeat(70));
    console.log('Cron triggered at:', new Date().toISOString());
    console.log('='.repeat(70));
    
    try {
      await fileScanner.scanAllBanks();
    } catch (error) {
      console.error('Automated scan failed:', error);
    }
  }, {
    scheduled: true,
    timezone: process.env.TZ || "Africa/Tunis"
  });
  
  console.log('Automated file scanning scheduled successfully');
  console.log(`Timezone: ${process.env.TZ || "Africa/Tunis"}`);
  console.log('First scan will run according to schedule');
  
  return scheduledTask;
};

/**
 * Get human-readable description of cron schedule
 */
const getCronDescription = (schedule) => {
  const patterns = {
    '*/1 * * * *': 'every minute',
    '*/5 * * * *': 'every 5 minutes',
    '*/10 * * * *': 'every 10 minutes',
    '*/15 * * * *': 'every 15 minutes',
    '*/30 * * * *': 'every 30 minutes',
    '0 * * * *': 'every hour',
    '0 */2 * * *': 'every 2 hours',
    '0 */6 * * *': 'every 6 hours',
    '0 0 * * *': 'every day at midnight'
  };
  
  return patterns[schedule] || 'custom schedule';
};

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await db.query('SELECT NOW()');
    console.log('Database connection established');
    
    // Create scan_logs table if needed
    await fileScanner.createScanLogsTable();
    
    // Start automated processing
    if (process.env.NODE_ENV !== 'test') {
      const scheduledTask = scheduleAutomatedProcessing();
      
      // Optional: Run initial scan on startup
      if (process.env.SCAN_ON_STARTUP === 'true') {
        console.log('\nRunning initial scan on startup...\n');
        setTimeout(async () => {
          try {
            await fileScanner.scanAllBanks();
          } catch (error) {
            console.error('Initial scan failed:', error);
          }
        }, 5000); // Wait 5 seconds after startup
      }
    }
    
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(70));
      console.log('Banking CSV Processor Server Started');
      console.log('='.repeat(70));
      console.log(`Port: ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`API: http://localhost:${PORT}/api`);
      console.log(`Cron: ${process.env.CRON_SCHEDULE || '*/5 * * * *'} (${getCronDescription(process.env.CRON_SCHEDULE || '*/5 * * * *')})`);
      console.log(`Timezone: ${process.env.TZ || 'Africa/Tunis'}`);
      console.log('='.repeat(70) + '\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await db.pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await db.pool.end();
  process.exit(0);
});

startServer();

module.exports = app;
