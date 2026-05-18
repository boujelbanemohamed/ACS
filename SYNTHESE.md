# Banking CSV Processor - Synthèse du Projet

## 📦 Contenu de la Livraison

Vous avez reçu une application complète de traitement et validation de fichiers CSV bancaires.

### Structure du Projet

```
banking-csv-processor/
├── 📄 README.md                    # Documentation principale
├── 📄 GUIDE_UTILISATEUR.md         # Guide complet pour les utilisateurs
├── 📄 INSTALLATION.md              # Guide d'installation
├── 📄 CHANGELOG.md                 # Journal des modifications
├── 📄 SYNTHESE.md                  # Synthèse du projet
├── 🐳 docker-compose.yml           # Configuration Docker
├── 🚀 start.sh                     # Script de démarrage rapide
├── 📄 .gitignore                   # Fichiers à ignorer
├── ⚙️ nginx.conf.example           # Configuration nginx pour production
│
├── backend/                        # API Node.js/Express
│   ├── config/
│   │   └── database.js            # Configuration PostgreSQL
│   ├── middleware/
│   │   ├── auth.js                # Authentification JWT
│   │   └── roleMiddleware.js      # Vérification rôles
│   ├── routes/
│   │   ├── auth.js                # Routes authentification
│   │   ├── banks.js               # Routes gestion banques
│   │   ├── processing.js          # Routes traitement CSV
│   │   ├── dashboard.js           # Routes statistiques
│   │   ├── users.js               # Routes gestion utilisateurs
│   │   ├── apiKeys.js             # Routes clés API
│   │   ├── history.js             # Routes historique fichiers
│   │   ├── recordHistory.js       # Routes historique PAN
│   │   ├── records.js             # Routes enregistrements
│   │   ├── settings.js            # Routes paramètres
│   │   ├── xmlLogs.js             # Routes logs XML
│   │   ├── enrollment.js          # Routes enrollment
│   │   ├── notifications.js       # Routes notifications
│   │   └── publicApi.js           # Routes API publique
│   ├── services/
│   │   ├── csvProcessor.js        # Logique de traitement CSV
│   │   ├── cronService.js         # Scan automatique CRON
│   │   ├── fileScanner.js         # Scan fichiers bancaires
│   │   ├── xmlGenerator.js        # Génération XML
│   │   ├── enrollmentService.js   # Traitement enrollment
│   │   ├── emailService.js        # Service email
│   │   ├── notificationService.js # Notifications
│   │   └── recordHistoryService.js# Historique PAN
│   ├── utils/
│   │   ├── csvValidator.js        # Validateur de données CSV
│   │   ├── validationHelper.js    # Helper validation
│   │   ├── remoteFileService.js   # Service SFTP/FTP/HTTP
│   │   └── emailTemplates.js      # Templates email
│   ├── scripts/
│   │   ├── backup.sh              # Backup PostgreSQL
│   │   └── restore.sh             # Restore PostgreSQL
│   ├── __tests__/
│   │   └── csvValidator.test.js   # Tests unitaires
│   ├── init.sql                   # Script initialisation DB
│   ├── server.js                  # Point d'entrée backend
│   ├── package.json               # Dépendances backend
│   ├── Dockerfile                 # Image Docker backend
│   └── .env.example               # Exemple de configuration
│
└── frontend/                      # Application React
    ├── public/
    │   └── index.html             # HTML principal
    ├── src/
    │   ├── components/
    │   │   ├── Layout.js          # Layout principal
    │   │   └── Layout.css
    │   ├── contexts/
    │   │   └── AuthContext.js     # Gestion authentification
    │   ├── pages/
    │   │   ├── Login.js           # Page de connexion
    │   │   ├── Login.css
    │   │   ├── Dashboard.js       # Dashboard
    │   │   ├── Dashboard.css
    │   │   ├── Banks.js           # Gestion des banques
    │   │   ├── Banks.css
    │   │   ├── Processing.js      # Traitement CSV
    │   │   ├── Processing.css
    │   │   ├── Records.js         # Historique enregistrements
    │   │   ├── Records.css
    │   │   ├── History.js         # Historique fichiers
    │   │   ├── History.css
    │   │   ├── ApiKeys.js         # Gestion clés API
    │   │   ├── ApiTester.js       # Testeur API
    │   │   ├── ApiTester.css
    │   │   ├── Users.js           # Gestion utilisateurs
    │   │   ├── Notifications.js   # Notifications
    │   │   ├── CronManager.js     # Gestion CRON
    │   │   └── Settings.js        # Paramètres
    │   ├── services/
    │   │   └── api.js             # Appels API
    │   ├── App.js                 # Composant principal
    │   ├── App.css
    │   └── index.js               # Point d'entrée
    ├── package.json               # Dépendances frontend
    └── Dockerfile                 # Image Docker frontend
```

