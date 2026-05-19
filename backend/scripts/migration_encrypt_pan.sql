-- Migration: PAN Encryption at Rest
-- Ajoute le chiffrement AES-256-GCM sur les PANs stockés
-- et une colonne pan_hash pour les recherches sans déchiffrement

BEGIN;

-- 1. processed_records : étendre la colonne pan pour accueillir le chiffré (iv:tag:ciphertext)
ALTER TABLE processed_records ALTER COLUMN pan TYPE TEXT;
ALTER TABLE processed_records ADD COLUMN IF NOT EXISTS pan_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_processed_records_pan_hash ON processed_records(pan_hash);

-- La contrainte UNIQUE (bank_id, pan) ne fonctionne plus avec du chiffré (IV aléatoire)
-- On la remplace par (bank_id, pan_hash)
ALTER TABLE processed_records DROP CONSTRAINT IF EXISTS processed_records_bank_id_pan_key;
ALTER TABLE processed_records ADD CONSTRAINT processed_records_bank_id_pan_hash_key UNIQUE (bank_id, pan_hash);

-- 2. record_history
ALTER TABLE record_history ALTER COLUMN pan TYPE TEXT;
ALTER TABLE record_history ADD COLUMN IF NOT EXISTS pan_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_record_history_pan_hash ON record_history(pan_hash);
CREATE INDEX IF NOT EXISTS idx_record_history_bank_pan_hash ON record_history(bank_id, pan_hash);

COMMIT;
