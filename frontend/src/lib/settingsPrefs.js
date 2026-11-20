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
  breakReminder: true, // "Take a break after N mins" (N = breakReminderMinutes); on by default, can be switched off
  breakReminderMinutes: 30, // 15 / 30 / 45 / 60
  reduceMotion: false, // Settings → Accessibility: switch off animations/transitions app-wide
  largeText: false, // legacy: superseded by textSize (still honoured if it was already on)
  textSize: 'default', // small | default | large | xlarge
  highContrast: false, // stronger text/border contrast
  skipPhotosensitive: false, // skip posts flagged as flashing (applies once creators can flag posts)
  captions: false, // show captions/subtitles when a video has them
  fastScroll: false, // feed jumps between videos instantly instead of animating
  animatedThumbnails: true, // preview thumbnails play when visible
  // Settings → Contacts and location
  contactsEnabled: false,
  facebookEnabled: false,
  // Settings → Language (server-backed via /users/me/language; mirrored here for instant first paint)
  displayLanguage: 'en',
  translateContent: true,
  contentLanguages: [],
};

const listeners = new Set();

// useSyncExternalStore needs getSnapshot to return the *same* value until the store changes. Object/array
// prefs (e.g. contentLanguages) would otherwise be a fresh JSON.parse result on every call, which React
// treats as a change on every render and loops until it throws. So parsed values are cached by raw string.
const parsed = new Map(); // key -> { raw, value }

export function getPref(key) {
  if (typeof window === 'undefined') return PREF_DEFAULTS[key];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return PREF_DEFAULTS[key];
    const hit = parsed.get(key);
    if (hit && hit.raw === raw) return hit.value;
    const value = JSON.parse(raw);
    parsed.set(key, { raw, value });
    return value;
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
