#!/bin/bash

echo "========================================="
echo "Banking CSV Processor - Démarrage"
echo "========================================="
echo ""

# Vérifier si Docker est installé
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé. Veuillez installer Docker d'abord."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose n'est pas installé. Veuillez installer Docker Compose d'abord."
    exit 1
fi

echo "✓ Docker et Docker Compose sont installés"
echo ""

# Créer le fichier .env s'il n'existe pas
if [ ! -f backend/.env ]; then
    echo "📝 Création du fichier .env..."
    cp backend/.env.example backend/.env
    echo "✓ Fichier .env créé"
fi

echo "🚀 Démarrage des services Docker..."
docker-compose up -d

echo ""
echo "⏳ Attente du démarrage des services..."
sleep 10

echo ""
echo "========================================="
echo "✅ Application démarrée avec succès!"
echo "========================================="
echo ""
echo "📍 URLs d'accès:"
echo "   Frontend:  http://localhost:3000"
echo "   Backend:   http://localhost:5000"
echo "   Database:  localhost:5432"
echo ""
echo "🔑 Identifiants par défaut:"
echo "   Username:  admin"
echo "   Password:  Admin@123"
echo ""
echo "📊 Pour voir les logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Pour arrêter:"
echo "   docker-compose down"
echo ""
