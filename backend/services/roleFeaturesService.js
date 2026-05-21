const db = require('../config/database');

const DEFAULT_FEATURES = {
  bank_admin: {
    dashboard: true, banks: true, processing: true, records: true,
    history: true, xml_logs: true, enrollment: true, api_keys: false,
    users: true, audit_logs: true, cron: false, notifications: false,
    monitoring: false, settings: false, permissions: true,
  },
  bank: {
    dashboard: true, banks: true, processing: true, records: true,
    history: true, xml_logs: true, enrollment: true, api_keys: false,
    users: false, audit_logs: true, cron: false, notifications: false,
    monitoring: false, settings: false, permissions: false,
  },
};

class RoleFeaturesService {
  async ensureTables() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS role_features (
        id SERIAL PRIMARY KEY, role VARCHAR(50) NOT NULL,
        feature VARCHAR(50) NOT NULL, enabled BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(role, feature))
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS bank_features (
        id SERIAL PRIMARY KEY, bank_id INTEGER NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
        feature VARCHAR(50) NOT NULL, enabled BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bank_id, feature))
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_features (
        id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feature VARCHAR(50) NOT NULL, enabled BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, feature))
    `);
  }

  async seedDefaults() {
    await this.ensureTables();
    for (const [role, features] of Object.entries(DEFAULT_FEATURES)) {
      for (const [feature, enabled] of Object.entries(features)) {
        await db.query(
          `INSERT INTO role_features (role, feature, enabled) VALUES ($1, $2, $3)
           ON CONFLICT (role, feature) DO NOTHING`,
          [role, feature, enabled]
        );
      }
    }
  }

  async getAll() {
    await this.ensureTables();
    const roles = await db.query('SELECT * FROM role_features ORDER BY role, feature');
    const banks = await db.query('SELECT bf.*, b.name as bank_name FROM bank_features bf JOIN banks b ON bf.bank_id = b.id ORDER BY b.name, bf.feature');
    const users = await db.query(
      'SELECT uf.*, u.username FROM user_features uf JOIN users u ON uf.user_id = u.id ORDER BY u.username, uf.feature'
    );

    const grouped = {};
    for (const row of roles.rows) {
      if (!grouped.roles) grouped.roles = {};
      if (!grouped.roles[row.role]) grouped.roles[row.role] = {};
      grouped.roles[row.role][row.feature] = row.enabled;
    }
    grouped.banks = banks.rows;
    grouped.users = users.rows;
    return grouped;
  }

  async getEffectiveFeatures(userId, role, bankId) {
    await this.ensureTables();

    const features = Object.keys(DEFAULT_FEATURES.bank_admin);
    const result = {};

    for (const feature of features) {
      // 1. User override
      const uf = await db.query(
        'SELECT enabled FROM user_features WHERE user_id = $1 AND feature = $2',
        [userId, feature]
      );
      if (uf.rows.length > 0) {
        result[feature] = uf.rows[0].enabled;
        continue;
      }
      // 2. Bank override
      if (bankId) {
        const bf = await db.query(
          'SELECT enabled FROM bank_features WHERE bank_id = $1 AND feature = $2',
          [bankId, feature]
        );
        if (bf.rows.length > 0) {
          result[feature] = bf.rows[0].enabled;
          continue;
        }
      }
      // 3. Role default
      const rf = await db.query(
        'SELECT enabled FROM role_features WHERE role = $1 AND feature = $2',
        [role, feature]
      );
      result[feature] = rf.rows.length > 0 ? rf.rows[0].enabled : true;
    }
    return result;
  }

  async setRoleFeature(role, feature, enabled) {
    await this.ensureTables();
    await db.query(
      `INSERT INTO role_features (role, feature, enabled, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (role, feature) DO UPDATE SET enabled = $3, updated_at = CURRENT_TIMESTAMP`,
      [role, feature, enabled]
    );
  }

  async setBankFeature(bankId, feature, enabled) {
    await this.ensureTables();
    await db.query(
      `INSERT INTO bank_features (bank_id, feature, enabled, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (bank_id, feature) DO UPDATE SET enabled = $3, updated_at = CURRENT_TIMESTAMP`,
      [bankId, feature, enabled]
    );
  }

  async setUserFeature(userId, feature, enabled) {
    await this.ensureTables();
    await db.query(
      `INSERT INTO user_features (user_id, feature, enabled, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, feature) DO UPDATE SET enabled = $3, updated_at = CURRENT_TIMESTAMP`,
      [userId, feature, enabled]
    );
  }

  async deleteBankFeature(bankId, feature) {
    await db.query('DELETE FROM bank_features WHERE bank_id = $1 AND feature = $2', [bankId, feature]);
  }

  async deleteUserFeature(userId, feature) {
    await db.query('DELETE FROM user_features WHERE user_id = $1 AND feature = $2', [userId, feature]);
  }

  async resetDefaults() {
    await db.query('DELETE FROM bank_features');
    await db.query('DELETE FROM user_features');
    await db.query('DELETE FROM role_features');
    await this.seedDefaults();
  }
}

module.exports = new RoleFeaturesService();
