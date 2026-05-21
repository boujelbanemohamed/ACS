#!/bin/bash
# Backup automatisé PostgreSQL pour ACS Banking
# Usage: ./scripts/backup-db.sh [output_dir]
# Peut être exécuté manuellement ou via cron

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
DB_CONTAINER="${DB_CONTAINER:-banking_postgres}"
DB_USER="${DB_USER:-banking_user}"
DB_NAME="${DB_NAME:-banking_db}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="${BACKUP_DIR}/acs_banking_${TIMESTAMP}.sql"
BACKUP_GZ="${BACKUP_FILE}.gz"

echo "[$(date +%H:%M:%S)] Starting backup of ${DB_NAME}..."

if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
  gzip -f "$BACKUP_FILE"
  echo "[$(date +%H:%M:%S)] Backup saved: ${BACKUP_GZ} ($(du -h "$BACKUP_GZ" | cut -f1))"
else
  echo "[$(date +%H:%M:%S)] ERROR: Backup failed!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Nettoyage des backups plus vieux que RETENTION_DAYS jours
find "$BACKUP_DIR" -name "acs_banking_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date +%H:%M:%S)] Done. Retention: ${RETENTION_DAYS} days"
