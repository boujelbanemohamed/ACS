-- Database initialization script

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'bank',
    bank_id INTEGER,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Banks table
CREATE TABLE IF NOT EXISTS banks (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    source_url VARCHAR(500) NOT NULL,
    destination_url VARCHAR(500) NOT NULL,
    old_url VARCHAR(500) NOT NULL,
    xml_output_url VARCHAR(500),
    enrollment_report_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key for users.bank_id
ALTER TABLE users ADD CONSTRAINT fk_users_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE SET NULL;

-- Processed records table
CREATE TABLE IF NOT EXISTS processed_records (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    language VARCHAR(10),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    pan VARCHAR(20),
    expiry VARCHAR(10),
    phone VARCHAR(20),
    behaviour VARCHAR(50),
    action VARCHAR(50),
    file_name VARCHAR(255),
    file_log_id INTEGER,
    enrollment_status VARCHAR(20) DEFAULT 'pending',
    enrollment_error_code VARCHAR(50),
    enrollment_error_description TEXT,
    enrollment_date TIMESTAMP,
    enrollment_xml_id INTEGER,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bank_id, pan)
);

-- File processing logs
CREATE TABLE IF NOT EXISTS file_logs (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    original_path VARCHAR(500),
    destination_path VARCHAR(500),
    archive_path VARCHAR(500),
    output_path VARCHAR(500),
    status VARCHAR(50) NOT NULL,
    source_type VARCHAR(50) DEFAULT 'upload',
    validation_status VARCHAR(50),
    archive_status VARCHAR(50),
    output_status VARCHAR(50),
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    invalid_rows INTEGER DEFAULT 0,
    duplicate_rows INTEGER DEFAULT 0,
    error_details TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Validation errors table
CREATE TABLE IF NOT EXISTS validation_errors (
    id SERIAL PRIMARY KEY,
    file_log_id INTEGER REFERENCES file_logs(id) ON DELETE CASCADE,
    row_number INTEGER,
    field_name VARCHAR(100),
    field_value TEXT,
    error_message TEXT,
    severity VARCHAR(20),
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- XML generation logs
CREATE TABLE IF NOT EXISTS xml_logs (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    file_log_id INTEGER REFERENCES file_logs(id) ON DELETE CASCADE,
    xml_file_name VARCHAR(255),
    xml_file_path VARCHAR(500),
    records_count INTEGER DEFAULT 0,
    xml_entries_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- XML ID sequence for unique IDs
CREATE TABLE IF NOT EXISTS xml_id_sequence (
    id SERIAL PRIMARY KEY,
    last_id BIGINT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial sequence value
INSERT INTO xml_id_sequence (last_id) VALUES (1000) ON CONFLICT DO NOTHING;

-- Enrollment logs
CREATE TABLE IF NOT EXISTS enrollment_logs (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    file_name VARCHAR(255),
    file_path VARCHAR(500),
    total_records INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    not_found_ids TEXT,
    error_details TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scan logs for cron
CREATE TABLE IF NOT EXISTS scan_logs (
    id SERIAL PRIMARY KEY,
    scan_time TIMESTAMP NOT NULL,
    banks_scanned INTEGER DEFAULT 0,
    files_found INTEGER DEFAULT 0,
    files_processed INTEGER DEFAULT 0,
    enrollment_files_found INTEGER DEFAULT 0,
    enrollment_files_processed INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    errors_detail TEXT,
    error_details TEXT,
    bank_details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    institution VARCHAR(255),
    bank_id INTEGER REFERENCES banks(id) ON DELETE SET NULL,
    permissions TEXT[] DEFAULT ARRAY['read', 'write'],
    rate_limit INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Logs table
CREATE TABLE IF NOT EXISTS api_logs (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255),
    method VARCHAR(10),
    request_body TEXT,
    response_status INTEGER,
    response_body TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SMTP Configuration
CREATE TABLE IF NOT EXISTS smtp_config (
    id SERIAL PRIMARY KEY,
    host VARCHAR(255),
    port INTEGER DEFAULT 587,
    secure BOOLEAN DEFAULT false,
    username VARCHAR(255),
    password VARCHAR(255),
    from_email VARCHAR(255),
    from_name VARCHAR(255) DEFAULT 'ACS Banking System',
    enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bank notification emails
CREATE TABLE IF NOT EXISTS bank_notification_emails (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification logs
CREATE TABLE IF NOT EXISTS notification_logs (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    email VARCHAR(255),
    subject VARCHAR(500),
    status VARCHAR(50),
    error_message TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- File history (for detailed tracking)
CREATE TABLE IF NOT EXISTS file_history (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    file_name VARCHAR(255),
    records_count INTEGER DEFAULT 0,
    status VARCHAR(50),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- XML generation logs (alternative name used in some queries)
CREATE TABLE IF NOT EXISTS xml_generation_logs (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    file_name VARCHAR(255),
    records_count INTEGER DEFAULT 0,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_processed_records_pan ON processed_records(pan);
CREATE INDEX IF NOT EXISTS idx_processed_records_bank ON processed_records(bank_id);
CREATE INDEX IF NOT EXISTS idx_processed_records_enrollment ON processed_records(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_processed_records_xml_id ON processed_records(enrollment_xml_id);
CREATE INDEX IF NOT EXISTS idx_file_logs_bank ON file_logs(bank_id);
CREATE INDEX IF NOT EXISTS idx_file_logs_status ON file_logs(status);
CREATE INDEX IF NOT EXISTS idx_validation_errors_log ON validation_errors(file_log_id);
CREATE INDEX IF NOT EXISTS idx_xml_logs_bank ON xml_logs(bank_id);
CREATE INDEX IF NOT EXISTS idx_xml_logs_file ON xml_logs(file_log_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_time ON scan_logs(scan_time);
CREATE INDEX IF NOT EXISTS idx_api_logs_key ON api_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_bank ON notification_logs(bank_id);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
    ('cron_schedule', '*/5 * * * *', 'Planification CRON pour scan automatique'),
    ('cron_enabled', 'true', 'Activer le scan automatique'),
    ('scan_timezone', 'Africa/Tunis', 'Fuseau horaire'),
    ('auto_archive', 'true', 'Archivage automatique'),
    ('max_files_per_scan', '100', 'Max fichiers par scan')
ON CONFLICT (key) DO NOTHING;

-- Insert default admin user (password: Admin@123)
-- Hash genere avec bcrypt rounds=10
INSERT INTO users (username, password, email, role, is_active) 
VALUES ('admin', '$2a$10$Izv810YTXK/IfnU/XIqlweYv9.xe3UYG/UPktAU.nzIO2nE5aMDf2', 'admin@banking.com', 'super_admin', true)
ON CONFLICT (username) DO NOTHING;

-- Insert sample banks
INSERT INTO banks (code, name, source_url, destination_url, old_url, xml_output_url) VALUES
    ('BT', 'Banque de Tunisie', '/data/banks/BT/source', '/data/banks/BT/destination', '/data/banks/BT/archive', '/data/banks/BT/xml'),
    ('BIAT', 'BIAT', '/data/banks/BIAT/source', '/data/banks/BIAT/destination', '/data/banks/BIAT/archive', '/data/banks/BIAT/xml'),
    ('ATB', 'Arab Tunisian Bank', '/data/banks/ATB/source', '/data/banks/ATB/destination', '/data/banks/ATB/archive', '/data/banks/ATB/xml')
ON CONFLICT (code) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO banking_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO banking_user;
