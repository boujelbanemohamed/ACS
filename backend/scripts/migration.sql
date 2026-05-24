-- Migration: add reset_token fields to users + create audit_logs if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;

-- Ensure audit_logs and updated_rows are present
ALTER TABLE file_logs ADD COLUMN IF NOT EXISTS updated_rows INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(100),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    record_id INTEGER,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Add bank_id to scan_logs for bank-level permissions
ALTER TABLE scan_logs ADD COLUMN IF NOT EXISTS bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scan_logs_bank_id ON scan_logs(bank_id);
