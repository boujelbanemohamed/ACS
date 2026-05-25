import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Wifi, WifiOff, RotateCcw, Pause, Play, Upload, Download, Plus, Pencil, Trash2, Settings, AlertCircle, LogIn, LogOut, Eye } from 'lucide-react';
import api from '../services/api';
import './Live.css';

const ACTION_ICONS = {
  LOGIN_SUCCESS: { icon: LogIn, css: 'login' },
  LOGIN_FAILED: { icon: AlertCircle, css: 'error' },
  LOGOUT: { icon: LogOut, css: 'logout' },
  UPLOAD_FILE: { icon: Upload, css: 'upload' },
  UPLOAD_ENROLLMENT: { icon: Upload, css: 'upload' },
  DOWNLOAD_FILE: { icon: Download, css: 'download' },
  CREATE_USER: { icon: Plus, css: 'create' },
  UPDATE_USER: { icon: Pencil, css: 'update' },
  DELETE_USER: { icon: Trash2, css: 'delete' },
  DELETE_RECORD: { icon: Trash2, css: 'delete' },
  UPDATE_SMTP_CONFIG: { icon: Settings, css: 'settings' },
  UPDATE_CRON_CONFIG: { icon: Settings, css: 'settings' },
  PAGE_VIEW: { icon: Eye, css: 'default' },
};

function getEventConfig(action) {
  return ACTION_ICONS[action] || { icon: Radio, css: 'default' };
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'À l\'instant';
  if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function EventRow({ event }) {
  const config = getEventConfig(event.action);
  const Icon = config.icon;
  return (
    <div className="live-event">
      <div className={`live-event-icon ${config.css}`}>
        <Icon size={16} />
      </div>
      <div className="live-event-content">
        <div className="live-event-description">{event.description}</div>
        <div className="live-event-meta">
          <span className="live-event-time">{formatTimestamp(event.timestamp)}</span>
          {event.username && (
            <span>{event.username}</span>
          )}
          {event.userRole && (
            <span className={`filter-badge ${event.userRole}`}>{event.userRole === 'super_admin' ? 'Admin' : event.userRole === 'bank_admin' ? 'Admin Banque' : 'Banque'}</span>
          )}
          {event.ipAddress && event.ipAddress !== 'unknown' && (
            <span>{event.ipAddress}</span>
          )}
        </div>
      </div>
    </div>
  );
}

const Live = () => {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const feedRef = useRef(null);
  const pendingRef = useRef([]);
  const pausedRef = useRef(false);
  const timerRef = useRef(null);

  pausedRef.current = paused;

  const flushPending = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    setEvents(prev => {
      const batch = pendingRef.current;
      pendingRef.current = [];
      const merged = [...batch, ...prev];
      return merged.length > 2000 ? merged.slice(0, 2000) : merged;
    });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');

    api.get('/live/recent?limit=100').then(res => {
      if (res.data?.success && res.data?.data) {
        setEvents(res.data.data);
      }
    }).catch(() => {}).finally(() => setLoading(false));

    const url = `/api/live/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'connected') return;
        if (pausedRef.current) {
          pendingRef.current.push(data);
          return;
        }
        setEvents(prev => {
          const exists = prev.some(p => p.id === data.id);
          if (exists) return prev;
          const next = [data, ...prev];
          return next.length > 2000 ? next.slice(0, 2000) : next;
        });
      } catch {}
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    if (paused) {
      timerRef.current = setInterval(flushPending, 2000);
    } else {
      clearInterval(timerRef.current);
      flushPending();
    }
    return () => clearInterval(timerRef.current);
  }, [paused, flushPending]);

  useEffect(() => {
    if (!paused && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [events, paused]);

  const filteredEvents = events.filter(e => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (userFilter && !e.username?.toLowerCase().includes(userFilter.toLowerCase())) return false;
    return true;
  });

  const uniqueActions = [...new Set(events.map(e => e.action))].sort();

  return (
    <div className="live-page">
      <div className="live-header">
        <h1>
          <span className="live-dot" />
          Flux en direct
        </h1>
        <div className="live-controls">
          {connected ? (
            <span className="event-count" style={{ background: '#d1fae5', color: '#059669' }}>
              <Wifi size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Connecté
            </span>
          ) : (
            <span className="event-count" style={{ background: '#fee2e2', color: '#dc2626' }}>
              <WifiOff size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
              Déconnecté
            </span>
          )}
          <span className="event-count">{events.length} événements</span>
          <button
            className={`live-toggle ${paused ? 'paused' : ''}`}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? 'Reprendre' : 'Pause'}
          </button>
          <button className="clear-btn" onClick={() => setEvents([])}>
            <RotateCcw size={14} style={{ marginRight: 4 }} />
            Effacer
          </button>
        </div>
      </div>

      <div className="live-filters">
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">Toutes les actions</option>
          {uniqueActions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filtrer par utilisateur..."
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
        />
        {filteredEvents.length < events.length && (
          <span className="event-count">{filteredEvents.length} résultat(s)</span>
        )}
      </div>

      <div className="live-feed" ref={feedRef}>
        {loading ? (
          <div className="live-feed-empty">
            <span>Chargement des événements...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="live-feed-empty">
            <Radio size={32} strokeWidth={1.5} />
            <span>{events.length === 0 ? 'En attente d\'événements...' : 'Aucun résultat correspondant aux filtres'}</span>
          </div>
        ) : (
          filteredEvents.map((event, i) => (
            <EventRow key={event.id || `idx-${i}`} event={event} />
          ))
        )}
      </div>
    </div>
  );
};

export default Live;
