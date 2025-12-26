const nodemailer = require('nodemailer');
const db = require('../config/database');

let transporter = null;

// Initialiser le transporteur email
const initTransporter = async () => {
  try {
    const config = await db.query('SELECT * FROM email_config WHERE is_active = true LIMIT 1');
    
    if (config.rows.length === 0) {
      console.log('Email: Aucune configuration active');
      return null;
    }

    const emailConfig = config.rows[0];

    transporter = nodemailer.createTransport({
      host: emailConfig.smtp_host,
      port: emailConfig.smtp_port,
      secure: emailConfig.smtp_secure,
      auth: {
        user: emailConfig.smtp_user,
        pass: emailConfig.smtp_password
      }
    });

    console.log('Email: Transporteur initialise');
    return transporter;
  } catch (error) {
    console.error('Email init error:', error);
    return null;
  }
};

// Envoyer un email
const sendEmail = async (to, subject, html, text) => {
  try {
    if (!transporter) {
      await initTransporter();
    }

    if (!transporter) {
      console.log('Email: Pas de transporteur configure');
      return false;
    }

    const config = await db.query('SELECT from_email, from_name FROM email_config WHERE is_active = true LIMIT 1');
    const fromEmail = config.rows[0]?.from_email || 'noreply@acs-banking.com';
    const fromName = config.rows[0]?.from_name || 'ACS Banking';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html
    });

    console.log('Email envoye:', info.messageId);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

// Créer une notification
const createNotification = async (userId, bankId, type, title, message, sendEmailNotif = true) => {
  try {
    const result = await db.query(
      `INSERT INTO notifications (user_id, bank_id, type, title, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, bankId, type, title, message]
    );

    if (sendEmailNotif) {
      // Vérifier les préférences de l'utilisateur
      const prefs = await db.query(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId]
      );

      const user = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
      
      if (user.rows[0]?.email) {
        let shouldSend = true;
        
        if (prefs.rows.length > 0) {
          const p = prefs.rows[0];
          if (type === 'file_processed' && !p.email_on_file_processed) shouldSend = false;
          if (type === 'validation_error' && !p.email_on_validation_error) shouldSend = false;
          if (type === 'xml_generated' && !p.email_on_xml_generated) shouldSend = false;
          if (type === 'login' && !p.email_on_login) shouldSend = false;
        }

        if (shouldSend) {
          const emailSent = await sendEmail(
            user.rows[0].email,
            title,
            `<h2>${title}</h2><p>${message}</p>`,
            message
          );

          if (emailSent) {
            await db.query(
              'UPDATE notifications SET is_email_sent = true, email_sent_at = CURRENT_TIMESTAMP WHERE id = $1',
              [result.rows[0].id]
            );
          }
        }
      }
    }

    return result.rows[0].id;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

// Templates d'email
const emailTemplates = {
  fileProcessed: (fileName, bankName, stats) => ({
    subject: `Fichier traite: ${fileName}`,
    html: `
      <h2>Fichier traite avec succes</h2>
      <p><strong>Fichier:</strong> ${fileName}</p>
      <p><strong>Banque:</strong> ${bankName}</p>
      <h3>Statistiques:</h3>
      <ul>
        <li>Lignes totales: ${stats.totalRows}</li>
        <li>Lignes valides: ${stats.validRows}</li>
        <li>Lignes invalides: ${stats.invalidRows}</li>
        <li>Doublons: ${stats.duplicateRows}</li>
      </ul>
    `
  }),

  validationError: (fileName, bankName, errors) => ({
    subject: `Erreurs de validation: ${fileName}`,
    html: `
      <h2>Erreurs de validation detectees</h2>
      <p><strong>Fichier:</strong> ${fileName}</p>
      <p><strong>Banque:</strong> ${bankName}</p>
      <p><strong>Nombre d'erreurs:</strong> ${errors.length}</p>
      <p>Connectez-vous a l'application pour corriger les erreurs.</p>
    `
  }),

  xmlGenerated: (xmlFileName, bankName, recordsCount) => ({
    subject: `XML genere: ${xmlFileName}`,
    html: `
      <h2>Fichier XML genere</h2>
      <p><strong>Fichier:</strong> ${xmlFileName}</p>
      <p><strong>Banque:</strong> ${bankName}</p>
      <p><strong>Enregistrements:</strong> ${recordsCount}</p>
    `
  }),

  newLogin: (username, ip, date) => ({
    subject: 'Nouvelle connexion a votre compte',
    html: `
      <h2>Nouvelle connexion detectee</h2>
      <p><strong>Utilisateur:</strong> ${username}</p>
      <p><strong>Adresse IP:</strong> ${ip}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p>Si ce n'est pas vous, contactez immediatement l'administrateur.</p>
    `
  })
};

module.exports = {
  initTransporter,
  sendEmail,
  createNotification,
  emailTemplates
};
