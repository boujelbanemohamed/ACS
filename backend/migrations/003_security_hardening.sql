-- 003: Durcissement de la sécurité (audit)

-- Révocation des sessions : tout JWT porte la version courante ; l'incrémenter invalide les anciens
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Les jetons de réinitialisation sont désormais stockés hachés : les anciens (en clair) sont invalidés
UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE reset_token IS NOT NULL;

-- Clés API : seule l'empreinte SHA-256 est conservée
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash VARCHAR(64);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(20);
ALTER TABLE api_keys ALTER COLUMN api_key DROP NOT NULL;
UPDATE api_keys
   SET key_hash = encode(sha256(convert_to(api_key, 'UTF8')), 'hex'),
       key_prefix = left(api_key, 12)
 WHERE api_key IS NOT NULL AND key_hash IS NULL;
UPDATE api_keys SET api_key = NULL WHERE key_hash IS NOT NULL AND api_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Limitation de débit de l'API publique partagée entre toutes les instances
CREATE TABLE IF NOT EXISTS api_rate_limits (
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    window_start TIMESTAMP NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (api_key_id, window_start)
);

-- Empreinte du contenu d'un fichier traité (un fichier rejeté n'est retraité que s'il change)
ALTER TABLE file_logs ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_file_logs_bank_file ON file_logs(bank_id, file_name);

-- Suppression des PAN en clair présents dans l'historique et les journaux
UPDATE record_history
   SET data_received = jsonb_set(
         data_received, '{pan}',
         to_jsonb(repeat('*', greatest(length(data_received->>'pan') - 4, 0)) || right(data_received->>'pan', 4)))
 WHERE data_received IS NOT NULL
   AND jsonb_typeof(data_received) = 'object'
   AND (data_received->>'pan') ~ '^[0-9]{5,}$';

UPDATE record_history_details
   SET field_value = repeat('*', greatest(length(field_value) - 4, 0)) || right(field_value, 4)
 WHERE field_name = 'pan' AND field_value ~ '^[0-9]{5,}$';

UPDATE record_history_details
   SET previous_value = repeat('*', greatest(length(previous_value) - 4, 0)) || right(previous_value, 4)
 WHERE field_name = 'pan' AND previous_value ~ '^[0-9]{5,}$';

UPDATE validation_errors
   SET field_value = repeat('*', greatest(length(regexp_replace(field_value, '[^0-9]', '', 'g')) - 4, 0))
                     || right(regexp_replace(field_value, '[^0-9]', '', 'g'), 4)
 WHERE field_name = 'pan' AND field_value ~ '^[0-9 ]{5,}$';

UPDATE api_logs
   SET request_body = regexp_replace(request_body, '("(pan|cardNumber|card_number)"\s*:\s*")[0-9]*([0-9]{4})"', '\1************\3"', 'g')
 WHERE request_body ~ '"(pan|cardNumber|card_number)"\s*:\s*"[0-9]{5,}"';

UPDATE api_logs
   SET response_body = regexp_replace(response_body, '("(pan|cardNumber|card_number)"\s*:\s*")[0-9]*([0-9]{4})"', '\1************\3"', 'g')
 WHERE response_body ~ '"(pan|cardNumber|card_number)"\s*:\s*"[0-9]{5,}"';

-- Journaux d'audit : suppression des hachages de mot de passe et jetons enregistrés par erreur
UPDATE audit_logs
   SET old_data = old_data - 'password' - 'reset_token' - 'reset_token_expires' - 'api_key' - 'key_hash'
 WHERE old_data IS NOT NULL AND jsonb_typeof(old_data) = 'object'
   AND (old_data ? 'password' OR old_data ? 'reset_token' OR old_data ? 'api_key' OR old_data ? 'key_hash');

UPDATE audit_logs
   SET new_data = new_data - 'password' - 'reset_token' - 'reset_token_expires' - 'api_key' - 'key_hash'
 WHERE new_data IS NOT NULL AND jsonb_typeof(new_data) = 'object'
   AND (new_data ? 'password' OR new_data ? 'reset_token' OR new_data ? 'api_key' OR new_data ? 'key_hash');

-- Journaux d'audit : masquage des mots de passe contenus dans les URL SFTP/FTP des banques
UPDATE audit_logs
   SET old_data = regexp_replace(old_data::text, '(://[^:/@"\s]+:)[^@/"\s]*@', '\1***@', 'g')::jsonb
 WHERE old_data IS NOT NULL AND old_data::text ~ '://[^:/@"\s]+:[^@/"\s]*@';

UPDATE audit_logs
   SET new_data = regexp_replace(new_data::text, '(://[^:/@"\s]+:)[^@/"\s]*@', '\1***@', 'g')::jsonb
 WHERE new_data IS NOT NULL AND new_data::text ~ '://[^:/@"\s]+:[^@/"\s]*@';
