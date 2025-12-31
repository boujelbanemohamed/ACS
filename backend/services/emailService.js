const nodemailer = require('nodemailer');
const db = require('../config/database');

class EmailService {
  constructor() {
    this.transporter = null;
  }

  // Charger la configuration SMTP
  async loadConfig() {
    try {
      const result = await db.query('SELECT * FROM smtp_config LIMIT 1');
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error loading SMTP config:', error);
      return null;
    }
  }

  // Créer le transporteur SMTP
  async createTransporter() {
    const config = await this.loadConfig();
    if (!config || !config.enabled) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.username ? {
        user: config.username,
        pass: config.password
      } : undefined
    });

    return this.transporter;
  }

  // Envoyer un email
  async sendEmail(to, subject, htmlContent, textContent) {
    try {
      const config = await this.loadConfig();
      if (!config || !config.enabled) {
        console.log('SMTP not enabled, skipping email');
        return { success: false, message: 'SMTP non configuré' };
      }

      const transporter = await this.createTransporter();
      if (!transporter) {
        return { success: false, message: 'Impossible de créer le transporteur SMTP' };
      }

      const mailOptions = {
        from: `"${config.from_name}" <${config.from_email}>`,
        to: to,
        subject: subject,
        text: textContent || '',
        html: htmlContent
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, message: error.message };
    }
  }

  // Tester la connexion SMTP
  async testConnection() {
    try {
      const transporter = await this.createTransporter();
      if (!transporter) {
        return { success: false, message: 'SMTP non configuré ou désactivé' };
      }

      await transporter.verify();
      return { success: true, message: 'Connexion SMTP réussie' };
    } catch (error) {
      console.error('SMTP connection test failed:', error);
      return { success: false, message: error.message };
    }
  }

  // Obtenir les statistiques quotidiennes d'une banque
  async getDailyStats(bankId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      // Stats CSV traités
      const csvStats = await db.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(*) FILTER (WHERE enrollment_status = 'success') as enrollment_success,
          COUNT(*) FILTER (WHERE enrollment_status = 'error') as enrollment_error,
          COUNT(*) FILTER (WHERE enrollment_status = 'pending') as enrollment_pending
        FROM processed_records
        WHERE bank_id = $1
        AND processed_at >= $2 AND processed_at <= $3
      `, [bankId, startOfDay, endOfDay]);

      // Stats fichiers traités
      const fileStats = await db.query(`
        SELECT 
          COUNT(*) as total_files,
          SUM(records_count) as total_lines
        FROM file_history
        WHERE bank_id = $1
        AND processed_at >= $2 AND processed_at <= $3
        AND status = 'completed'
      `, [bankId, startOfDay, endOfDay]);

      // Stats XML générés
      const xmlStats = await db.query(`
        SELECT 
          COUNT(*) as total_xml,
          SUM(records_count) as total_xml_records
        FROM xml_generation_logs
        WHERE bank_id = $1
        AND created_at >= $2 AND created_at <= $3
        AND status = 'success'
      `, [bankId, startOfDay, endOfDay]);

      return {
        date: date,
        csv: {
          totalRecords: parseInt(csvStats.rows[0].total_records) || 0,
          enrollmentSuccess: parseInt(csvStats.rows[0].enrollment_success) || 0,
          enrollmentError: parseInt(csvStats.rows[0].enrollment_error) || 0,
          enrollmentPending: parseInt(csvStats.rows[0].enrollment_pending) || 0
        },
        files: {
          totalFiles: parseInt(fileStats.rows[0].total_files) || 0,
          totalLines: parseInt(fileStats.rows[0].total_lines) || 0
        },
        xml: {
          totalXml: parseInt(xmlStats.rows[0].total_xml) || 0,
          totalRecords: parseInt(xmlStats.rows[0].total_xml_records) || 0
        }
      };
    } catch (error) {
      console.error('Error getting daily stats:', error);
      return null;
    }
  }

  // Générer le contenu HTML du rapport
  generateReportHtml(bankName, stats) {
    const date = new Date(stats.date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 10px 0 0; opacity: 0.9; }
    .content { padding: 30px; }
    .section { margin-bottom: 25px; }
    .section-title { font-size: 16px; font-weight: bold; color: #374151; margin-bottom: 15px; border-bottom: 2px solid #667eea; padding-bottom: 8px; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
    .stat-card { background: #f9fafb; border-radius: 8px; padding: 15px; text-align: center; }
    .stat-card.success { background: #d1fae5; }
    .stat-card.error { background: #fee2e2; }
    .stat-card.warning { background: #fef3c7; }
    .stat-card.info { background: #dbeafe; }
    .stat-value { font-size: 28px; font-weight: bold; color: #1f2937; }
    .stat-card.success .stat-value { color: #065f46; }
    .stat-card.error .stat-value { color: #991b1b; }
    .stat-card.warning .stat-value { color: #92400e; }
    .stat-card.info .stat-value { color: #1e40af; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 5px; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Rapport Quotidien ACS</h1>
      <p>${bankName} - ${date}</p>
    </div>
    <div class="content">
      <div class="section">
        <div class="section-title">Fichiers CSV Traités</div>
        <div class="stats-grid">
          <div class="stat-card info">
            <div class="stat-value">${stats.files.totalFiles}</div>
            <div class="stat-label">Fichiers traités</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.csv.totalRecords}</div>
            <div class="stat-label">Lignes valides</div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">Statut Enrôlement</div>
        <div class="stats-grid">
          <div class="stat-card success">
            <div class="stat-value">${stats.csv.enrollmentSuccess}</div>
            <div class="stat-label">Enrôlements OK</div>
          </div>
          <div class="stat-card error">
            <div class="stat-value">${stats.csv.enrollmentError}</div>
            <div class="stat-label">Enrôlements échoués</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-value">${stats.csv.enrollmentPending}</div>
            <div class="stat-label">En attente</div>
          </div>
          <div class="stat-card info">
            <div class="stat-value">${stats.xml.totalXml}</div>
            <div class="stat-label">Fichiers XML générés</div>
          </div>
        </div>
      </div>
    </div>
    <div class="footer">
      <p>Ce rapport a été généré automatiquement par le système ACS Banking.</p>
      <p>Ne pas répondre à cet email.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Envoyer le rapport quotidien à une banque
  async sendDailyReport(bankId, date = new Date()) {
    try {
      // Récupérer les infos de la banque
      const bankResult = await db.query('SELECT * FROM banks WHERE id = $1', [bankId]);
      if (bankResult.rows.length === 0) {
        return { success: false, message: 'Banque non trouvée' };
      }
      const bank = bankResult.rows[0];

      // Récupérer les emails de notification
      const emailsResult = await db.query(
        'SELECT email FROM bank_notification_emails WHERE bank_id = $1 AND is_active = true',
        [bankId]
      );
      
      if (emailsResult.rows.length === 0) {
        return { success: false, message: 'Aucun email configuré pour cette banque' };
      }

      // Obtenir les stats
      const stats = await this.getDailyStats(bankId, date);
      if (!stats) {
        return { success: false, message: 'Erreur lors de la récupération des statistiques' };
      }

      // Générer le contenu
      const htmlContent = this.generateReportHtml(bank.name, stats);
      const subject = `[ACS] Rapport quotidien - ${bank.name} - ${date.toLocaleDateString('fr-FR')}`;

      // Envoyer à chaque email
      const results = [];
      for (const row of emailsResult.rows) {
        const result = await this.sendEmail(row.email, subject, htmlContent);
        
        // Logger
        await db.query(`
          INSERT INTO notification_logs (bank_id, email, subject, status, error_message)
          VALUES ($1, $2, $3, $4, $5)
        `, [bankId, row.email, subject, result.success ? 'sent' : 'failed', result.message || null]);

        results.push({ email: row.email, ...result });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error sending daily report:', error);
      return { success: false, message: error.message };
    }
  }

  // Envoyer les rapports quotidiens à toutes les banques
  async sendAllDailyReports(date = new Date()) {
    try {
      const banksResult = await db.query('SELECT id, name FROM banks WHERE is_active = true');
      const results = [];

      for (const bank of banksResult.rows) {
        const result = await this.sendDailyReport(bank.id, date);
        results.push({ bankId: bank.id, bankName: bank.name, ...result });
      }

      return { success: true, results };
    } catch (error) {
      console.error('Error sending all daily reports:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new EmailService();
