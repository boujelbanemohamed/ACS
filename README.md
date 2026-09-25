# Banking CSV Processor

Application complète de gestion et validation de fichiers CSV bancaires avec React, Node.js, PostgreSQL et Docker.

## 🚀 Fonctionnalités

### 1. **Authentification**
- Connexion sécurisée avec JWT
- Gestion des rôles (admin/user)
- Identifiants par défaut: `admin` / `Admin@123` — **changement obligatoire à la première connexion** (imposé par le serveur)

### 2. **Dashboard**
- Vue d'ensemble des statistiques
- Activité récente
- Statistiques par banque
- Suivi en temps réel

### 3. **Gestion des Banques**
- CRUD complet des banques
- Configuration des URLs (source, destination, archives)
- Statistiques par banque

### 4. **Traitement des Fichiers CSV**
- **Traitement par URL**: Recherche automatique de nouveaux fichiers
- **Upload manuel**: Interface de téléchargement de fichiers
- **Validation complète**:
  - Structure du CSV (en-têtes)
  - Validation de chaque champ selon les règles métier
  - Détection de doublons
  - Validation Luhn pour les numéros PAN
  - Format des dates d'expiration
  - Format des numéros de téléphone tunisiens

### 5. **Correction en Temps Réel**
- Affichage des erreurs de validation
- Correction interactive des données
- Retraitement après correction
- Téléchargement des fichiers corrigés

### 6. **Déplacement Automatique des Fichiers**
- Fichiers valides → Dossier de destination
- Fichiers originaux → Archives (renommés avec préfixe OLD_)

### 7. **Scanner Automatique (CRON)**
- ✅ Vérification automatique programmable
- ✅ Scan de tous les dossiers de banques actives
- ✅ Détection et traitement automatique des nouveaux fichiers
- ✅ Configuration flexible (toutes les 5 min par défaut)
- ✅ Monitoring et logs en temps réel
- ✅ Déclenchement manuel possible

## 📋 Structure du CSV Attendue

```csv
language;firstName;lastName;pan;expiry;phone;behaviour;action;;;
fr;KHEMISSI KHEMISSI SAOUSSEN;KHEMISSI KHEMISSI SAOUSSEN;4741555555555550;202411;21624080852;otp;update;;;
```

### Champs Requis
- **language**: fr, en, ar
- **firstName**: 2-255 caractères
- **lastName**: 2-255 caractères
- **pan**: 16 chiffres (validation Luhn)
- **expiry**: Format YYYYMM (ex: 202411)
- **phone**: Format tunisien 216XXXXXXXX
- **behaviour**: otp, sms, email
- **action**: update, create, delete

## 🛠️ Installation et Démarrage

### Prérequis
- Docker
- Docker Compose

### Lancement Rapide

1. **Cloner le projet**
```bash
cd banking-csv-processor
```

2. **Configuration**
```bash
# Backend
cp backend/.env.example backend/.env

# Modifier les valeurs dans backend/.env si nécessaire
```

3. **Démarrer l'application**
```bash
docker-compose up -d
```

4. **Accéder à l'application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- PostgreSQL: localhost:5432

### Premier Démarrage

L'application créé automatiquement:
- La base de données
- Les tables nécessaires
- Un utilisateur admin (admin / Admin@123)
- 3 banques d'exemple (BT, ATB, STB)

## 📁 Structure du Projet

```
banking-csv-processor/
├── backend/
│   ├── config/           # Configuration DB
│   ├── middleware/       # Auth middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Validators
│   ├── init.sql         # DB initialization
│   ├── server.js        # Entry point
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── contexts/    # React contexts
│   │   ├── pages/       # Page components
│   │   ├── services/    # API calls
│   │   └── App.js
│   └── package.json
├── docker-compose.yml
└── README.md
```

## 🔧 Configuration

### Variables d'Environnement Backend

```env
NODE_ENV=development
PORT=5000

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=banking_db
DB_USER=banking_user
DB_PASSWORD=banking_password

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRE=24h

# Cron (vérification automatique)
CRON_SCHEDULE=*/5 * * * *  # Toutes les 5 minutes
```

### Configuration des Banques

