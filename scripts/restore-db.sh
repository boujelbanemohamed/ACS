#!/bin/bash
# Restauration d'un backup PostgreSQL pour ACS Banking
# Usage: ./scripts/restore-db.sh <backup_file.gz>

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup_file.gz>"
  exit 1
fi

BACKUP_GZ="$1"

if [ ! -f "$BACKUP_GZ" ]; then
  echo "ERROR: File not found: ${BACKUP_GZ}"
  exit 1
fi

DB_CONTAINER="${DB_CONTAINER:-banking_postgres}"
DB_USER="${DB_USER:-banking_user}"
DB_NAME="${DB_NAME:-banking_db}"

echo "[$(date +%H:%M:%S)] Restoring ${DB_NAME} from ${BACKUP_GZ}..."
gunzip -c "$BACKUP_GZ" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" "$DB_NAME"
echo "[$(date +%H:%M:%S)] Restore complete."
