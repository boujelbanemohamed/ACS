# 🚀 Guide de Démarrage Rapide - Local

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir installé :

### 1. Docker Desktop
- **Windows** : [Télécharger Docker Desktop pour Windows](https://www.docker.com/products/docker-desktop/)
- **Mac** : [Télécharger Docker Desktop pour Mac](https://www.docker.com/products/docker-desktop/)
- **Linux** : 
  ```bash
  # Ubuntu/Debian
  sudo apt-get update
  sudo apt-get install docker.io docker-compose
  
  # Fedora/CentOS
  sudo dnf install docker docker-compose
  ```

### Vérification de l'Installation
```bash
# Vérifier Docker
docker --version
# Résultat attendu : Docker version 20.x.x ou supérieur

# Vérifier Docker Compose
docker-compose --version
# Résultat attendu : Docker Compose version 2.x.x ou supérieur
```

## 📦 Installation de l'Application

### Étape 1 : Télécharger et Dézipper

1. **Téléchargez** le fichier `banking-csv-processor.zip`
2. **Dézippez** le fichier dans un dossier de votre choix
   - Windows : Clic droit → "Extraire tout"
   - Mac : Double-clic sur le fichier zip
   - Linux : `unzip banking-csv-processor.zip`

3. **Résultat** : Vous devriez avoir un dossier `banking-csv-processor/`

### Étape 2 : Configuration Initiale

Ouvrez un terminal (cmd, PowerShell, ou Terminal) et naviguez vers le dossier :

```bash
# Windows (PowerShell ou CMD)
cd C:\chemin\vers\banking-csv-processor

# Mac/Linux
cd /chemin/vers/banking-csv-processor
```

Créez le fichier de configuration :

```bash
# Windows (PowerShell)
copy backend\.env.example backend\.env

# Mac/Linux
cp backend/.env.example backend/.env
```

**Note** : Les valeurs par défaut dans `.env.example` fonctionnent pour un démarrage local. Vous n'avez pas besoin de les modifier pour commencer.

### Étape 3 : Lancer l'Application

#### Option A : Script Automatique (Recommandé)

**Mac/Linux** :
```bash
chmod +x start.sh
./start.sh
```

**Windows** :
```powershell
# Ouvrir PowerShell en tant qu'administrateur
docker-compose up -d
```

#### Option B : Commande Docker Compose Manuelle

```bash
# Démarrer tous les services
docker-compose up -d

# Voir les logs en temps réel (optionnel)
docker-compose logs -f
```

### Étape 4 : Vérification

Attendez 30 secondes que tous les services démarrent, puis vérifiez :

```bash
# Vérifier que les 3 services sont en cours d'exécution
docker-compose ps
```

Vous devriez voir :
```
NAME                   STATUS
banking_postgres       Up
banking_backend        Up
banking_frontend       Up
```

## 🌐 Accès à l'Application

### Ouvrir l'Application

1. Ouvrez votre navigateur web (Chrome, Firefox, Edge, Safari)
2. Allez à l'adresse : **http://localhost:3000**

### Première Connexion

```
👤 Nom d'utilisateur : admin
🔑 Mot de passe      : Admin@123
```

## 🎯 Tester l'Application

### Test Rapide

1. **Connexion** ✅
   - Utilisez les identifiants ci-dessus
   - Vous arrivez sur le Dashboard

2. **Voir les Banques** 🏦
   - Cliquez sur "Banques" dans le menu
   - Vous verrez 3 banques d'exemple (BT, ATB, STB)

3. **Tester le Traitement** 📄
   - Cliquez sur "Traitement"
   - Utilisez l'upload manuel
   - Uploadez le fichier `exemple_fichier_CSV.csv` (fourni dans le projet)

4. **Vérifier le Scanner** ⏰
   - Cliquez sur "Scan Automatique"
   - Vous verrez la configuration CRON
   - Lancez un scan manuel pour tester

## 📂 Structure des Dossiers

```
banking-csv-processor/
│
├── 📄 README.md                    # Documentation principale
├── 📄 GUIDE_UTILISATEUR.md         # Guide utilisateur complet
├── 📄 INSTALLATION.md              # Guide d'installation détaillé
├── 📄 CRON_CONFIGURATION.md        # Guide de configuration CRON
├── 📄 start.sh                     # Script de démarrage (Mac/Linux)
├── 🐳 docker-compose.yml           # Configuration Docker
│
├── backend/                        # API Node.js
│   ├── .env.example                # Fichier de configuration exemple
│   ├── package.json                # Dépendances backend
│   ├── server.js                   # Point d'entrée
│   ├── init.sql                    # Script BDD
│   ├── config/                     # Configuration
│   ├── routes/                     # Routes API
│   ├── services/                   # Logique métier
│   └── utils/                      # Utilitaires
│
└── frontend/                       # Application React
    ├── package.json                # Dépendances frontend
    ├── public/                     # Fichiers statiques
    └── src/                        # Code source React
        ├── components/             # Composants
        ├── pages/                  # Pages
        ├── contexts/               # Contexts React
        └── services/               # Services API
```

## 🛠️ Commandes Utiles

### Gestion de l'Application

```bash
# Démarrer l'application
docker-compose up -d

# Arrêter l'application
docker-compose down

# Redémarrer l'application
docker-compose restart

# Voir les logs
docker-compose logs -f

# Voir les logs d'un service spécifique
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# Arrêter et supprimer tous les conteneurs + données
docker-compose down -v
```

### Accès à la Base de Données

```bash
# Se connecter à PostgreSQL
docker-compose exec postgres psql -U banking_user -d banking_db

# Une fois connecté, vous pouvez exécuter des requêtes SQL
# Exemples :
SELECT * FROM banks;
SELECT * FROM users;
\q  # Quitter
```

### Vérifier l'État des Services

```bash
# Statut de tous les services
docker-compose ps

# Espace utilisé
docker system df

# Voir les conteneurs en cours
docker ps
```

## 🔧 Configuration Avancée

### Modifier le Port du Frontend

Si le port 3000 est déjà utilisé :

1. Éditez `docker-compose.yml`
2. Changez la ligne `"3000:3000"` en `"3001:3000"` (par exemple)
3. Redémarrez : `docker-compose up -d`
4. Accédez à : http://localhost:3001

### Modifier le Port du Backend

Si le port 5000 est déjà utilisé :

1. Éditez `docker-compose.yml`
2. Changez la ligne `"5000:5000"` en `"5001:5000"` (par exemple)
3. Éditez `backend/.env` et changez `PORT=5000` en `PORT=5001`
4. Redémarrez : `docker-compose up -d`

### Modifier la Configuration CRON

1. Éditez `backend/.env`
2. Modifiez la ligne `CRON_SCHEDULE=*/5 * * * *`
3. Exemples :
   ```env
   # Toutes les 10 minutes
   CRON_SCHEDULE=*/10 * * * *
   
   # Toutes les heures
   CRON_SCHEDULE=0 * * * *
   
   # Chaque jour à 9h
   CRON_SCHEDULE=0 9 * * *
   ```
4. Redémarrez : `docker-compose restart backend`

## ❌ Dépannage

### Problème 1 : Les services ne démarrent pas

**Vérification** :
```bash
docker-compose logs
```

**Solutions** :
- Vérifiez que Docker Desktop est bien lancé
- Vérifiez que les ports 3000, 5000, et 5432 ne sont pas utilisés
- Redémarrez Docker Desktop
- Essayez : `docker-compose down && docker-compose up -d`

### Problème 2 : "Cannot connect to database"

**Solution** :
```bash
# Attendre que PostgreSQL soit prêt
docker-compose logs postgres

# Si nécessaire, recréer la base
docker-compose down -v
docker-compose up -d
```

### Problème 3 : Page blanche sur http://localhost:3000

**Solutions** :
1. Attendez 1-2 minutes (le frontend peut prendre du temps à compiler)
2. Vérifiez les logs : `docker-compose logs frontend`
3. Videz le cache du navigateur (Ctrl+Shift+R ou Cmd+Shift+R)
4. Essayez un autre navigateur

### Problème 4 : Erreur "Permission denied" (Linux/Mac)

**Solution** :
```bash
# Donner les permissions au script
chmod +x start.sh

# Ou lancer avec sudo
sudo docker-compose up -d
```

### Problème 5 : Docker Compose n'est pas reconnu (Windows)

**Solution** :
1. Assurez-vous que Docker Desktop est installé et lancé
2. Utilisez PowerShell (pas CMD)
3. Redémarrez votre ordinateur après l'installation de Docker

## 📱 URLs de l'Application

Une fois lancée, vous pouvez accéder à :

- **Frontend** : http://localhost:3000
- **Backend API** : http://localhost:5000
- **Health Check** : http://localhost:5000/api/health
- **PostgreSQL** : localhost:5432
  - User: `banking_user`
  - Password: `banking_password`
  - Database: `banking_db`

## 📊 Données de Test

L'application est livrée avec :
- ✅ Un utilisateur admin : `admin` / `Admin@123`
- ✅ 3 banques d'exemple : BT, ATB, STB
- ✅ Un fichier CSV d'exemple à tester

## 🎓 Prochaines Étapes

Maintenant que l'application fonctionne :

1. **Explorez l'interface** 👀
   - Consultez le Dashboard
   - Gérez les banques
   - Testez le traitement de fichiers

2. **Lisez la documentation** 📚
   - `GUIDE_UTILISATEUR.md` - Guide complet
   - `CRON_CONFIGURATION.md` - Configuration du scanner
   - `README.md` - Documentation technique

3. **Configurez vos banques** 🏦
   - Ajoutez vos vraies banques
   - Configurez les URLs
   - Testez avec vos fichiers CSV

4. **Ajustez le scanner** ⏰
   - Modifiez la fréquence de scan
   - Testez le déclenchement manuel
   - Consultez l'historique

## 💾 Sauvegarde et Restauration

### Sauvegarder la Base de Données

```bash
docker-compose exec postgres pg_dump -U banking_user banking_db > backup.sql
```

### Restaurer la Base de Données

```bash
cat backup.sql | docker-compose exec -T postgres psql -U banking_user banking_db
```

## 🔄 Mise à Jour

Pour mettre à jour l'application :

1. Arrêtez les services : `docker-compose down`
2. Téléchargez la nouvelle version
3. Remplacez les fichiers
4. Redémarrez : `docker-compose up -d --build`

## 📞 Support

En cas de problème :

1. **Consultez les logs** : `docker-compose logs -f`
2. **Vérifiez la documentation** dans le dossier
3. **Vérifiez la configuration** dans `backend/.env`

## ✅ Checklist de Démarrage

- [ ] Docker Desktop installé et lancé
- [ ] Fichier dézippé
- [ ] Fichier `.env` créé dans `backend/`
- [ ] Commande `docker-compose up -d` exécutée
- [ ] Services en cours d'exécution (vérifiés avec `docker-compose ps`)
- [ ] Application accessible sur http://localhost:3000
- [ ] Connexion réussie avec admin/Admin@123

---

**Félicitations ! Votre application Banking CSV Processor est maintenant opérationnelle en local ! 🎉**

Pour toute question, consultez la documentation complète dans le dossier.
