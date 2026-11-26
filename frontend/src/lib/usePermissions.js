'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mediaErrorDetail, UNSUPPORTED_TEXT } from './mediaErrorDetail';

// Live browser permission state for geolocation / camera / microphone / notifications.
// navigator.permissions.query isn't reliable everywhere (Firefox rejects "camera"/"microphone", older Safari
// rejects most names), so each permission falls back to something observable, and the result of tapping
// "Allow" is applied immediately instead of waiting for the next poll.
const NAMES = ['geolocation', 'camera', 'microphone', 'notifications'];
const ASKED_KEY = 'perm_asked_v1';

function readAsked() {
  try { return JSON.parse(window.sessionStorage.getItem(ASKED_KEY) || '{}'); } catch { return {}; }
}
function markAsked(name, state) {
  try { window.sessionStorage.setItem(ASKED_KEY, JSON.stringify({ ...readAsked(), [name]: state })); } catch {}
}

async function queryOne(name) {
  if (typeof window === 'undefined') return 'unsupported';
  if (name === 'notifications') {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  }
  try {
    const status = await navigator.permissions.query({ name });
    return status.state; // granted | denied | prompt
  } catch {
    // No Permissions API for this name. Device labels are only exposed once access was granted.
    if (name === 'camera' || name === 'microphone') {
      if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
      try {
        const kind = name === 'camera' ? 'videoinput' : 'audioinput';
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (devices.some((d) => d.kind === kind && d.label)) return 'granted';
      } catch {}
    }
    if (name === 'geolocation' && !navigator.geolocation) return 'unsupported';
    return readAsked()[name] || 'prompt'; // best knowledge: what we saw earlier this session, else "not asked"
  }
}

export function usePermissions() {
  const [state, setState] = useState({});
  const watchers = useRef([]);

  const refresh = useCallback(async () => {
    const results = await Promise.all(NAMES.map(queryOne));
    setState(Object.fromEntries(NAMES.map((n, i) => [n, results[i]])));
  }, []);

  useEffect(() => {
    refresh();
    // The browser's own permission UI (lock icon) changes state without us — follow it.
    NAMES.forEach(async (name) => {
      try {
        const status = await navigator.permissions.query({ name });
        const onChange = () => refresh();
        status.addEventListener('change', onChange);
        watchers.current.push(() => status.removeEventListener('change', onChange));
      } catch {}
    });
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      watchers.current.forEach((off) => off());
      watchers.current = [];
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // What happened the last time the person tapped "Allow", for states the browser's own permission value
  // can't express (no camera plugged in, GPS unavailable, request timed out). Cleared by the next attempt,
  // and ignored once the permission reads as granted.
  const [issues, setIssues] = useState({});
  const [pending, setPending] = useState({});
  const [errors, setErrors] = useState({}); // exact err.name/message from the last failed request, per permission

  // Triggers the real browser prompt — must be called straight from the tap handler so the browser
  // treats it as a user gesture. Resolves the new state: 'granted' | 'denied' | 'prompt' | 'unsupported'.
  const request = useCallback(async (name) => {
    setPending((p) => ({ ...p, [name]: true }));
    setIssues((i) => { const n = { ...i }; delete n[name]; return n; });
    setErrors((e) => { const n = { ...e }; delete n[name]; return n; });
    let next = 'granted';
    let detail = '';
    let issue = null;
    const secure = typeof window !== 'undefined' && window.isSecureContext !== false;
    try {
      if (!secure && name !== 'notifications') {
        next = 'unsupported';
        issue = 'Needs a secure (https) connection';
        detail = `SecurityError: insecure context (${window.location.protocol})`;
      } else if (name === 'geolocation') {
        if (!navigator.geolocation) { next = 'unsupported'; detail = UNSUPPORTED_TEXT; }
        else await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }));
      } else if (name === 'notifications') {
        if (typeof Notification === 'undefined') { next = 'unsupported'; detail = UNSUPPORTED_TEXT; }
        else {
          const r = await Notification.requestPermission();
          next = r === 'default' ? 'prompt' : r;
        }
      } else {
        if (!navigator.mediaDevices?.getUserMedia) { next = 'unsupported'; detail = UNSUPPORTED_TEXT; }
        else {
          const stream = await navigator.mediaDevices.getUserMedia(name === 'camera' ? { video: true } : { audio: true });
          stream.getTracks().forEach((t) => t.stop()); // we only wanted the permission, not the feed
        }
      }
    } catch (err) {
      const code = err?.name;
      // Geolocation errors carry a numeric code (1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT), not a name.
      detail = name === 'geolocation'
        ? `${{ 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' }[err?.code] || 'GeolocationPositionError'}${err?.message ? `: ${err.message}` : ''}`
        : mediaErrorDetail(err);
      const thing = name === 'camera' ? 'camera' : 'microphone';
      if (name === 'geolocation') {
        if (err?.code === 1) next = 'denied';
        else {
          next = 'prompt';
          issue = err?.code === 3 ? 'Location timed out — try again' : 'Location unavailable';
        }
      } else if (code === 'NotAllowedError' || code === 'SecurityError' || code === 'PermissionDeniedError') next = 'denied';
      else if (code === 'NotFoundError' || code === 'OverconstrainedError' || code === 'DevicesNotFoundError') { next = 'prompt'; issue = `No ${thing} detected`; }
      else if (code === 'NotReadableError' || code === 'AbortError') { next = 'prompt'; issue = `${thing[0].toUpperCase()}${thing.slice(1)} is busy in another app`; }
      else { next = 'prompt'; issue = 'Something went wrong — try again'; }
    }
    markAsked(name, next === 'unsupported' ? 'prompt' : next);
    setState((s) => ({ ...s, [name]: next }));
    if (issue) setIssues((i) => ({ ...i, [name]: issue }));
    if (detail) setErrors((e) => ({ ...e, [name]: detail }));
    setPending((p) => ({ ...p, [name]: false }));
    refresh(); // reconcile with what the browser itself reports
    return next;
  }, [refresh]);

  return { state, request, refresh, issues, pending, errors };
}