## 🎯 Fonctionnalités Implémentées

### ✅ Authentification et Sécurité
- Système de connexion avec JWT
- Gestion des rôles (super_admin / bank)
- Protection des routes API
- Sessions sécurisées
- RBAC (Role-Based Access Control) complet
- Audit logs persistés en base de données

### ✅ Dashboard Interactif
- Statistiques en temps réel
- Vue d'ensemble des traitements
- Activité récente
- Métriques par banque
- Filtres et recherche

### ✅ Gestion des Banques
- CRUD complet (Create, Read, Update, Delete)
- Configuration des URLs (source, destination, archives)
- Activation/désactivation des banques
- Statistiques individuelles par banque
- Filtrage par banque pour utilisateurs bank

### ✅ Traitement des Fichiers CSV
- **Quatre méthodes de traitement**:
  1. Par URL automatique
  2. Par upload manuel
  3. Par saisie manuelle
  4. Par appel API externe (call-api)

- **Validation complète**:
  - Vérification de la structure (en-têtes)
  - Validation de chaque champ (format, type, longueur)
  - Validation Luhn pour les PAN (numéros de carte)
  - Validation des dates d'expiration (format MM/YY uniforme)
  - Validation des numéros de téléphone tunisiens

- **Détection de doublons**:
  - Basée sur PAN + expiry + phone
  - Vérification en base de données
  - ON CONFLICT DO UPDATE avec reset enrollment

- **Gestion des erreurs**:
  - Classification (erreur critique / avertissement)
  - Messages explicites
  - Numéro de ligne et champ concerné
  - Catalogue d'erreurs détaillé

### ✅ Correction Interactive
- Interface de correction en temps réel
- Modification des valeurs erronées
- Retraitement après correction
- Téléchargement des fichiers corrigés

### ✅ Automatisation (CRON Scanner)
- Vérification automatique toutes les 5 minutes (configurable)
- Traitement asynchrone
- Déplacement automatique des fichiers
- Archivage avec horodatage
- Scanner intelligent avec détection de nouveaux fichiers
- Support de multiples protocoles (HTTP, File System, SFTP, FTP)
- Configuration flexible via CRON
- Déclenchement manuel possible
- Monitoring et statistiques en temps réel
- Rapport quotidien automatique

### ✅ Génération XML
- Génération automatique XML pour chaque lot de données valides
- Format ACS Cards avec en-tête CACS, Body, et pied XML
- Double entrée par enregistrement (CS + CP)
- IDs incrémentés via séquence DB
- Logs de génération dans table xml_logs

### ✅ Enrollment (Retour XML)
- Scan des fichiers de retour XML d'enrollment
- Parsing des réponses (statut, code erreur, description)
- Mise à jour du statut enrollment dans processed_records
- Logs détaillés dans enrollment_logs

