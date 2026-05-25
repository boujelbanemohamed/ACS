const express = require('express');
const router = express.Router();

const endpoints = {
  auth: {
    title: 'Authentification',
    description: 'Gestion de l\'authentification, des mots de passe et des sessions.',
    basePath: '/api/auth',
    endpoints: [
      { method: 'POST', path: '/login', description: 'Authentification utilisateur (JWT). Retourne un token et les infos utilisateur.', auth: 'none', roles: ['tous'], body: { username: 'string (requis)', password: 'string (requis)' }, response: { success: true, data: { token: 'jwt...', user: { id: 1, username: 'admin', role: 'super_admin' }, must_change_password: false } } },
      { method: 'PUT', path: '/change-password', description: 'Changer son propre mot de passe (nécessite l\'ancien mot de passe).', auth: 'jwt', roles: ['tous'], body: { currentPassword: 'string (requis)', newPassword: 'string (requis, min 8)' } },
      { method: 'GET', path: '/password-status', description: 'Vérifier si le mot de passe de l\'utilisateur connecté est expiré.', auth: 'jwt', roles: ['tous'] },
      { method: 'POST', path: '/forgot-password', description: 'Demander un email de réinitialisation de mot de passe.', auth: 'none', roles: ['tous'], body: { email: 'string (requis)' } },
      { method: 'POST', path: '/reset-password', description: 'Réinitialiser le mot de passe avec un token reçu par email.', auth: 'none', roles: ['tous'], body: { token: 'string (requis)', password: 'string (requis, min 6)' } },
    ]
  },
  banks: {
    title: 'Banques',
    description: 'Gestion des banques (CRUD), statistiques et configuration des dossiers SFTP.',
    basePath: '/api/banks',
    endpoints: [
      { method: 'GET', path: '/', description: 'Lister toutes les banques actives avec le nombre d\'enregistrements et fichiers traités.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/:id', description: 'Détails d\'une banque spécifique.', auth: 'jwt', roles: ['tous'] },
      { method: 'POST', path: '/', description: 'Créer une nouvelle banque.', auth: 'jwt', roles: ['super_admin'], body: { code: 'string (requis)', name: 'string (requis)', source_url: 'string (requis)', destination_url: 'string (requis)', old_url: 'string (requis)', xml_output_url: 'string (requis)', enrollment_report_url: 'string (optionnel)', is_active: 'boolean (optionnel)' } },
      { method: 'PUT', path: '/:id', description: 'Mettre à jour une banque existante.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'DELETE', path: '/:id', description: 'Supprimer une banque.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/:id/stats', description: 'Statistiques détaillées d\'une banque (enregistrements, fichiers, erreurs).', auth: 'jwt', roles: ['tous'] },
    ]
  },
  processing: {
    title: 'Traitement CSV',
    description: 'Upload, validation et traitement des fichiers CSV de cartes bancaires.',
    basePath: '/api/processing',
    endpoints: [
      { method: 'GET', path: '/template', description: 'Télécharger le template CSV avec les en-têtes attendus.', auth: 'jwt', roles: ['tous'] },
      { method: 'POST', path: '/upload', description: 'Uploader un fichier CSV pour traitement. Multipart/form-data. Retourne 202 + jobId (asynchrone).', auth: 'jwt', roles: ['tous'], body: { file: 'fichier CSV (requis)', bankId: 'integer (requis pour super_admin)' }, response: { success: true, data: { jobId: 'uuid', status: 'pending' } } },
      { method: 'POST', path: '/process-url', description: 'Traiter un fichier CSV à partir d\'une URL distante. Retourne 202 + jobId (asynchrone).', auth: 'jwt', roles: ['tous'], body: { url: 'string (requis)', bankId: 'integer (requis pour super_admin)' }, response: { success: true, data: { jobId: 'uuid', status: 'pending' } } },
      { method: 'POST', path: '/validate-manual', description: 'Valider une entrée manuelle de carte sans l\'enregistrer.', auth: 'jwt', roles: ['tous'], body: { pan: 'string', card_holder: 'string', phone: 'string', bankId: 'integer' } },
      { method: 'POST', path: '/process-manual', description: 'Enregistrer une entrée manuelle et générer le XML. Retourne 202 + jobId (asynchrone).', auth: 'jwt', roles: ['tous'], body: { pan: 'string', card_holder: 'string', phone: 'string', bankId: 'integer' }, response: { success: true, data: { jobId: 'uuid', status: 'pending' } } },
      { method: 'POST', path: '/call-api', description: 'Appeler une API externe pour récupérer des données (SSRF protégé). Retourne 202 + jobId (asynchrone).', auth: 'jwt', roles: ['tous'], body: { url: 'string (requis)', mapping: 'object (requis)', bankId: 'integer (requis pour super_admin)' }, response: { success: true, data: { jobId: 'uuid', status: 'pending' } } },
      { method: 'GET', path: '/status/:jobId', description: 'Vérifier le statut d\'un job de traitement asynchrone (pending/completed/failed).', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/queue/stats', description: 'Statistiques de la file d\'attente de traitement (jobs en attente, actifs, échoués, complétés).', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/errors/:fileLogId', description: 'Lister les erreurs de validation pour un fichier.', auth: 'jwt', roles: ['tous'] },
      { method: 'PATCH', path: '/errors/:errorId/resolve', description: 'Marquer une erreur de validation comme résolue.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/logs', description: 'Historique des traitements de fichiers avec pagination et filtres.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/download/:fileLogId', description: 'Télécharger le fichier CSV corrigé.', auth: 'jwt', roles: ['tous'] },
      { method: 'POST', path: '/reprocess/:fileLogId', description: 'Relancer le traitement d\'un fichier.', auth: 'jwt', roles: ['tous'] },
    ]
  },
  dashboard: {
    title: 'Tableau de Bord',
    description: 'Statistiques agrégées, activité récente et performances par banque.',
    basePath: '/api/dashboard',
    endpoints: [
      { method: 'GET', path: '/', description: 'Statistiques globales (banques, enregistrements, fichiers du jour, erreurs en attente, activité récente, stats par banque).', auth: 'jwt', roles: ['tous'], params: { bankId: 'integer (optionnel)', dateFrom: 'YYYY-MM-DD (optionnel)', dateTo: 'YYYY-MM-DD (optionnel)' } },
    ]
  },
  records: {
    title: 'Enregistrements',
    description: 'Consultation et gestion des enregistrements de cartes traitées.',
    basePath: '/api/records',
    endpoints: [
      { method: 'GET', path: '/', description: 'Lister les enregistrements avec pagination, recherche et filtres.', auth: 'jwt', roles: ['tous'], params: { bankId: 'integer (optionnel)', page: 'integer', limit: 'integer', search: 'string', status: 'string', dateFrom: 'YYYY-MM-DD', dateTo: 'YYYY-MM-DD' } },
      { method: 'DELETE', path: '/:id', description: 'Supprimer un enregistrement.', auth: 'jwt', roles: ['tous'] },
    ]
  },
  xmlLogs: {
    title: 'Journaux XML',
    description: 'Consultation des fichiers XML générés pour les banques.',
    basePath: '/api/xml-logs',
    endpoints: [
      { method: 'GET', path: '/', description: 'Lister les XML générés avec pagination et filtres.', auth: 'jwt', roles: ['tous'], params: { bankId: 'integer (optionnel)', page: 'integer', limit: 'integer', dateFrom: 'YYYY-MM-DD', dateTo: 'YYYY-MM-DD' } },
      { method: 'GET', path: '/stats/summary', description: 'Statistiques récapitulatives des générations XML.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/:id', description: 'Détail d\'un log XML spécifique.', auth: 'jwt', roles: ['tous'] },
    ]
  },
  history: {
    title: 'Historique',
    description: 'Historique des traitements de fichiers avec détails par étape.',
    basePath: '/api/history',
    endpoints: [
      { method: 'GET', path: '/', description: 'Lister l\'historique des fichiers traités avec pagination et filtres.', auth: 'jwt', roles: ['tous'], params: { bankId: 'integer (optionnel)', status: 'string', dateFrom: 'YYYY-MM-DD', dateTo: 'YYYY-MM-DD', page: 'integer', limit: 'integer' } },
      { method: 'GET', path: '/stats', description: 'Statistiques globales de l\'historique.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/:id', description: 'Détail d\'un historique de fichier avec toutes ses étapes (source → validation → CSV → XML → archive).', auth: 'jwt', roles: ['tous'] },
    ]
  },
  recordHistory: {
    title: 'Historique des Enregistrements',
    description: 'Recherche avancée et traçabilité des cartes par PAN.',
    basePath: '/api/record-history',
    endpoints: [
      { method: 'GET', path: '/search', description: 'Recherche avancée dans l\'historique des enregistrements avec filtres.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/stats', description: 'Statistiques globales d\'enregistrement.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/top-errors', description: 'Erreurs les plus fréquentes.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/pan/:bankId/:pan', description: 'Historique complet d\'un PAN pour une banque.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/pan-lookup', description: 'Recherche rapide d\'un PAN.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/corrections', description: 'Liste des PAN nécessitant des corrections.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/timeline/:days', description: 'Activité récente sur les N derniers jours.', auth: 'jwt', roles: ['tous'] },
    ]
  },
  apiKeys: {
    title: 'Clés API',
    description: 'Gestion des clés API pour l\'accès aux endpoints publics.',
    basePath: '/api/api-keys',
    endpoints: [
      { method: 'GET', path: '/', description: 'Lister les clés API.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/stats', description: 'Statistiques d\'utilisation des clés API.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/:id/logs', description: 'Journaux d\'utilisation d\'une clé API spécifique.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'POST', path: '/', description: 'Créer une nouvelle clé API pour une banque.', auth: 'jwt', roles: ['super_admin'], body: { bank_id: 'integer (requis)', description: 'string (optionnel)', rate_limit: 'integer (optionnel, défaut: 100)' } },
      { method: 'PUT', path: '/:id', description: 'Modifier une clé API (description, rate_limit, is_active).', auth: 'jwt', roles: ['super_admin'] },
      { method: 'DELETE', path: '/:id', description: 'Supprimer une clé API.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'POST', path: '/:id/regenerate', description: 'Régénérer une clé API (nouvelle valeur).', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
  users: {
    title: 'Utilisateurs',
    description: 'Gestion des utilisateurs, rôles et affectations aux banques.',
    basePath: '/api/users',
    endpoints: [
      { method: 'GET', path: '/me/profile', description: 'Récupérer son propre profil.', auth: 'jwt', roles: ['tous'] },
      { method: 'PUT', path: '/me/profile', description: 'Mettre à jour son propre profil (email, téléphone).', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/', description: 'Lister les utilisateurs (super_admin voit tout, bank_admin voit sa banque).', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'GET', path: '/:id', description: 'Détails d\'un utilisateur spécifique.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'POST', path: '/', description: 'Créer un nouvel utilisateur.', auth: 'jwt', roles: ['super_admin', 'bank_admin'], body: { username: 'string (requis)', email: 'string (requis)', password: 'string (requis, min 8)', role: 'string (requis)', bank_id: 'integer (requis pour bank_admin/bank)' } },
      { method: 'PUT', path: '/:id', description: 'Modifier un utilisateur (rôle, banque, actif).', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'DELETE', path: '/:id', description: 'Supprimer un utilisateur.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
    ]
  },
  enrollment: {
    title: 'Enrôlement',
    description: 'Gestion des rapports d\'enrôlement depuis les banques.',
    basePath: '/api/enrollment',
    endpoints: [
      { method: 'POST', path: '/upload', description: 'Uploader un rapport d\'enrôlement XML.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/stats', description: 'Statistiques des enrôlements.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/logs', description: 'Lister les logs d\'enrôlement.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/logs/:id', description: 'Détail d\'un log d\'enrôlement.', auth: 'jwt', roles: ['tous'] },
    ]
  },
  notifications: {
    title: 'Notifications',
    description: 'Configuration SMTP, emails de notification et rapports quotidiens.',
    basePath: '/api/notifications',
    endpoints: [
      { method: 'GET', path: '/smtp', description: 'Récupérer la configuration SMTP.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'PUT', path: '/smtp', description: 'Mettre à jour la configuration SMTP.', auth: 'jwt', roles: ['super_admin'], body: { host: 'string', port: 'integer', secure: 'boolean', username: 'string', password: 'string', from_email: 'string', from_name: 'string', enabled: 'boolean' } },
      { method: 'POST', path: '/smtp/test', description: 'Tester la connexion SMTP.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/emails/:bankId', description: 'Lister les emails de notification d\'une banque.', auth: 'jwt', roles: ['tous'] },
      { method: 'POST', path: '/emails/:bankId', description: 'Ajouter un email de notification pour une banque.', auth: 'jwt', roles: ['super_admin'], body: { email: 'string (requis)' } },
      { method: 'DELETE', path: '/emails/:id', description: 'Supprimer un email de notification.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'PUT', path: '/emails/:id/toggle', description: 'Activer/désactiver un email de notification.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'POST', path: '/send/:bankId', description: 'Envoyer le rapport quotidien à une banque spécifique.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'POST', path: '/send-all', description: 'Envoyer les rapports quotidiens à toutes les banques actives.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/logs', description: 'Lister l\'historique des notifications envoyées.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/cron-config', description: 'Récupérer la configuration CRON des rapports.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'PUT', path: '/cron-config', description: 'Mettre à jour la configuration CRON des rapports.', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
  scanner: {
    title: 'Scan Automatique',
    description: 'Gestion du scan automatique des dossiers SFTP des banques.',
    basePath: '/api/scanner',
    endpoints: [
      { method: 'GET', path: '/status', description: 'Status du scanner (activé, programmation, dernière exécution).', auth: 'jwt', roles: ['tous'] },
      { method: 'POST', path: '/trigger', description: 'Déclencher un scan manuellement.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/logs', description: 'Historique des exécutions du scanner.', auth: 'jwt', roles: ['tous'] },
    ]
  },
  monitoring: {
    title: 'Monitoring',
    description: 'Surveillance de l\'état de santé du système.',
    basePath: '/api/monitoring',
    endpoints: [
      { method: 'GET', path: '/health', description: 'État de santé complet (base de données, SMTP, disque, mémoire, uptime).', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/debug', description: 'Diagnostic des erreurs : validation, fichiers, API, XML, scans, notifications, rejets, enrôlement.', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
  auditLogs: {
    title: "Journal d'Activité",
    description: "Traçabilité de toutes les actions effectuées sur la plateforme.",
    basePath: '/api/audit-logs',
    endpoints: [
      { method: 'GET', path: '/', description: 'Lister les logs d\'audit avec pagination et filtres (action, utilisateur, rôle, dates).', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/actions', description: 'Lister les types d\'actions distincts pour le filtre.', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
  roleFeatures: {
    title: 'Fonctionnalités par Rôle',
    description: 'Configuration fine des fonctionnalités accessibles par rôle, banque ou utilisateur.',
    basePath: '/api/role-features',
    endpoints: [
      { method: 'GET', path: '/me', description: 'Récupérer les fonctionnalités accessibles pour l\'utilisateur connecté.', auth: 'jwt', roles: ['tous'] },
      { method: 'GET', path: '/', description: 'Lister les fonctionnalités par défaut pour chaque rôle.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/banks', description: 'Lister les fonctionnalités par banque.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'GET', path: '/users', description: 'Lister les fonctionnalités par utilisateur.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'GET', path: '/bank/:bankId', description: 'Fonctionnalités d\'une banque spécifique.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'GET', path: '/user/:userId', description: 'Fonctionnalités d\'un utilisateur spécifique.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'PUT', path: '/role/:role/:feature', description: 'Activer/désactiver une fonctionnalité pour un rôle.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'PUT', path: '/bank/:bankId/:feature', description: 'Activer/désactiver une fonctionnalité pour une banque.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'PUT', path: '/user/:userId/:feature', description: 'Activer/désactiver une fonctionnalité pour un utilisateur.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'DELETE', path: '/bank/:bankId/:feature', description: 'Supprimer une surcharge de fonctionnalité pour une banque.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'DELETE', path: '/user/:userId/:feature', description: 'Supprimer une surcharge de fonctionnalité pour un utilisateur.', auth: 'jwt', roles: ['super_admin', 'bank_admin'] },
      { method: 'POST', path: '/reset', description: 'Réinitialiser toutes les fonctionnalités aux valeurs par défaut.', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
  settings: {
    title: 'Paramètres',
    description: 'Configuration globale du système (clé-valeur).',
    basePath: '/api/settings',
    endpoints: [
      { method: 'GET', path: '/', description: 'Lister tous les paramètres système.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'PUT', path: '/:key', description: 'Mettre à jour un paramètre système.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'POST', path: '/bulk', description: 'Mettre à jour plusieurs paramètres en une requête.', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
  publicApi: {
    title: 'API Publique (v1)',
    description: 'API accessible via clé API pour les systèmes externes (banques partenaires).',
    basePath: '/api/v1',
    endpoints: [
      { method: 'GET', path: '/banks', description: 'Lister les banques actives disponibles.', auth: 'api_key', roles: ['externe'] },
      { method: 'POST', path: '/cards/validate', description: 'Valider une carte sans l\'enregistrer.', auth: 'api_key', roles: ['externe'], body: { pan: 'string (requis)', card_holder: 'string (requis)', phone: 'string (requis)' } },
      { method: 'POST', path: '/cards/register', description: 'Enregistrer une carte et générer le fichier XML.', auth: 'api_key', roles: ['externe'], body: { pan: 'string (requis, 16 chiffres)', card_holder: 'string (requis)', phone: 'string (requis, 8 chiffres)', bank_code: 'string (requis)' } },
      { method: 'GET', path: '/status/:fileLogId', description: 'Vérifier le statut de traitement d\'un fichier.', auth: 'api_key', roles: ['externe'] },
      { method: 'GET', path: '/docs', description: 'Documentation de l\'API publique au format JSON.', auth: 'none', roles: ['public'] },
    ]
  },
  health: {
    title: 'Santé',
    description: 'Vérification de la connectivité de la base de données.',
    basePath: '/api/health',
    endpoints: [
      { method: 'GET', path: '/', description: 'Vérification rapide que le serveur et la base de données répondent.', auth: 'none', roles: ['public'] },
    ]
  },
  platformTests: {
    title: 'Tests de la Plateforme',
    description: 'Exécution et suivi des tests automatisés (backend + frontend) avec vérifications d\'infrastructure.',
    basePath: '/api/platform-tests',
    endpoints: [
      { method: 'POST', path: '/run', description: 'Lancer la suite complète de tests : pré-vérifications (env, DB, Redis, fichiers, dépendances, SSE) → Jest backend → Jest frontend → Tests QA E2E (Playwright: navigation, permissions, flux live). Retourne un runId immédiatement (asynchrone).', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/progress', description: 'Récupérer la progression en temps réel des tests (phase courante, pourcentage, suites complétées, résultats partiels).', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/status', description: 'Vérifier si une exécution de tests est en cours.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/script/:phaseIdx/:suiteIdx', description: 'Récupérer le contenu d\'un script de test (phaseIndex/suiteIndex) pour visualisation et téléchargement.', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
  live: {
    title: 'Flux en Direct',
    description: 'Diffusion en temps réel des actions utilisateurs via SSE (Server-Sent Events). Connectez-vous au flux SSE pour recevoir les événements instantanément.',
    basePath: '/api/live',
    endpoints: [
      { method: 'GET', path: '/stream', description: 'Flux SSE temps réel. Envoie un événement "connected", puis les 200 derniers événements, puis tout nouvel événement au fur et à mesure. Utilisez ?token= (query param) car EventSource ne supporte pas les headers personnalisés.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'POST', path: '/track', description: 'Tracker la page active d\'un utilisateur. Corps : { page: string, action: string, details?: string }. Utilisé par le frontend pour envoyer les changements de page en temps réel.', auth: 'jwt', roles: ['super_admin'] },
      { method: 'GET', path: '/recent', description: 'Récupérer les événements récents depuis la base de données. Paramètre optionnel ?limit= (max 500, défaut 100).', auth: 'jwt', roles: ['super_admin'] },
    ]
  },
};

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'ACS Banking - API Documentation',
      version: '1.0.0',
      description: 'Documentation complète de l\'API REST ACS Banking. Tous les endpoints internes nécessitent une authentification JWT sauf indication contraire.',
      baseUrl: '/api',
      groups: endpoints,
    }
  });
});

module.exports = router;
module.exports.endpoints = endpoints;
