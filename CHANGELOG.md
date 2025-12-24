# Changelog - Banking CSV Processor

## Version 1.1.0 - Scanner Automatique CRON (Décembre 2024)

### 🎉 Nouvelles Fonctionnalités

#### Scanner Automatique Avancé
- ✅ **Service de scan complet** avec détection automatique de fichiers
- ✅ **Configuration CRON flexible** avec support de tous les formats standards
- ✅ **Multi-protocole** : HTTP/HTTPS, File System, FTP/SFTP (préparé)
- ✅ **Détection intelligente** : ignore les fichiers déjà traités
- ✅ **Logging détaillé** : tous les scans sont enregistrés en base de données
- ✅ **Statistiques en temps réel** : monitoring complet de l'activité

#### Interface de Gestion du CRON
- ✅ **Page dédiée** "Scan Automatique" dans l'application
- ✅ **Statut en direct** : voir si un scan est en cours
- ✅ **Déclenchement manuel** : lancer un scan à tout moment
- ✅ **Historique des scans** : consulter tous les scans passés
- ✅ **Configuration visible** : planning et fuseau horaire affichés

#### API Scanner
- ✅ `GET /api/scanner/status` - Obtenir le statut actuel
- ✅ `POST /api/scanner/trigger` - Déclencher un scan manuel
- ✅ `GET /api/scanner/logs` - Consulter l'historique des scans

### 📝 Améliorations

#### Backend
- 🔧 Nouveau service `FileScanner` dédié au scanning
- 🔧 Support de multiples protocoles de fichiers
- 🔧 Gestion des erreurs améliorée avec retry logic
- 🔧 Table `scan_logs` pour l'historique complet
- 🔧 Messages de log enrichis et colorés
- 🔧 Validation de la configuration CRON au démarrage

#### Frontend
- 🎨 Nouvelle page CronManager avec interface moderne
- 🎨 Affichage en temps réel du statut du scanner
- 🎨 Visualisation de la planification CRON
- 🎨 Tableau d'historique des scans
- 🎨 Navigation enrichie avec icône Clock

#### Configuration
- ⚙️ Variables d'environnement étendues :
  - `CRON_SCHEDULE` - Planning du scanner
  - `TZ` - Fuseau horaire
  - `SCAN_ON_STARTUP` - Scan au démarrage
  - `MAX_FILES_PER_SCAN` - Limite de fichiers
  - `HTTP_TIMEOUT` - Timeout des requêtes

#### Documentation
- 📚 **CRON_CONFIGURATION.md** - Guide complet de configuration
- 📚 README mis à jour avec section CRON
- 📚 Exemples de configuration pour différents scénarios
- 📚 Guide de dépannage

### 🔍 Détails Techniques

#### FileScanner Service
```javascript
// Fonctionnalités principales
- scanAllBanks() : Scan de toutes les banques actives
- scanBank(bank) : Scan d'une banque spécifique
- listFilesInDirectory(url) : Liste les fichiers selon le protocole
- isFileAlreadyProcessed() : Vérification des doublons
- logScanResults() : Enregistrement en base de données
```

#### Protocoles Supportés
1. **HTTP/HTTPS** ✅
   - API REST retournant JSON
   - Parsing de listing HTML
   - Téléchargement de fichiers

2. **File System** ✅
   - Chemins absolus
   - Protocole file://
   - Montages NFS/Samba

3. **FTP/SFTP** 🚧
   - Préparé et documenté
   - Nécessite installation de modules supplémentaires

#### Format des Logs
```json
{
  "scan_time": "2024-12-22T14:05:00.000Z",
  "banks_scanned": 3,
  "files_found": 5,
  "files_processed": 4,
  "errors_count": 1,
  "error_details": [...]
}
```

### 🎯 Cas d'Usage

#### Production
```env
# Scan toutes les 10 minutes
CRON_SCHEDULE=*/10 * * * *
TZ=Africa/Tunis
SCAN_ON_STARTUP=false
MAX_FILES_PER_SCAN=5
```

#### Développement
```env
# Scan toutes les minutes pour les tests
CRON_SCHEDULE=*/1 * * * *
TZ=UTC
SCAN_ON_STARTUP=true
MAX_FILES_PER_SCAN=10
```

#### Heures Ouvrables Uniquement
```env
# Du lundi au vendredi, de 8h à 18h, toutes les 15 minutes
CRON_SCHEDULE=*/15 8-18 * * 1-5
```

### 📦 Fichiers Ajoutés

**Backend:**
- `backend/services/fileScanner.js` - Service de scanning
- `backend/routes/scanner.js` - Routes API (intégrées dans server.js)

**Frontend:**
- `frontend/src/pages/CronManager.js` - Page de gestion
- `frontend/src/pages/CronManager.css` - Styles

**Documentation:**
- `CRON_CONFIGURATION.md` - Guide complet
- `CHANGELOG.md` - Ce fichier

### 🔄 Migration

Aucune migration nécessaire. Les nouvelles fonctionnalités sont rétrocompatibles.

Si vous upgradez depuis la version 1.0.0 :

1. Récupérer les derniers fichiers
2. Redémarrer les services : `docker-compose restart`
3. La table `scan_logs` sera créée automatiquement

### ⚠️ Breaking Changes

Aucun breaking change. Toutes les fonctionnalités existantes restent inchangées.

### 🐛 Corrections de Bugs

- Correction de la gestion des timeouts HTTP
- Amélioration de la détection des fichiers déjà traités
- Fix des messages de log pour les erreurs de parsing CSV

### 🔐 Sécurité

- Validation des expressions CRON au démarrage
- Authentification requise pour le déclenchement manuel
- Logs d'audit complets
- Isolation Docker maintenue

---

## Version 1.0.0 - Version Initiale (Décembre 2024)

### Fonctionnalités Initiales

- ✅ Authentification JWT
- ✅ Gestion des banques (CRUD)
- ✅ Traitement des fichiers CSV
- ✅ Validation complète des données
- ✅ Correction interactive des erreurs
- ✅ Dashboard avec statistiques
- ✅ Déplacement et archivage automatique
- ✅ Docker Compose pour le déploiement
- ✅ Documentation complète

---

**Mainteneur** : Équipe Banking CSV Processor  
**Licence** : Usage Interne
