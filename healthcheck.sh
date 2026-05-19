#!/usr/bin/env bash
# Vérification rapide que tous les services tournent
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.dockerproduit"

echo "--- Services ---"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo ""
echo "--- Health Check API ---"
IP=$(grep CORS_ORIGIN "$ENV_FILE" | cut -d= -f2 | sed 's|http://||' | sed 's|:8080||')
if curl -sf "http://${IP}:8080/api/health" > /dev/null 2>&1; then
  echo "✅ API: OK"
else
  echo "❌ API: INACCESSIBLE"
fi

echo ""
echo "--- Frontend ---"
if curl -sf "http://${IP}:8080" > /dev/null 2>&1; then
  echo "✅ Frontend: OK"
else
  echo "❌ Frontend: INACCESSIBLE"
fi
