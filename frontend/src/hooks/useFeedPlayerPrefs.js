'use client';

import { useSyncExternalStore } from 'react';

// Player preferences set from the long-press menu. They live in a tiny
// module-level store (persisted to localStorage) rather than per-card state
// so every VideoCard in the feed sees the same value — otherwise turning on
// "Auto scroll" or 1.5x speed would reset the moment you scrolled to the
// next card.
const KEY = 'feedPlayerPrefs';
const DEFAULTS = { speed: 1, autoScroll: false, backgroundAudio: false };

let state = DEFAULTS;
let loaded = false;
const listeners = new Set();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    state = { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) || '{}') };
  } catch {
    state = DEFAULTS;
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  load();
  return state;
}

function getServerSnapshot() {
  return DEFAULTS;
}

export function setFeedPlayerPref(key, value) {
  load();
  state = { ...state, [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

export function useFeedPlayerPrefs() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
