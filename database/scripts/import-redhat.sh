#!/bin/bash
echo "🔄 Import de la base de données sur RedHat..."

# Trouve le dernier backup
LATEST_BACKUP=$(ls -t database/backups/banking_backup_*.sql.gz | head -n 1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "❌ Aucun backup trouvé"
    exit 1
fi

echo "📦 Backup trouvé : $LATEST_BACKUP"

# Décompression et import
gunzip -c $LATEST_BACKUP > /tmp/temp_backup.sql
psql -U banking_user -d banking_db -f /tmp/temp_backup.sql
rm /tmp/temp_backup.sql

echo "✅ Import terminé !"
