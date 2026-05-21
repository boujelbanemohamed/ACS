-- 002: Add password change enforcement columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
UPDATE users SET must_change_password = true, password_changed_at = NULL WHERE username = 'admin' AND must_change_password IS NULL;