### ✅ Historique et Traçabilité
- **Historique par PAN**: timeline complète par numéro de carte
- Validation par champ avec snapshot complet
- Modal timeline dans la page Records
- Source tracée (cron, upload, manual, api, url, correction)
- Tentatives numérotées avec statut SUCCESS/REJECTED/PARTIAL

### ✅ API Publique
- Endpoints REST pour soumission de données bancaires
- Authentification par clé API (préfixe acs_)
- Rate limiting
- Logs d'appels API
- Endpoint POST /api/v1/process pour soumission de lots

### ✅ Testeur API (ApiTester)
- Interface Postman-like intégrée
- Support GET/POST/PUT/DELETE
- Headers personnalisables
- Authentification (Bearer, Basic, API Key)
- Extraction de données par chemin (dataPath)
- Catalogue d'erreurs détaillé

### ✅ Gestion des Clés API
- CRUD complet des clés API
- Association à une banque
- Permissions (read/write)
- Statut actif/inactif
- Expiration configurable
- Tracking dernière utilisation

### ✅ Notifications
- Configuration SMTP
- Emails de notification par banque
- Logs d'envoi
- Rapport quotidien par email

### ✅ Backup Automatique
- Script pg_dump avec rotation (rétention configurable)
- Script de restore avec confirmation
- Backup planifiable via cron

## 🔧 Technologies Utilisées

### Backend
- **Node.js** v18 - Runtime JavaScript
- **Express** - Framework web
- **PostgreSQL** v15 - Base de données
- **JWT** - Authentification
- **bcrypt** - Hachage des mots de passe
- **csv-parser** - Parsing CSV
- **axios** - Requêtes HTTP
- **node-cron** - Planification de tâches
- **ssh2-sftp-client** - Client SFTP
- **basic-ftp** - Client FTP
- **nodemailer** - Emails
- **multer** - Upload fichiers
- **Jest** - Tests unitaires

### Frontend
- **React** v18 - Framework UI
- **React Router** v6 - Navigation
- **Axios** - Client HTTP
- **Lucide React** - Icônes
- **CSS3** - Styling moderne
- **Recharts** - Graphiques

### Infrastructure
- **Docker** - Conteneurisation
- **Docker Compose** - Orchestration
- **PostgreSQL** - Persistance des données

## 📊 Structure de la Base de Données

### Tables Principales

1. **users** - Utilisateurs du système
   - Authentification
   - Gestion des rôles (super_admin, bank)

2. **banks** - Configuration des banques
   - Codes et noms
   - URLs de traitement

3. **processed_records** - Enregistrements traités
   - Toutes les données validées
   - Statut enrollment
   - Contrainte UNIQUE(bank_id, pan)

4. **file_logs** - Logs de traitement
   - Métriques par fichier (total, valid, invalid, duplicate, updated)
   - Statuts de traitement
   - Source type (upload, url, api, manual)

5. **validation_errors** - Erreurs de validation
   - Détails des erreurs par champ
   - Statut de résolution

6. **record_history** - Historique par PAN
   - Timeline complète par numéro de carte
   - Tentatives numérotées
   - Snapshot des données reçues

7. **record_history_details** - Détail validation par champ
   - Erreurs et avertissements par champ
   - Corrections avec ancienne/nouvelle valeur

8. **xml_logs** - Logs de génération XML
   - Fichiers XML générés
   - Statut et compteurs

9. **enrollment_logs** - Logs d'enrollment
   - Retours XML traités
   - IDs non trouvés

10. **api_logs** - Logs appels API publique
    - Requêtes et réponses
    - Temps de traitement

11. **audit_logs** - Audit des actions utilisateurs
    - CREATE/UPDATE/DELETE users
    - IP et timestamp

12. **scan_logs** - Logs des scans CRON
    - Banques scannées
    - Fichiers trouvés/traités

13. **settings** - Paramètres système
    - Configuration CRON
    - Préférences

14. **notifications / smtp_config** - Notifications email

## 🚀 Démarrage Rapide

