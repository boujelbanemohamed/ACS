const db = require('../config/database');

const DEFAULT_FEATURES = {
  bank_admin: {
    dashboard: true,
    banks: true,
    processing: true,
    records: true,
    history: true,
    xml_logs: true,
    enrollment: true,
    api_keys: false,
    users: true,
    audit_logs: true,
    cron: false,
    notifications: false,
    monitoring: false,
    settings: false,
  },
  bank: {
    dashboard: true,
    banks: true,
    processing: true,
    records: true,
    history: true,
    xml_logs: true,
    enrollment: true,
    api_keys: false,
    users: false,
    audit_logs: true,
    cron: false,
    notifications: false,
    monitoring: false,
    settings: false,
  },
};

class RoleFeaturesService {
  async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS role_features (
        id SERIAL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        feature VARCHAR(50) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(role, feature)
      )
    `);
  }

  async seedDefaults() {
    await this.ensureTable();
    for (const [role, features] of Object.entries(DEFAULT_FEATURES)) {
      for (const [feature, enabled] of Object.entries(features)) {
        await db.query(
          `INSERT INTO role_features (role, feature, enabled)
           VALUES ($1, $2, $3)
           ON CONFLICT (role, feature) DO NOTHING`,
          [role, feature, enabled]
        );
      }
    }
  }

  async getAll() {
    await this.ensureTable();
    const result = await db.query('SELECT * FROM role_features ORDER BY role, feature');
    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.role]) grouped[row.role] = {};
      grouped[row.role][row.feature] = row.enabled;
    }
    return grouped;
  }

  async getFeature(role, feature) {
    await this.ensureTable();
    const result = await db.query(
      'SELECT enabled FROM role_features WHERE role = $1 AND feature = $2',
      [role, feature]
    );
    if (result.rows.length === 0) return true;
    return result.rows[0].enabled;
  }

  async setFeature(role, feature, enabled) {
    await this.ensureTable();
    await db.query(
      `INSERT INTO role_features (role, feature, enabled, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (role, feature)
       DO UPDATE SET enabled = $3, updated_at = CURRENT_TIMESTAMP`,
      [role, feature, enabled]
    );
  }

  async checkAccess(role, feature) {
    if (role === 'super_admin') return true;
    const result = await db.query(
      'SELECT enabled FROM role_features WHERE role = $1 AND feature = $2',
      [role, feature]
    );
    if (result.rows.length === 0) return true;
    return result.rows[0].enabled;
  }
}

module.exports = new RoleFeaturesService();
