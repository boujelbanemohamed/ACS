#!/bin/bash
# Automatic PostgreSQL backup for ACS platform
# Usage: ./scripts/backup.sh [output_dir]
# Can be scheduled via cron: 0 2 * * * /path/to/scripts/backup.sh

set -euo pipefail

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/acs_db_${TIMESTAMP}.sql.gz"
LATEST_LINK="${OUTPUT_DIR}/acs_db_latest.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-banking_db}"
DB_USER="${DB_USER:-banking_user}"

mkdir -p "$OUTPUT_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup: ${DB_NAME}@${DB_HOST}:${DB_PORT}"

PGPASSWORD="${PGPASSWORD:-banking_password}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --verbose \
  --file="${BACKUP_FILE%.gz}" 2>&1 | tail -5

gzip -f "${BACKUP_FILE%.gz}"

ln -sf "$(basename "${BACKUP_FILE}")" "$LATEST_LINK"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup saved: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Cleanup old backups
find "$OUTPUT_DIR" -name "acs_db_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaned up backups older than ${RETENTION_DAYS} days"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete"
