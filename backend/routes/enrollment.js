const express = require('express');
const multer = require('multer');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { checkRole } = require('../middleware/roleMiddleware');
const enrollmentService = require('../services/enrollmentService');

const router = express.Router();

// Configuration multer pour upload XML
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/xml' || file.mimetype === 'application/xml' || file.originalname.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers XML sont autorises'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Upload et traitement d'un rapport d'enrolement (super_admin uniquement)
router.post('/upload', authMiddleware, checkRole('super_admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni'
      });
    }
    
    const { bankId } = req.body;
    const xmlContent = req.file.buffer.toString('utf8');
    const fileName = req.file.originalname;
    
    const result = await enrollmentService.processEnrollmentReportFromContent(
      xmlContent, 
      bankId ? parseInt(bankId) : null, 
      fileName
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error uploading enrollment report:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement du fichier',
      error: error.message
    });
  }
});

// Obtenir les statistiques d'enrolement
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { bankId } = req.query;
    
    // Si utilisateur banque, forcer son bankId
    let filterBankId = bankId;
    if (req.user.role === 'bank' && req.user.bank_id) {
      filterBankId = req.user.bank_id;
    }
    
    const stats = await enrollmentService.getEnrollmentStats(filterBankId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting enrollment stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des statistiques'
    });
  }
});

// Obtenir les logs d'enrolement
router.get('/logs', authMiddleware, async (req, res) => {
  try {
    const { bankId, limit = 50, offset = 0 } = req.query;
    
    // Si utilisateur banque, forcer son bankId
    let filterBankId = bankId;
    if (req.user.role === 'bank' && req.user.bank_id) {
      filterBankId = req.user.bank_id;
    }
    
    const logs = await enrollmentService.getEnrollmentLogs(
      filterBankId, 
      parseInt(limit), 
      parseInt(offset)
    );
    
    // Compter le total
    let countQuery = 'SELECT COUNT(*) FROM enrollment_logs';
    const countParams = [];
    if (filterBankId) {
      countQuery += ' WHERE bank_id = $1';
      countParams.push(filterBankId);
    }
    const countResult = await db.query(countQuery, countParams);
    
    res.json({
      success: true,
      data: logs,
      total: parseInt(countResult.rows[0].count)
    });
  } catch (error) {
    console.error('Error getting enrollment logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation des logs'
    });
  }
});

// Obtenir le detail d'un log d'enrolement
router.get('/logs/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT el.*, b.name as bank_name, b.code as bank_code
      FROM enrollment_logs el
      JOIN banks b ON el.bank_id = b.id
      WHERE el.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Log non trouve'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting enrollment log:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recuperation du log'
    });
  }
});

module.exports = router;
