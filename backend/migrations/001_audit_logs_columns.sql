-- 001: Add user_role and bank_id columns to audit_logs
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_role VARCHAR(20);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS bank_id INTEGER REFERENCES banks(id) ON DELETE SET NULL;