### 1. Prérequis
- Docker et Docker Compose installés
- 2GB RAM minimum
- 5GB espace disque

### 2. Lancement

```bash
# Méthode 1: Script automatique
./start.sh

# Méthode 2: Docker Compose direct
docker-compose up -d
```

### 3. Accès
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Database: localhost:5432

### 4. Connexion
- Super Admin: `admin` / `Admin@123`
- Bank User: `bankuser` / `Bank1234!`

## 📋 Format CSV Attendu

```csv
language;firstName;lastName;pan;expiry;phone;behaviour;action
fr;Ahmed;BenAli;4000056655665556;12/28;21699123456;otp;create
```

### Spécifications des Champs

| Champ | Type | Format | Validation |
|-------|------|--------|------------|
| language | String | fr/en/ar | Valeurs fixes |
| firstName | String | 2-255 chars | Requis |
| lastName | String | 2-255 chars | Requis |
| pan | String | 16 digits | Luhn check |
| expiry | String | MM/YY | Date valide (non expirée) |
| phone | String | 216XXXXXXXX | Format TN |
| behaviour | String | otp/sms/email | Valeurs fixes |
| action | String | update/create/delete | Valeurs fixes |

**Note**: Format expiry uniforme `MM/YY` depuis la version 1.1.0 (plus de format `YYYYMM`).

## 🔐 Sécurité

### Mesures Implémentées
- Authentification JWT avec expiration (24h)
- Hachage bcrypt des mots de passe (10 rounds)
- Protection CORS
- Validation côté serveur
- Sanitization des inputs
- Gestion des erreurs sécurisée
- Audit logs persistés
- RBAC complet (rôles super_admin et bank)
- Filtrage des données par banque

### Recommandations Production
1. Changer les secrets JWT
2. Utiliser HTTPS/SSL
3. Configurer un firewall
4. Limiter les taux de requêtes
5. Activer les sauvegardes automatiques
6. Configurer SMTP pour notifications

## 📈 Métriques et Monitoring

### Statistiques Disponibles
- Total fichiers traités
- Taux de succès/échec
- Lignes valides/invalides
- Doublons détectés
- Performance par banque
- Erreurs non résolues
- Statuts enrollment
- Scan logs temps réel

### Logs
- Tous les traitements sont loggés
- Timestamps précis
- Détails des erreurs
- Traçabilité complète par PAN
- Audit des actions utilisateurs

## 🎓 Workflow Typique

### Pour l'Utilisateur

1. **Connexion** → Login avec admin/Admin@123
2. **Vérifier Banques** → S'assurer que les banques sont configurées
3. **Traiter Fichier** → Choisir URL, Upload, Manuel ou API
4. **Analyser Résultats** → Voir les statistiques
5. **Corriger Erreurs** → Si nécessaire
6. **Voir Historique** → Timeline par PAN dans Records
7. **Générer XML** → Automatique après validation
8. **Surveiller Enrollment** → Statuts dans processed_records

### Pour le Système

1. **Détection** → Nouveau fichier trouvé (scan CRON)
2. **Téléchargement** → Fichier récupéré (HTTP/SFTP/FTP/File)
3. **Validation** → Vérification ligne par ligne
4. **Déduplication** → Check en base
5. **Traitement** → Sauvegarde si valide
6. **XML** → Génération fichier XML ACS Cards
7. **Enrollment** → Scan retour XML, mise à jour statut
8. **Déplacement** → Destination + Archive

## 🛠️ Maintenance

### Commandes Utiles

```bash
# Voir les logs
docker-compose logs -f

# Redémarrer un service
docker-compose restart backend

# Accéder à la base
docker-compose exec postgres psql -U banking_user -d banking_db

# Sauvegarder la base
./backend/scripts/backup.sh

# Restaurer la base
./backend/scripts/restore.sh ./backups/acs_db_*.sql.gz

# Lancer les tests
cd backend && npx jest

# Nettoyer
docker-compose down -v
```

