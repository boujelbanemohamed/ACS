# Configuration du Scan Automatique (CRON)

## 📋 Vue d'Ensemble

Le système Banking CSV Processor inclut un **scanner automatique** qui vérifie périodiquement les dossiers de toutes les banques actives pour détecter et traiter automatiquement les nouveaux fichiers CSV.

## ⚙️ Configuration

### Variables d'Environnement

Éditez le fichier `backend/.env` pour configurer le comportement du scanner :

```env
# Planification CRON
CRON_SCHEDULE=*/5 * * * *

# Fuseau horaire
TZ=Africa/Tunis

# Scan au démarrage (true/false)
SCAN_ON_STARTUP=false

# Nombre maximum de fichiers par scan
MAX_FILES_PER_SCAN=10

# Timeout pour les requêtes HTTP (millisecondes)
HTTP_TIMEOUT=15000
```

### Format CRON

Le format CRON suit la syntaxe standard Unix :

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Jour de la semaine (0-7, 0 et 7 = Dimanche)
│ │ │ └───── Mois (1-12)
│ │ └─────── Jour du mois (1-31)
│ └───────── Heure (0-23)
└─────────── Minute (0-59)
```

### Exemples de Configuration

#### Vérification Fréquente
```env
# Toutes les minutes (développement/test uniquement)
CRON_SCHEDULE=* * * * *

# Toutes les 2 minutes
CRON_SCHEDULE=*/2 * * * *

# Toutes les 5 minutes (recommandé pour production)
CRON_SCHEDULE=*/5 * * * *

# Toutes les 10 minutes
CRON_SCHEDULE=*/10 * * * *

# Toutes les 15 minutes
CRON_SCHEDULE=*/15 * * * *

# Toutes les 30 minutes
CRON_SCHEDULE=*/30 * * * *
```

#### Vérification Horaire
```env
# Toutes les heures
CRON_SCHEDULE=0 * * * *

# Toutes les 2 heures
CRON_SCHEDULE=0 */2 * * *

# Toutes les 6 heures (0h, 6h, 12h, 18h)
CRON_SCHEDULE=0 */6 * * *
```

#### Vérification Quotidienne
```env
# Chaque jour à minuit
CRON_SCHEDULE=0 0 * * *

# Chaque jour à 8h du matin
CRON_SCHEDULE=0 8 * * *

# Chaque jour à 14h (2h PM)
CRON_SCHEDULE=0 14 * * *

# Deux fois par jour (8h et 20h)
CRON_SCHEDULE=0 8,20 * * *
```

#### Vérification Hebdomadaire
```env
# Chaque lundi à 9h
CRON_SCHEDULE=0 9 * * 1

# Du lundi au vendredi à 10h
CRON_SCHEDULE=0 10 * * 1-5

# Week-end uniquement (samedi et dimanche à 12h)
CRON_SCHEDULE=0 12 * * 0,6
```

## 🔍 Fonctionnement du Scanner

### Workflow Automatique

1. **Déclenchement**
   - Le cron se déclenche selon la planification configurée
   - Un message est loggé avec l'horodatage

2. **Récupération des Banques**
   - Le système récupère toutes les banques actives
   - Ignore les banques désactivées

3. **Scan des Dossiers**
   - Pour chaque banque, le système vérifie le dossier source
   - Supporte : HTTP/HTTPS, système de fichiers local, FTP/SFTP (à venir)

4. **Détection des Fichiers**
   - Liste tous les fichiers CSV présents
   - Vérifie si le fichier a déjà été traité

5. **Traitement Automatique**
   - Télécharge le fichier
   - Valide la structure et les données
   - Détecte les doublons
   - Génère un rapport

6. **Actions Post-Traitement**
   - Si succès : 
     - Sauvegarde en base de données
     - Déplace vers le dossier de destination
     - Archive l'original avec préfixe OLD_
   - Si erreurs :
     - Génère un rapport d'erreurs
     - Log dans la base de données

7. **Logging**
   - Tous les résultats sont enregistrés
   - Accessibles via l'interface web

### Protocoles Supportés

#### 1. HTTP/HTTPS ✅
```env
# Exemple de configuration banque
source_url=https://175.0.2.15/ACS/BT
```

Le scanner peut :
- Lire une API REST qui retourne une liste de fichiers (JSON)
- Parser un listing de répertoire HTML
- Télécharger des fichiers via HTTP(S)

#### 2. Système de Fichiers Local ✅
```env
# Exemple avec chemin absolu
source_url=/var/data/banks/BT

