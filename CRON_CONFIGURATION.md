# Scan Automatique (CRON)

## Configuration rapide

Dans `backend/.env` :

```env
CRON_SCHEDULE=*/5 * * * *
TZ=Africa/Tunis
```

La planification se configure aussi depuis l'interface web (**Scan Automatique > Config**).

## Exemples CRON

| Expression | Signification |
|---|---|
| `*/5 * * * *` | Toutes les 5 minutes |
| `*/15 * * * *` | Toutes les 15 minutes |
| `0 * * * *` | Toutes les heures |
| `0 8 * * *` | Chaque jour à 8h |
| `0 8 * * 1-5` | Lun-Ven à 8h |
| `0 0 * * *` | Chaque jour minuit |

## Format

```
minute heure jour mois jour_semaine
  (0-59) (0-23) (1-31) (1-12)  (0-6)
```

- `*` = toutes les valeurs
- `*/n` = toutes les n unités
- `n-m` = plage
- `n,m` = valeurs multiples

## Commandes utiles

```bash
# Statut
curl http://localhost:5000/api/scanner/status

# Logs
curl http://localhost:5000/api/scanner/logs?limit=10

# Scan manuel
curl -X POST http://localhost:5000/api/scanner/trigger -H "Authorization: Bearer VOTRE_TOKEN"
```

## Dépannage

- `docker-compose logs -f backend` — logs en temps réel
- `docker-compose restart backend` — redémarrer le service
- Vérifier que `is_active = true` pour les banques dans la base de données