### Dépannage

**Problème**: Services ne démarrent pas
```bash
docker-compose logs -f
docker-compose restart
```

**Problème**: Erreur de connexion DB
```bash
docker-compose restart postgres
```

**Problème**: Port déjà utilisé
```bash
# Modifier les ports dans docker-compose.yml
# Port 5000 bloqué par macOS ControlCenter -> utiliser port 5001
```

## 📚 Documentation

### Fichiers Disponibles

1. **README.md** - Documentation technique complète
2. **GUIDE_UTILISATEUR.md** - Guide pas à pas pour les utilisateurs
3. **INSTALLATION.md** - Instructions d'installation détaillées
4. **CHANGELOG.md** - Journal des modifications
5. **Ce fichier** - Synthèse du projet

## 🔄 Évolutions Futures Possibles

### Suggestions d'Amélioration

1. **Interface**
   - Thème sombre
   - Multi-langue (i18n)
   - Personnalisation UI

2. **Fonctionnalités**
   - Export PDF des rapports
   - Graphiques avancés
   - Documentation API Swagger
   - Webhooks pour événements

3. **Sécurité**
   - 2FA (Two-Factor Authentication)
   - Rate limiting avancé
   - Chiffrement des PAN en base

4. **Performance**
   - Cache Redis
   - Queue workers (Bull/BullMQ)
   - Batch processing optimisé
   - Compression des fichiers

5. **Intégration**
   - Webhooks sortants
   - SSO (Single Sign-On)
   - API externe enrichie

## 💡 Points Clés

### ✅ Points Forts
- Application complète et fonctionnelle
- Code bien structuré
- Documentation exhaustive
- Facilité de déploiement avec Docker
- Interface utilisateur intuitive
- Validation robuste des données
- Gestion complète des erreurs
- Traçabilité totale (PAN, fichiers, actions)

### 🎯 Cas d'Usage Principaux
1. Validation automatique de fichiers CSV bancaires
2. Détection et correction d'erreurs
3. Prévention des doublons
4. Génération XML ACS Cards
5. Traitement des retours enrollment
6. Traçabilité complète par numéro de carte
7. API publique pour partenaires

## 📞 Support

### En cas de problème

1. **Consulter la documentation**
   - README.md pour l'aspect technique
   - GUIDE_UTILISATEUR.md pour l'utilisation
   - INSTALLATION.md pour le déploiement

2. **Vérifier les logs**
   ```bash
   docker-compose logs -f
   ```

3. **Vérifier la configuration**
   - Fichiers .env
   - URLs des banques
   - Connexion base de données

4. **Redémarrer les services**
   ```bash
   docker-compose restart
   ```

## 🎉 Conclusion

Vous disposez maintenant d'une application complète de traitement de fichiers CSV bancaires avec:

- ✅ Interface web moderne et responsive
- ✅ API backend robuste (18 routes)
- ✅ Base de données PostgreSQL (15 tables)
- ✅ Validation complète des données
- ✅ Gestion des erreurs en temps réel
- ✅ Correction interactive
- ✅ Automatisation des traitements (CRON)
- ✅ Génération XML ACS Cards
- ✅ Traitement des retours enrollment
- ✅ Testeur API Postman-like intégré
- ✅ API publique avec clés d'accès
- ✅ Historique PAN avec timeline
- ✅ Notifications email
- ✅ Backup automatique PostgreSQL
- ✅ Tests unitaires
- ✅ Traçabilité et logs d'audit
- ✅ Documentation complète
- ✅ Déploiement Docker simplifié

**L'application est prête à être utilisée en développement et peut être déployée en production après configuration appropriée des paramètres de sécurité.**

---

**Version**: 1.1.0  
**Date**: Mai 2026  
**Stack**: React + Node.js + PostgreSQL + Docker