# Exemple avec protocole file://
source_url=file:///var/data/banks/BT
```

Utilisé quand les fichiers sont montés localement (ex: NFS, Samba).

#### 3. FTP/SFTP 🚧 (À venir)
```env
# FTP
source_url=ftp://user:password@server.com/banks/BT

# SFTP
source_url=sftp://user:password@server.com/banks/BT
```

Nécessite l'installation de bibliothèques supplémentaires :
```bash
npm install ssh2-sftp-client
```

## 📊 Monitoring

### Interface Web

Accédez à la page **"Scan Automatique"** dans l'application pour :

- ✅ Voir le statut actuel du scanner
- ✅ Consulter la planification configurée
- ✅ Déclencher un scan manuel
- ✅ Voir l'historique des scans
- ✅ Analyser les statistiques

### Logs Console

Les logs du scanner sont affichés dans la console du serveur :

```bash
# Voir les logs en temps réel
docker-compose logs -f backend
```

Exemple de sortie :
```
═══════════════════════════════════════════════════════════════════
🔔 Cron triggered at: 2024-12-22T14:05:00.000Z
═══════════════════════════════════════════════════════════════════
🔍 Starting automatic file scan at 2024-12-22T14:05:00.000Z
📋 Found 3 active banks to check

🏦 Checking bank: Banque de Tunisie (BT)
   📁 Found 2 file(s) for Banque de Tunisie
   ⏭️  Skipping data_20241220.csv (already processed)
   🔄 Processing data_20241222.csv...
   ✅ Successfully processed data_20241222.csv

🏦 Checking bank: Arab Tunisian Bank (ATB)
   ℹ️  No new files found for Arab Tunisian Bank

🏦 Checking bank: Société Tunisienne de Banque (STB)
   📁 Found 1 file(s) for Société Tunisienne de Banque
   🔄 Processing stb_data.csv...
   ⚠️  Processed stb_data.csv with errors

════════════════════════════════════════════════════════════════
📊 Scan Summary:
   Banks scanned: 3/3
   Files found: 3
   Files processed: 2
   Errors: 1
════════════════════════════════════════════════════════════════
```

### Base de Données

Table `scan_logs` :
```sql
SELECT * FROM scan_logs ORDER BY scan_time DESC LIMIT 10;
```

Contient :
- Horodatage de chaque scan
- Nombre de banques scannées
- Fichiers trouvés et traités
- Détails des erreurs (JSON)

## 🚀 Démarrage et Gestion

### Démarrer le Scanner

Le scanner démarre automatiquement avec le serveur :

```bash
docker-compose up -d
```

### Vérifier le Statut

```bash
# Logs du backend
docker-compose logs -f backend

# Ou via l'API
curl http://localhost:5000/api/scanner/status
```

### Déclencher un Scan Manuel

#### Via l'Interface Web
1. Aller sur "Scan Automatique"
2. Cliquer sur "Lancer un scan manuel"

#### Via l'API
```bash
curl -X POST http://localhost:5000/api/scanner/trigger \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Arrêter le Scanner

```bash
# Arrêter tous les services
docker-compose down

# Ou redémarrer juste le backend
docker-compose restart backend
```

## ⚡ Optimisation des Performances

### Recommandations

1. **Fréquence de Scan**
   - Production : `*/5 * * * *` ou `*/10 * * * *`
   - Développement : `*/1 * * * *` ou `*/2 * * * *`
   - Éviter les scans trop fréquents qui peuvent surcharger le système

2. **Nombre de Fichiers**
   - Configurer `MAX_FILES_PER_SCAN` pour limiter la charge
   - Traiter les gros volumes en plusieurs scans

3. **Timeout HTTP**
   - Ajuster `HTTP_TIMEOUT` selon la vitesse de votre réseau
   - Augmenter pour les connexions lentes

4. **Fuseau Horaire**
   - Toujours configurer `TZ` pour des horaires précis
   - Exemple : `Africa/Tunis`, `Europe/Paris`, `UTC`

