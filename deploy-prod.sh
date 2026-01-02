#!/bin/bash
set -e

echo "=========================================="
echo "  DEPLOIEMENT PRODUCTION - ACS BANKING"
echo "=========================================="

# Vérifier que .env.prod existe
if [ ! -f .env.prod ]; then
    echo "ERREUR: Fichier .env.prod manquant!"
    echo "Copiez .env.prod.example vers .env.prod et configurez les valeurs."
    exit 1
fi

# Charger les variables
source .env.prod

# Vérifier JWT_SECRET
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" == "REMPLACEZ_PAR_UNE_CLE_GENEREE_AVEC_OPENSSL" ]; then
    echo "ERREUR: JWT_SECRET non configuré!"
    echo "Générez une clé avec: openssl rand -base64 64"
    exit 1
fi

# Vérifier DB_PASSWORD
if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" == "VotreMotDePasseSecurise123!" ]; then
    echo "ERREUR: DB_PASSWORD non configuré!"
    exit 1
fi

echo "✓ Configuration validée"

# Arrêter les anciens containers
echo "Arrêt des containers existants..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod down || true

# Construire et démarrer
echo "Construction et démarrage..."
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Attendre que le backend soit prêt
echo "Attente du démarrage..."
sleep 30

# Vérifier le statut
echo ""
echo "=========================================="
echo "  STATUT DES SERVICES"
echo "=========================================="
docker-compose -f docker-compose.prod.yml ps

# Test de santé
echo ""
echo "Test API Health..."
curl -s http://localhost:8000/api/health || echo "API non accessible"

echo ""
echo "=========================================="
echo "  DEPLOIEMENT TERMINE"
echo "=========================================="
echo "Frontend: http://localhost:8088"
echo "API:      http://localhost:8000/api"
echo "=========================================="