Pour chaque banque, configurez:
- **Code**: Identifiant unique (ex: BT, ATB, STB)
- **Nom**: Nom complet de la banque
- **URL Source**: Où chercher les fichiers (ex: https://175.0.2.15/ACS/BT)
- **URL Destination**: Où déplacer les fichiers valides
- **URL Archives**: Où archiver les fichiers originaux

### Configuration du Scanner Automatique (CRON)

Le système inclut un scanner automatique qui vérifie périodiquement les nouveaux fichiers :

```env
# Planification (format CRON)
CRON_SCHEDULE=*/5 * * * *  # Toutes les 5 minutes (défaut)

# Fuseau horaire
TZ=Africa/Tunis

# Scan au démarrage du serveur
SCAN_ON_STARTUP=false

# Nombre max de fichiers par scan
MAX_FILES_PER_SCAN=10
```

**Exemples de planification** :
- `*/5 * * * *` - Toutes les 5 minutes
- `*/15 * * * *` - Toutes les 15 minutes
- `0 * * * *` - Toutes les heures
- `0 8,14,20 * * *` - À 8h, 14h et 20h
- `0 0 * * *` - Chaque jour à minuit

📖 Voir [CRON_CONFIGURATION.md](CRON_CONFIGURATION.md) pour plus de détails.

## 📡 API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion
- `POST /api/auth/register` - Inscription (admin only)
- `GET /api/auth/me` - Utilisateur actuel

### Banques
- `GET /api/banks` - Liste des banques
- `POST /api/banks` - Créer une banque
- `PUT /api/banks/:id` - Modifier une banque
- `DELETE /api/banks/:id` - Supprimer une banque
- `GET /api/banks/:id/stats` - Statistiques d'une banque

### Traitement
- `POST /api/processing/process-url` - Traiter depuis URL
- `POST /api/processing/upload` - Upload manuel
- `GET /api/processing/errors/:fileLogId` - Erreurs d'un fichier
- `PATCH /api/processing/errors/:errorId/resolve` - Résoudre une erreur
- `GET /api/processing/logs` - Historique des traitements
- `GET /api/processing/download/:fileLogId` - Télécharger CSV corrigé
- `POST /api/processing/reprocess/:fileLogId` - Retraiter un fichier

### Dashboard
- `GET /api/dashboard/stats` - Statistiques globales
- `GET /api/dashboard/errors/unresolved` - Erreurs non résolues
- `GET /api/dashboard/records/recent` - Enregistrements récents

### Scanner Automatique
- `GET /api/scanner/status` - Statut du scanner
- `POST /api/scanner/trigger` - Déclencher un scan manuel
- `GET /api/scanner/logs` - Historique des scans

## 🔍 Validation des Données

### Règles de Validation

1. **En-tête CSV**: Tous les champs requis doivent être présents
2. **PAN (Numéro de carte)**: 
   - 16 chiffres exactement
   - Validation Luhn
3. **Date d'expiration**:
   - Format YYYYMM
   - Année entre 2024-2050
   - Mois entre 01-12
4. **Téléphone**:
   - Format tunisien: 216XXXXXXXX
   - 11 chiffres
5. **Doublons**: Détection basée sur PAN + expiry + phone

### Niveaux de Sévérité
- **ERROR**: Empêche le traitement (champs manquants, formats invalides)
- **WARNING**: Alerte mais n'empêche pas le traitement (carte expirée, Luhn check)

## 🔄 Workflow de Traitement

1. **Détection** → Nouveau fichier détecté dans le dossier source
2. **Téléchargement** → Fichier téléchargé temporairement
3. **Validation** → Validation complète ligne par ligne
4. **Détection Doublons** → Vérification en base de données
5. **Traitement**:
   - Si valide → Déplacement vers destination + Sauvegarde en BD
   - Si erreurs → Rapport d'erreurs + Possibilité de correction
6. **Archivage** → Fichier original renommé et archivé

## 🚨 Gestion des Erreurs

L'application génère des rapports détaillés pour chaque fichier:
- Numéro de ligne
- Champ en erreur
- Valeur incorrecte
- Message d'erreur explicite
- Correction interactive possible

## 📊 Surveillance

### Logs
- Tous les traitements sont loggés en base de données
- Historique complet accessible via l'interface
- Statistiques en temps réel

### Métriques Suivies
- Nombre total de fichiers traités
- Lignes valides/invalides/doublons
- Taux de succès par banque
- Erreurs non résolues

## 🔐 Sécurité

- Authentification JWT
- Tokens expirables (24h par défaut)
- Validation côté serveur
- Protection des routes API
- Séparation des rôles admin/user

## 🐳 Docker

### Services

1. **PostgreSQL** (port 5432)
   - Base de données principale
   - Persistance des données
   - Healthcheck automatique

2. **Backend** (port 5000)
   - API Node.js/Express
   - Dépend de PostgreSQL

3. **Frontend** (port 3000)
   - Application React
   - Proxy vers le backend

### Commandes Docker Utiles

```bash
# Démarrer
docker-compose up -d

# Arrêter
docker-compose down

# Voir les logs
docker-compose logs -f

# Redémarrer un service
docker-compose restart backend

# Reconstruire
docker-compose up -d --build

# Accéder à la base de données
docker-compose exec postgres psql -U banking_user -d banking_db
```

## 🧪 Tests

### Test Manuel

1. Connectez-vous avec admin/Admin@123
2. Créez une banque ou utilisez une banque existante
3. Uploadez le fichier CSV d'exemple
4. Vérifiez les résultats de validation
5. Corrigez les erreurs si nécessaire
6. Téléchargez le fichier corrigé

## 📝 Développement

### Backend
```bash
cd backend
npm install
npm run dev  # Mode développement avec nodemon
```

### Frontend
```bash
cd frontend
npm install
npm start   # Mode développement
```

## 🤝 Support

Pour toute question ou problème:
1. Vérifiez les logs Docker
2. Consultez les erreurs dans l'interface
3. Vérifiez la configuration des URLs

## 📄 Licence

Ce projet est développé pour un usage interne bancaire.

---

**Version**: 1.0.0  
**Date**: Décembre 2024
