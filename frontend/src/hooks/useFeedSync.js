'use client';

import { useEffect, useRef } from 'react';

// Runs `check` every `intervalMs` while the tab is visible and online, plus an
// immediate (rate-limited) run on window focus, tab re-show and `online`.
// `check` is held in a ref so callers can pass a fresh closure every render
// without restarting the timer.
export function useFeedSync({ enabled = true, check, intervalMs = 60000, minGapMs = 5000 }) {
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    if (!enabled) return undefined;
    let running = false;
    let lastRun = Date.now();

    async function run(respectGap) {
      if (running) return;
      if (document.visibilityState === 'hidden') return; // paused in background tabs
      if (navigator.onLine === false) return;
      const now = Date.now();
      if (respectGap && now - lastRun < minGapMs) return;
      running = true;
      lastRun = now;
      try {
        await checkRef.current?.();
      } catch {
        // best effort — the next tick retries
      } finally {
        running = false;
      }
    }

    const timer = setInterval(() => run(false), intervalMs);
    const onWake = () => run(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run(true);
    };
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, minGapMs]);
}
