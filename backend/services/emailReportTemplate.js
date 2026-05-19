function generateReportHtml(bankName, stats) {
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

module.exports = { generateReportHtml };
