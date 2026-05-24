# Déploiement Production — RedHat Enterprise Linux

## 1. Prérequis

```bash
# Mettre à jour le système
sudo dnf update -y

# Installer Docker & Docker Compose
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker

# Ouvrir les ports firewall
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload

# Vérifier les versions
docker --version
docker compose version
```

## 2. Cloner le projet

```bash
cd /opt
sudo git clone https://github.com/boujelbanemohamed/ACS.git banking-app
sudo chown -R $(whoami):$(whoami) banking-app
cd banking-app
```

## 3. Générer les secrets

```bash
openssl rand -base64 64   # → JWT_SECRET
openssl rand -base64 32   # → PAN_ENCRYPTION_KEY
```

## 4. Configurer l'environnement

Éditer `backend/.env.production` :

```bash
vim backend/.env.production
```

Remplacer AU MOINS :

| Variable | Valeur |
|---|---|
| `DB_PASSWORD` | Mot de passe fort (ex: `openssl rand -base64 32`) |
| `JWT_SECRET` | Clé générée à l'étape 3 |
| `PAN_ENCRYPTION_KEY` | Clé générée à l'étape 3 |
| `CORS_ORIGIN` | URL du domaine frontend (ex: `https://acs.monserveur.com`) |

## 5. Lancer les conteneurs

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file ./backend/.env.production up -d
```

## 6. Vérifier le déploiement

```bash
# État des conteneurs
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Logs en direct
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Tester l'API health
curl http://localhost:5000/api/health

# Tester le frontend
curl -I http://localhost:8080
```

## 7. Commandes utiles

```bash
# Arrêter
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Redémarrer un service spécifique
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend

# Voir les logs d'un service
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker

# Mettre à jour (après un git pull)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 8. Sauvegarde de la base de données

```bash
# Sauvegarde
docker exec banking_postgres_prod pg_dump -U banking_user banking_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Restauration
cat backup.sql | docker exec -i banking_postgres_prod psql -U banking_user banking_db
```

## 9. Monitoring

```bash
# Ressources des conteneurs
docker stats

# Logs applicatifs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100

# Espace disque
df -h /var/lib/docker
```
