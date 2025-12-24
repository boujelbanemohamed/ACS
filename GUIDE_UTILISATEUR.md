# Guide d'Utilisation - Banking CSV Processor

## Table des Matières
1. [Première Connexion](#première-connexion)
2. [Dashboard](#dashboard)
3. [Gestion des Banques](#gestion-des-banques)
4. [Traitement des Fichiers](#traitement-des-fichiers)
5. [Correction des Erreurs](#correction-des-erreurs)
6. [FAQ](#faq)

---

## Première Connexion

### Étape 1: Accéder à l'Application
- Ouvrez votre navigateur
- Allez sur http://localhost:3000
- Vous arrivez sur la page de connexion

### Étape 2: Se Connecter
- **Nom d'utilisateur**: `admin`
- **Mot de passe**: `Admin@123`
- Cliquez sur "Se connecter"

### Étape 3: Navigation
Une fois connecté, vous verrez la barre latérale avec:
- 🏠 Dashboard
- 🏦 Banques
- 📄 Traitement

---

## Dashboard

### Vue d'Ensemble
Le dashboard affiche:

#### Statistiques Globales
- **Nombre de Banques**: Total des banques configurées
- **Fichiers Traités**: Nombre total de fichiers processés
- **Enregistrements**: Total des enregistrements en base
- **Fichiers avec Erreurs**: Fichiers nécessitant une attention

#### Activité Récente
Liste des derniers fichiers traités avec:
- Nom de la banque
- Nom du fichier
- Date et heure de traitement
- Nombre de lignes valides/invalides
- Statut (Succès ✅ / Erreur ⚠️)

#### Statistiques par Banque
Pour chaque banque:
- Nombre de fichiers traités
- Total des enregistrements

---

## Gestion des Banques

### Visualiser les Banques

1. Cliquez sur "Banques" dans le menu
2. Vous voyez toutes les banques configurées
3. Chaque carte affiche:
   - Code de la banque (ex: BT, ATB, STB)
   - Nom complet
   - Nombre de fichiers traités
   - Nombre d'enregistrements
   - URLs configurées

### Ajouter une Banque

1. Cliquez sur "+ Ajouter une banque"
2. Remplissez le formulaire:
   - **Code**: Identifiant court (ex: BNA)
   - **Nom**: Nom complet (ex: Banque Nationale Agricole)
   - **URL Source**: https://175.0.2.15/ACS/BNA
   - **URL Destination**: https://175.0.2.15/ACS/New/BNA
   - **URL Archives**: https://175.0.2.15/ACS/OLD/BNA
   - **Banque active**: Cocher pour activer
3. Cliquez sur "Créer"

### Modifier une Banque

1. Cliquez sur "Modifier" sur la carte de la banque
2. Modifiez les informations
3. Cliquez sur "Mettre à jour"

### Supprimer une Banque

1. Cliquez sur "Supprimer"
2. Confirmez la suppression
⚠️ **Attention**: Cette action est irréversible

---

## Traitement des Fichiers

### Méthode 1: Traitement par URL

Cette méthode vérifie automatiquement s'il y a de nouveaux fichiers à l'URL configurée.

#### Étapes:
1. Allez sur "Traitement"
2. Dans la section "Traitement par URL":
   - Sélectionnez une banque
   - L'URL est construite automatiquement: `https://175.0.2.15/ACS/[CODE_BANQUE]`
   - Cliquez sur "Lancer le traitement"

#### Résultat:
- Le système cherche les nouveaux fichiers
- Les télécharge
- Les valide
- Affiche les résultats

### Méthode 2: Upload Manuel

Utilisez cette méthode pour tester un fichier localement.

#### Étapes:
1. Dans la section "Upload Manuel":
   - Sélectionnez une banque
   - Cliquez sur "Choisir un fichier"
   - Sélectionnez votre fichier CSV
   - Cliquez sur "Uploader et traiter"

#### Résultat:
Le fichier est immédiatement:
- Uploadé
- Validé
- Résultat affiché

### Comprendre les Résultats

#### Traitement Réussi ✅
- Fond vert
- Message: "Fichier traité avec succès"
- Statistiques:
  - Total lignes
  - Lignes valides (vertes)
  - Lignes invalides (rouges)
  - Doublons (oranges)

#### Traitement avec Erreurs ⚠️
- Fond rouge/orange
- Message: "Fichier traité avec des erreurs"
- Liste des erreurs détaillées
- Possibilité de correction

---

## Correction des Erreurs

### Types d'Erreurs

#### Erreurs Critiques (Rouge)
Empêchent le traitement:
- Champ manquant
- Format invalide (PAN, téléphone, date)
- Valeur hors limite

#### Avertissements (Orange)
N'empêchent pas le traitement mais signalent:
- Carte expirée
- Validation Luhn échouée
- Doublons détectés

### Corriger une Erreur

#### Étape 1: Identifier l'Erreur
Chaque erreur affiche:
- **Ligne**: Numéro de ligne dans le CSV
- **Champ**: Quel champ est en erreur
- **Valeur**: La valeur incorrecte
- **Message**: Description du problème

#### Étape 2: Corriger
1. Cliquez sur "Corriger"
2. Saisissez la valeur corrigée
3. Cliquez sur ✅ pour valider
4. Ou ✖️ pour annuler

#### Étape 3: Retraiter
Après avoir corrigé toutes les erreurs:
1. Cliquez sur "Retraiter"
2. Le système revalide le fichier
3. Affiche les nouveaux résultats

### Télécharger le Fichier Corrigé

Une fois toutes les erreurs corrigées:
1. Cliquez sur "Télécharger CSV corrigé"
2. Le fichier est téléchargé avec:
   - Toutes les données valides
   - Corrections appliquées
   - Format CSV correct

---

## Format CSV Attendu

### Structure du Fichier

```csv
language;firstName;lastName;pan;expiry;phone;behaviour;action;;;
fr;DUPONT JEAN;DUPONT JEAN;4741555555555550;202412;21624080852;otp;update;;;
```

### Champs Détaillés

| Champ | Format | Exemple | Règles |
|-------|--------|---------|---------|
| language | 2 lettres | fr, en, ar | Valeurs: fr, en, ar |
| firstName | Texte | DUPONT JEAN | 2-255 caractères |
| lastName | Texte | DUPONT JEAN | 2-255 caractères |
| pan | 16 chiffres | 4741555555555550 | Validation Luhn |
| expiry | YYYYMM | 202412 | Année 2024-2050, Mois 01-12 |
| phone | 11 chiffres | 21624080852 | Format: 216XXXXXXXX |
| behaviour | Texte | otp, sms, email | Valeurs fixes |
| action | Texte | update, create, delete | Valeurs fixes |

### Exemples d'Erreurs Courantes

#### PAN Invalide
❌ `474155555` (trop court)  
✅ `4741555555555550` (16 chiffres)

#### Date Expiration Invalide
❌ `2024` ou `20241` (format incorrect)  
✅ `202412` (YYYYMM)

#### Téléphone Invalide
❌ `24080852` (pas de préfixe)  
❌ `+21624080852` (pas de +)  
✅ `21624080852` (format correct)

---

## Workflow Complet

### Scénario: Traiter un Nouveau Fichier

1. **Connexion**
   - Se connecter à l'application

2. **Vérifier les Banques**
   - Aller sur "Banques"
   - S'assurer que la banque existe
   - Vérifier les URLs

3. **Lancer le Traitement**
   - Aller sur "Traitement"
   - Choisir la méthode (URL ou Upload)
   - Sélectionner la banque
   - Lancer

4. **Analyser les Résultats**
   - Vérifier les statistiques
   - Identifier les erreurs s'il y en a

5. **Corriger si Nécessaire**
   - Corriger les erreurs une par une
   - Retraiter
   - Vérifier à nouveau

6. **Finaliser**
   - Télécharger le fichier corrigé
   - Vérifier le dashboard pour confirmation

---

## FAQ

### Q: Que se passe-t-il après un traitement réussi?
**R**: Le fichier valide est:
1. Sauvegardé en base de données
2. Déplacé vers le dossier de destination
3. L'original est archivé avec préfixe OLD_

### Q: Puis-je traiter plusieurs fichiers en même temps?
**R**: Non, traitez les fichiers un par un pour éviter les conflits.

### Q: Comment savoir si un fichier a déjà été traité?
**R**: Le système détecte automatiquement les doublons basés sur PAN + expiry + phone.

### Q: Que faire si je n'arrive pas à corriger une erreur?
**R**: 
1. Vérifiez le format attendu dans ce guide
2. Consultez les exemples
3. Si nécessaire, éditez le fichier CSV directement et ré-uploadez

### Q: Les fichiers sont-ils traités automatiquement?
**R**: Oui, le système vérifie automatiquement toutes les 5 minutes (configurable).

### Q: Puis-je annuler un traitement?
**R**: Non, une fois lancé, le traitement va jusqu'au bout. Mais vous pouvez ignorer les résultats.

### Q: Comment voir l'historique?
**R**: Allez sur Dashboard > Activité Récente pour voir les derniers traitements.

### Q: Puis-je traiter des fichiers d'autres formats?
**R**: Non, seuls les fichiers CSV avec séparateur point-virgule (;) sont acceptés.

### Q: Que signifie "Validation Luhn"?
**R**: C'est un algorithme de validation des numéros de carte bancaire.

### Q: Les données sont-elles sécurisées?
**R**: Oui, l'application utilise:
- Authentification JWT
- Connexion HTTPS (en production)
- Base de données PostgreSQL sécurisée

---

## Support

En cas de problème:
1. Vérifiez ce guide
2. Consultez les logs dans le dashboard
3. Vérifiez la configuration des banques
4. Contactez l'administrateur système

---

**Bonne utilisation !** 🚀

---

## Gestion du Scanner Automatique

### Accéder au Scanner

1. Connectez-vous à l'application
2. Cliquez sur **"Scan Automatique"** dans le menu (icône ⏰)

### Interface du Scanner

#### Section "Statut Actuel"

Affiche en temps réel :
- **État** : 
  - 🔄 "Scan en cours" si un scan est actif
  - ✅ "Inactif" si aucun scan n'est en cours
  
- **Configuration** :
  - Le planning CRON configuré (ex: `*/5 * * * *`)
  - Description en français (ex: "toutes les 5 minutes")
  
- **Fuseau horaire** : Le fuseau configuré (ex: Africa/Tunis)

- **Dernier scan** : Date et heure du dernier scan effectué

- **Prochain scan estimé** : Quand aura lieu le prochain scan automatique

#### Section "Planification"

Explique :
- Comment fonctionne le scanner
- Les étapes du traitement automatique
- Des exemples de configuration CRON
- Comment modifier la planification

#### Section "Historique des Scans"

Tableau avec :
- Date et heure de chaque scan
- Nombre de banques vérifiées
- Fichiers trouvés
- Fichiers traités avec succès
- Nombre d'erreurs
- Statut (Succès ✅ / Avec erreurs ⚠️)

### Lancer un Scan Manuel

Pour forcer un scan immédiatement :

1. Cliquez sur **"Lancer un scan manuel"**
2. Attendez que le scan se termine (quelques secondes à quelques minutes)
3. Une alerte affiche les résultats :
   - Nombre de banques scannées
   - Fichiers trouvés
   - Fichiers traités

**Note** : Vous ne pouvez pas lancer un nouveau scan si un scan est déjà en cours.

### Comprendre le Fonctionnement

#### Workflow Automatique

1. **Déclenchement** ⏰
   - Le système se déclenche automatiquement selon la planification

2. **Vérification** 🔍
   - Le scanner vérifie toutes les banques actives
   - Pour chaque banque, il regarde le dossier source

3. **Détection** 📁
   - Liste tous les fichiers CSV présents
   - Ignore les fichiers déjà traités

4. **Traitement** 🔄
   - Pour chaque nouveau fichier :
     - Téléchargement
     - Validation complète
     - Détection de doublons
     - Génération de rapport

5. **Actions** ✅
   - Si succès : sauvegarde, déplacement, archivage
   - Si erreurs : génération de rapport d'erreurs

6. **Notification** 📊
   - Mise à jour du dashboard
   - Enregistrement dans l'historique

### Modifier la Configuration

Pour changer la fréquence des scans :

1. Accédez au serveur (SSH ou Docker)
2. Éditez le fichier `.env` dans le dossier `backend/`
3. Modifiez la ligne `CRON_SCHEDULE`
4. Redémarrez le serveur : `docker-compose restart backend`

**Exemples** :
```env
# Toutes les 5 minutes (défaut)
CRON_SCHEDULE=*/5 * * * *

# Toutes les 15 minutes
CRON_SCHEDULE=*/15 * * * *

# Toutes les heures
CRON_SCHEDULE=0 * * * *

# Deux fois par jour (8h et 20h)
CRON_SCHEDULE=0 8,20 * * *

# Du lundi au vendredi à 9h
CRON_SCHEDULE=0 9 * * 1-5
```

### Vérifier les Logs

Pour voir ce qui se passe en arrière-plan :

```bash
# Voir les logs du scanner
docker-compose logs -f backend | grep "🔍"

# Voir tous les logs
docker-compose logs -f backend
```

### FAQ Scanner

**Q: À quelle fréquence le scanner vérifie-t-il les fichiers ?**  
**R**: Par défaut toutes les 5 minutes. Configurable via `CRON_SCHEDULE`.

**Q: Le scanner traite-t-il les mêmes fichiers plusieurs fois ?**  
**R**: Non, le système détecte automatiquement les fichiers déjà traités et les ignore.

**Q: Que se passe-t-il si un scan est en cours et qu'un autre devrait démarrer ?**  
**R**: Le nouveau scan est ignoré. Un seul scan peut être actif à la fois.

**Q: Puis-je désactiver le scanner automatique ?**  
**R**: Oui, commentez la ligne `CRON_SCHEDULE` dans le fichier `.env` ou arrêtez le service backend.

**Q: Les scans manuels suivent-ils la même logique ?**  
**R**: Oui, exactement. Un scan manuel fait exactement la même chose qu'un scan automatique.

**Q: Où sont stockés les résultats des scans ?**  
**R**: Dans la table `scan_logs` de la base de données. Accessibles via l'interface web.

**Q: Le scanner fonctionne-t-il la nuit et le week-end ?**  
**R**: Oui, sauf si vous configurez des horaires spécifiques dans le CRON.

**Q: Que faire si aucun fichier n'est détecté ?**  
**R**: Vérifiez :
  1. Que les banques sont actives
  2. Que les URLs sont correctes
  3. Que les fichiers existent dans les dossiers sources
  4. Les logs pour voir les messages d'erreur

---

**Bonne utilisation du scanner automatique !** 🚀
