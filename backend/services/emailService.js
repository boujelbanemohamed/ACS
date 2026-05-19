const nodemailer = require('nodemailer');
const db = require('../config/database');
const { generateReportHtml } = require('./emailReportTemplate');

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
    return generateReportHtml(bankName, stats);
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
module.exports.EmailService = EmailService;
