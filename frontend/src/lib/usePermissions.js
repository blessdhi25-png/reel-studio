'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

  // Triggers the real browser prompt. Resolves the new state: 'granted' | 'denied' | 'prompt' (dismissed) | 'unsupported'.
  const request = useCallback(async (name) => {
    let next = 'granted';
    try {
      if (name === 'geolocation') {
        if (!navigator.geolocation) next = 'unsupported';
        else await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 20000, maximumAge: 60000 }));
      } else if (name === 'notifications') {
        if (typeof Notification === 'undefined') next = 'unsupported';
        else {
          const r = await Notification.requestPermission();
          next = r === 'default' ? 'prompt' : r;
        }
      } else {
        if (!navigator.mediaDevices?.getUserMedia) next = 'unsupported';
        else {
          const stream = await navigator.mediaDevices.getUserMedia(name === 'camera' ? { video: true } : { audio: true });
          stream.getTracks().forEach((t) => t.stop()); // we only wanted the permission, not the feed
        }
      }
    } catch (err) {
      const code = err?.name;
      if (name === 'geolocation') next = err?.code === 1 ? 'denied' : err?.code === 2 || err?.code === 3 ? 'granted' : 'prompt'; // unavailable/timeout ≠ denied: permission was given
      else if (code === 'NotAllowedError' || code === 'SecurityError' || code === 'PermissionDeniedError') next = 'denied';
      else if (code === 'NotFoundError' || code === 'OverconstrainedError') next = 'granted'; // allowed, but no such device on this machine
      else next = 'prompt';
    }
    markAsked(name, next === 'unsupported' ? 'prompt' : next);
    setState((s) => ({ ...s, [name]: next }));
    refresh(); // reconcile with what the browser itself reports
    return next;
  }, [refresh]);

  return { state, request, refresh };
}
