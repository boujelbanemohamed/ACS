const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all settings
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if settings table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'settings'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      // Create settings table if not exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          key VARCHAR(100) UNIQUE NOT NULL,
          value TEXT,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Insert default settings
      await db.query(`
        INSERT INTO settings (key, value, description) VALUES
          ('cron_schedule', '*/5 * * * *', 'Planification CRON'),
          ('cron_enabled', 'true', 'Activer le scan automatique'),
          ('scan_timezone', 'Africa/Tunis', 'Fuseau horaire'),
          ('auto_archive', 'true', 'Archivage automatique'),
          ('max_files_per_scan', '100', 'Max fichiers par scan')
        ON CONFLICT (key) DO NOTHING
      `);
    }
    
    const result = await db.query('SELECT * FROM settings ORDER BY key');
    
    // Convert to object
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des parametres',
      error: error.message
    });
  }
});

// Update setting
router.put('/:key', authMiddleware, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const query = `
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) 
      DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await db.query(query, [key, value]);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Parametre mis a jour avec succes'
    });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise a jour',
      error: error.message
    });
  }
});

// Bulk update settings
router.post('/bulk', authMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;

    for (const [key, value] of Object.entries(settings)) {
      await db.query(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
    }

    res.json({
      success: true,
      message: 'Parametres mis a jour avec succes'
    });
  } catch (error) {
    console.error('Bulk update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise a jour',
      error: error.message
    });
  }
});

module.exports = router;
