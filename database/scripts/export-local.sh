#!/bin/bash
echo "🔄 Export de la base de données locale..."

# Supprime les anciens backups
rm -f database/backups/*.sql.gz

# Export
docker-compose exec postgres pg_dump -U banking_user -d banking_db > database/backups/banking_backup_$(date +%Y%m%d_%H%M%S).sql
gzip database/backups/banking_backup_*.sql

echo "✅ Export terminé : $(ls -t database/backups/banking_backup_*.sql.gz | head -n 1)"
