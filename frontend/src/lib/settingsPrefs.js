'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Device-local preferences for the Settings dashboard.
//
// These have no backend column yet (privacy/comment/DM settings do — those go
// through api.updatePrivacySettings). Until the API grows fields for them they
// live in localStorage behind this tiny external store, so every consumer —
// the settings page, VideoCard's download flow, the HLS player, the screen-time
// tracker — reads the same value and re-renders when it changes (including from
// another tab via the `storage` event).
//
// Swapping to server-backed prefs later only means changing read/write here.

const PREFIX = 'cp:pref:';

export const PREF_DEFAULTS = {
  twoStep: false, // 2-step verification (preference only — see settings/security)
  watermark: true, // burn the ClipPulse watermark into exported clips
  dataSaver: false, // cap video resolution on cellular networks
  breakReminder: false, // "Take a break after 60 mins"
};

const listeners = new Set();

export function getPref(key) {
  if (typeof window === 'undefined') return PREF_DEFAULTS[key];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? PREF_DEFAULTS[key] : JSON.parse(raw);
  } catch {
    return PREF_DEFAULTS[key];
  }
}

export function setPref(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full / blocked (private mode): the in-memory notify below still
    // fires, but the value won't survive a reload. Nothing else to do.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  const onStorage = (e) => {
    if (e.key && e.key.startsWith(PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePref(key) {
  const value = useSyncExternalStore(
    subscribe,
    () => getPref(key),
    () => PREF_DEFAULTS[key]
  );
  const set = useCallback((next) => setPref(key, next), [key]);
  return [value, set];
}
