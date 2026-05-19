#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# ACS Banking CSV Processor — Script de déploiement
# =============================================================================
# Usage:
#   1. SCP les fichiers sur le serveur :
#      rsync -avz --exclude='node_modules' --exclude='.git' ./ user@IP:~/acs/
#
#   2. Copier le .env avec les secrets (NE JAMAIS COMMITER) :
#      scp .env.dockerproduit user@IP:~/acs/.env.dockerproduit
#
#   3. Modifier l'IP dans .env.dockerproduit :
#      nano .env.dockerproduit  # → remplacer VOTRE_IP par l'IP réelle
#
#   4. Lancer ce script :
#      ./deploy.sh
# =============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "🚀 Déploiement ACS Banking Processor"
echo "======================================"

# Vérifier que le .env existe
if [ ! -f .env.dockerproduit ]; then
  echo "❌ .env.dockerproduit introuvable"
  echo "   Créez-le à partir des clés générées"
  exit 1
fi

# Vérifier que VOTRE_IP a été remplacé
if grep -q "VOTRE_IP" .env.dockerproduit; then
  echo "⚠️  Vous devez remplacer VOTRE_IP dans .env.dockerproduit"
  echo "   Éditez le fichier et remplacez par l'IP du serveur"
  exit 1
fi

# Arrêter l'ancienne stack
echo "🛑 Arrêt des anciens conteneurs..."
docker compose -f docker-compose.prod.yml --env-file .env.dockerproduit down --remove-orphans 2>/dev/null || true

# Build et démarrage
echo "🏗️  Build des images..."
docker compose -f docker-compose.prod.yml --env-file .env.dockerproduit build --pull

echo "▶️  Démarrage des conteneurs..."
docker compose -f docker-compose.prod.yml --env-file .env.dockerproduit up -d

# Attendre que la DB soit prête
echo "⏳ Attente de la base de données..."
sleep 5

# Vérifier les healthchecks
echo "🔍 Vérification des services..."
sleep 3

"${DIR}/healthcheck.sh" || {
  echo "⚠️  Certains services ne répondent pas encore"
  echo "   Vérifiez avec: docker compose -f docker-compose.prod.yml ps"
}

echo ""
echo "✅ Déploiement terminé !"
echo "   Frontend : http://$(grep CORS_ORIGIN .env.dockerproduit | cut -d= -f2 | sed 's|http://||')"
echo "   API      : http://$(grep CORS_ORIGIN .env.dockerproduit | cut -d= -f2 | sed 's|http://||')/api/health"
echo ""
echo "   Logs: docker compose -f docker-compose.prod.yml logs -f"
