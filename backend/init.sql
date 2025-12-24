-- Database initialization script

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Processed records table (for duplicate detection)
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
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bank_id, pan, expiry, phone)
);

-- File processing logs
CREATE TABLE IF NOT EXISTS file_logs (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    original_path VARCHAR(500),
    destination_path VARCHAR(500),
    status VARCHAR(50) NOT NULL, -- 'processing', 'success', 'error', 'validation_error'
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
    severity VARCHAR(20), -- 'error', 'warning'
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Processing queue table
CREATE TABLE IF NOT EXISTS processing_queue (
    id SERIAL PRIMARY KEY,
    bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_processed_records_pan ON processed_records(pan);
CREATE INDEX idx_processed_records_bank ON processed_records(bank_id);
CREATE INDEX idx_file_logs_bank ON file_logs(bank_id);
CREATE INDEX idx_file_logs_status ON file_logs(status);
CREATE INDEX idx_validation_errors_log ON validation_errors(file_log_id);
CREATE INDEX idx_processing_queue_status ON processing_queue(status);

-- Insert default admin user (password: Admin@123)
INSERT INTO users (username, password, email, role) 
VALUES ('admin', '$2a$10$YQs8h5V5h5V5h5V5h5V5hOK5Jq5Jq5Jq5Jq5Jq5Jq5Jq5Jq5Jq5J', 'admin@banking.com', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert sample banks
INSERT INTO banks (code, name, source_url, destination_url, old_url) VALUES
    ('BT', 'Banque de Tunisie', 'https://175.0.2.15/ACS/BT', 'https://175.0.2.15/ACS/New/BT', 'https://175.0.2.15/ACS/OLD/BT'),
    ('ATB', 'Arab Tunisian Bank', 'https://175.0.2.15/ACS/ATB', 'https://175.0.2.15/ACS/New/ATB', 'https://175.0.2.15/ACS/OLD/ATB'),
    ('STB', 'Société Tunisienne de Banque', 'https://175.0.2.15/ACS/STB', 'https://175.0.2.15/ACS/New/STB', 'https://175.0.2.15/ACS/OLD/STB')
ON CONFLICT (code) DO NOTHING;
