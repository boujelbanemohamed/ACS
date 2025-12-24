# Guide d'Installation Rapide

## Méthode 1: Docker (Recommandée)

### Prérequis
- Docker version 20.10 ou supérieure
- Docker Compose version 2.0 ou supérieure
- 2GB RAM minimum
- 5GB d'espace disque

### Installation

```bash
# 1. Naviguer vers le dossier du projet
cd banking-csv-processor

# 2. Lancer le script de démarrage
./start.sh

# OU manuellement:
docker-compose up -d
```

### Vérification

```bash
# Vérifier que tous les services sont en cours d'exécution
docker-compose ps

# Vous devriez voir 3 services:
# - banking_postgres (PostgreSQL)
# - banking_backend (Node.js API)
# - banking_frontend (React App)
```

### Accès

- **Application Web**: http://localhost:3000
- **API Backend**: http://localhost:5000
- **Base de données**: localhost:5432

Identifiants par défaut:
- Username: `admin`
- Password: `Admin@123`

---

## Méthode 2: Installation Manuelle (Développement)

### Prérequis
- Node.js 18+ et npm
- PostgreSQL 15+

### Backend

```bash
# 1. Installer les dépendances
cd backend
npm install

# 2. Configurer la base de données
# Créer une base de données PostgreSQL nommée "banking_db"

# 3. Initialiser le schéma
psql -U postgres -d banking_db -f init.sql

# 4. Créer le fichier .env
cp .env.example .env
# Éditer .env avec vos paramètres de connexion

# 5. Démarrer le serveur
npm run dev
```

### Frontend

```bash
# 1. Installer les dépendances
cd frontend
npm install

# 2. Démarrer l'application
npm start
```

---

## Configuration de Production

### Variables d'Environnement Importantes

```env
# Backend (.env)
NODE_ENV=production
JWT_SECRET=[Générer une clé secrète forte]
DB_PASSWORD=[Mot de passe fort]

# Sécurité
# Utiliser HTTPS en production
# Configurer un reverse proxy (nginx/apache)
# Activer les CORS seulement pour les domaines autorisés
```

### Recommandations de Sécurité

1. **Changer le mot de passe admin immédiatement**
2. **Utiliser des secrets JWT forts**
3. **Configurer HTTPS/SSL**
4. **Mettre en place un firewall**
5. **Limiter l'accès à PostgreSQL**
6. **Configurer des sauvegardes régulières**

---

## Dépannage

### Les services ne démarrent pas

```bash
# Vérifier les logs
docker-compose logs -f

# Redémarrer les services
docker-compose restart
```

### Erreur de connexion à la base de données

```bash
# Vérifier que PostgreSQL est prêt
docker-compose logs postgres

# Recréer le conteneur PostgreSQL
docker-compose down
docker volume rm banking-csv-processor_postgres_data
docker-compose up -d
```

### Port déjà utilisé

Si les ports 3000, 5000 ou 5432 sont déjà utilisés:

```yaml
# Modifier docker-compose.yml
ports:
  - "3001:3000"  # Frontend sur port 3001
  - "5001:5000"  # Backend sur port 5001
  - "5433:5432"  # PostgreSQL sur port 5433
```

### Permission refusée

```bash
# Donner les permissions au script
chmod +x start.sh
```

---

## Mise à Jour

```bash
# Arrêter les services
docker-compose down

# Récupérer les dernières modifications
git pull

# Reconstruire et redémarrer
docker-compose up -d --build
```

---

## Désinstallation

```bash
# Arrêter et supprimer les conteneurs
docker-compose down

# Supprimer les volumes (⚠️ supprime les données)
docker-compose down -v

# Supprimer les images
docker rmi banking-csv-processor_backend
docker rmi banking-csv-processor_frontend
```

---

## Support

Pour plus d'informations:
- README.md - Documentation complète
- GUIDE_UTILISATEUR.md - Guide d'utilisation
- Logs: `docker-compose logs -f`