### Exemple de Configuration Production

```env
# Scan toutes les 10 minutes en heures ouvrables
CRON_SCHEDULE=*/10 * * * *

# Fuseau horaire Tunisie
TZ=Africa/Tunis

# Pas de scan au démarrage (évite la surcharge)
SCAN_ON_STARTUP=false

# Maximum 5 fichiers par scan
MAX_FILES_PER_SCAN=5

# Timeout généreux
HTTP_TIMEOUT=30000
```

## 🔒 Sécurité

### Bonnes Pratiques

1. **Authentification**
   - L'API de scan manuel nécessite un token JWT
   - Seuls les utilisateurs authentifiés peuvent déclencher des scans

2. **Validation**
   - Tous les fichiers sont validés avant traitement
   - Les fichiers invalides ne sont pas déplacés

3. **Isolation**
   - Le scanner s'exécute dans un conteneur Docker isolé
   - Limite l'impact en cas d'erreur

4. **Logging**
   - Tous les accès et actions sont loggés
   - Audit trail complet dans la base de données

## 🐛 Dépannage

### Le scanner ne se déclenche pas

**Vérifications** :
```bash
# 1. Vérifier que le service est démarré
docker-compose ps

# 2. Vérifier les logs
docker-compose logs backend | grep "Automated file scanning"

# 3. Vérifier la configuration CRON
docker-compose exec backend env | grep CRON_SCHEDULE
```

**Solutions** :
- Vérifier que `CRON_SCHEDULE` est valide
- Redémarrer le service : `docker-compose restart backend`
- Vérifier le fuseau horaire

### Pas de fichiers détectés

**Vérifications** :
```bash
# Vérifier les URLs des banques
docker-compose exec postgres psql -U banking_user -d banking_db \
  -c "SELECT name, source_url, is_active FROM banks;"
```

**Solutions** :
- Vérifier que les banques sont actives (`is_active = true`)
- Tester manuellement l'accès aux URLs
- Vérifier les permissions d'accès

### Erreurs de traitement

**Vérifications** :
```bash
# Voir les erreurs récentes
docker-compose exec postgres psql -U banking_user -d banking_db \
  -c "SELECT * FROM scan_logs ORDER BY scan_time DESC LIMIT 5;"
```

**Solutions** :
- Consulter les détails d'erreur dans `error_details`
- Vérifier les logs de validation
- Tester avec un scan manuel

## 📚 Ressources

### Outils Utiles

- **Crontab Guru** : https://crontab.guru/
  - Tester et valider vos expressions CRON

- **Cron Expression Generator** : https://www.freeformatter.com/cron-expression-generator-quartz.html
  - Générer des expressions CRON visuellement

### Commandes Utiles

```bash
# Voir tous les scans récents
curl http://localhost:5000/api/scanner/logs?limit=20

# Statut actuel
curl http://localhost:5000/api/scanner/status

# Scan manuel (nécessite authentification)
curl -X POST http://localhost:5000/api/scanner/trigger \
  -H "Authorization: Bearer YOUR_TOKEN"

# Statistiques globales
curl http://localhost:5000/api/dashboard/stats
```

## 🎯 Cas d'Usage

### Scénario 1 : Banque avec dépôts quotidiens
```env
# Un fichier déposé chaque jour à 2h du matin
# Scanner à 3h pour laisser le temps au dépôt
CRON_SCHEDULE=0 3 * * *
```

### Scénario 2 : Banque avec dépôts en continu
```env
# Fichiers déposés tout au long de la journée
# Scanner toutes les 5 minutes en heures ouvrables
CRON_SCHEDULE=*/5 8-18 * * 1-5
```

### Scénario 3 : Multiple banques, horaires différents
```env
# Scan fréquent pour capturer tous les dépôts
# Le système ignore les fichiers déjà traités
CRON_SCHEDULE=*/10 * * * *
```

### Scénario 4 : Environnement de test
```env
# Scan très fréquent pour les tests
CRON_SCHEDULE=*/1 * * * *
SCAN_ON_STARTUP=true
```

---

**Date de dernière mise à jour** : Décembre 2024  
**Version** : 1.0.0
