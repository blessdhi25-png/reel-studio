'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { addSeconds } from '@/lib/screenTime';
import { getPref } from '@/lib/settingsPrefs';
import {
  BREAK_RESET_MS,
  extendActiveWatch,
  readActiveWatchSeconds,
  readLastActiveAt,
  resetActiveWatch,
  thresholdSecondsFor,
  writeActiveWatchSeconds,
  writeLastActiveAt,
} from '@/lib/activeWatch';
import ScreenTimeModal from './ScreenTimeModal';

const STATS_FLUSH_MS = 10_000; // Wellbeing chart ledger (visible time), unchanged
const TICK_MS = 1000; // reminder timer
const MAX_TICK_SECONDS = 5; // clamp so a throttled/slept timer can't add a big lump at once
const BREAK_GAP_MS = 2 * 60_000;
const RECENT_INTERACTION_MS = 30_000;

function isMediaPlaying() {
  return [...document.querySelectorAll('video,audio')].some((m) => !m.paused && !m.ended && m.readyState > 2);
}

// Mounted once in AppShell (so it runs on every page and survives navigation) and renders nothing
// except the reminder modal.
//
// Two jobs:
//  1. Wellbeing stats: visible time per day -> lib/screenTime.js (unchanged behaviour).
//  2. Reminder: a running counter of ACTIVE viewing seconds kept in localStorage
//     (clippulse_active_watch_seconds). It only advances while the tab is visible and focused AND
//     something is playing or the person interacted in the last 30s. When it reaches the chosen
//     interval (default 30 min) the un-dismissible ScreenTimeModal appears on whatever page they're on.
export default function ScreenTimeTracker() {
  const { isAuthenticated } = useAuth();
  const [modalMinutes, setModalMinutes] = useState(null); // null = hidden
  const thresholdRef = useRef(1800);
  const lastInteractionRef = useRef(Date.now());

  // ---- stats ledger ----
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const gap = now - last;
      last = now;
      if (document.visibilityState !== 'visible' || gap > BREAK_GAP_MS) return;
      addSeconds(gap / 1000);
    }, STATS_FLUSH_MS);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // ---- interaction tracking (cheap, passive) ----
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const mark = () => {
      lastInteractionRef.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true, capture: true }));
    return () => events.forEach((e) => window.removeEventListener(e, mark, { capture: true }));
  }, [isAuthenticated]);

  // ---- reminder timer ----
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let lastTick = Date.now();

    function tick() {
      const now = Date.now();
      const dt = Math.min((now - lastTick) / 1000, MAX_TICK_SECONDS);
      lastTick = now;

      if (!getPref('breakReminder')) {
        setModalMinutes(null);
        return;
      }
      const minutes = Number(getPref('breakReminderMinutes')) || 30;
      const threshold = thresholdSecondsFor(minutes);
      thresholdRef.current = threshold;

      let seconds = readActiveWatchSeconds();

      // Already at/over the limit (e.g. after a reload, or the interval was lowered): show it.
      // The counter is frozen while the modal is up, and clears when acknowledged in any tab.
      if (seconds >= threshold) {
        setModalMinutes(Math.round(threshold / 60));
        return;
      }
      setModalMinutes((m) => (m === null ? m : null));

      if (document.hidden || !document.hasFocus()) return;
      const interacted = now - lastInteractionRef.current < RECENT_INTERACTION_MS;
      if (!interacted && !isMediaPlaying()) return;

      // A long enough stretch of not watching counts as a real break.
      const lastActive = readLastActiveAt();
      if (lastActive && now - lastActive > BREAK_RESET_MS) seconds = 0;

      seconds += dt;
      writeActiveWatchSeconds(seconds);
      writeLastActiveAt(now);
      if (seconds >= threshold) setModalMinutes(Math.round(threshold / 60));
    }

    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  function pauseAllMedia() {
    document.querySelectorAll('video,audio').forEach((m) => {
      try {
        m.pause();
      } catch {}
    });
  }

  // Pause playback the moment the modal appears.
  useEffect(() => {
    if (modalMinutes !== null) pauseAllMedia();
  }, [modalMinutes]);

  function handleBreak() {
    resetActiveWatch();
    setModalMinutes(null);
  }

  function handleExtend() {
    extendActiveWatch(thresholdRef.current);
    setModalMinutes(null);
  }

  if (!isAuthenticated || modalMinutes === null) return null;
  return <ScreenTimeModal minutes={modalMinutes} onBreak={handleBreak} onExtend={handleExtend} />;
}
