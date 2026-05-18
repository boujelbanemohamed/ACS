#!/bin/bash
# Restore PostgreSQL backup for ACS platform
# Usage: ./scripts/restore.sh <backup_file>

set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  echo "Available backups:"
  ls -lh ./backups/ 2>/dev/null || echo "  (no backups directory found)"
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-banking_db}"
DB_USER="${DB_USER:-banking_user}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting restore: ${BACKUP_FILE} → ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "WARNING: This will DROP the existing database!"

read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore cancelled"
  exit 1
fi

DECOMPRESSED="${BACKUP_FILE%.gz}"

if [ "${BACKUP_FILE}" != "${DECOMPRESSED}" ]; then
  echo "Decompressing..."
  gunzip -k -f "$BACKUP_FILE"
fi

PGPASSWORD="${PGPASSWORD:-banking_password}" pg_restore \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --clean \
  --if-exists \
  --verbose \
  "${DECOMPRESSED}" 2>&1 | tail -10

if [ "${BACKUP_FILE}" != "${DECOMPRESSED}" ]; then
  rm -f "${DECOMPRESSED}"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restore complete"
