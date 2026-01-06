# Solutions aux problèmes rencontrés

## Problème 1 : Erreur "UNKNOWN: unknown error, read" sur Mac
**Solution** : Supprimer les volumes bind-mount dans docker-compose.yml
- Supprimer `volumes: - ./backend:/app` pour le service backend
- Supprimer `volumes: - ./frontend:/app` pour le service frontend

## Problème 2 : Route /api/records/file-content/byname retourne 404
**Solution** : La route cherchait des fichiers CSV mais le frontend demandait XML
- La route convertit maintenant correctement .xml en .csv
- Mise à jour des noms de fichiers dans la base de données

## Problème 3 : Rate limiting trop strict
**Solution** : Configuration adaptée dans le backend
- Limite de 5 requêtes/15min pour /auth/login
- Limite de 500 requêtes/15min pour les autres routes
