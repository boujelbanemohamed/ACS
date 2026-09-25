import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

const PAGE_NAMES = {
  '/dashboard': 'Tableau de bord',
  '/banks': 'Banques',
  '/processing': 'Traitement',
  '/records': 'Enregistrements',
  '/history': 'Historique',
  '/api-tester': 'Test API',
  '/users': 'Utilisateurs',
  '/profile': 'Profil',
  '/notifications': 'Notifications',
  '/monitoring': 'Monitoring',
  '/audit-logs': "Journal d'activité",
  '/role-features': 'Permissions',
  '/api-docs': 'Documentation API',
  '/platform-tests': 'Tests Plateforme',
  '/live': 'Flux en direct',
  '/cron': 'Scan Automatique',
};

export default function usePageTracking() {
  const location = useLocation();
  const lastPath = useRef('');

  useEffect(() => {
    const path = location.pathname;
    if (path === lastPath.current) return;
    lastPath.current = path;

    const token = localStorage.getItem('token');
    if (!token) return;

    const pageName = PAGE_NAMES[path] || path;
    // Même client HTTP que le reste de l'application (URL de l'API et jeton)
    api.post('/live/track', { page: path, action: 'PAGE_VIEW', details: pageName }, { timeout: 3000 })
      .catch(() => {});

  }, [location.pathname]);
}
