'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { addSeconds } from '@/lib/screenTime';
import { getPref } from '@/lib/settingsPrefs';

const TICK_MS = 10_000;
// A gap longer than this between ticks means the tab was hidden/asleep — count
// it as a break rather than as time spent in the app.
const BREAK_GAP_MS = 2 * 60_000;
const REMINDER_AFTER_SECONDS = 60 * 60;

// Records foreground time for Pulse Wellbeing and, if the user enabled it,
// nudges them after 60 continuous minutes. Renders nothing; mounted in AppShell.
export default function ScreenTimeTracker() {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!isAuthenticated) return;

    let last = Date.now();
    let streak = 0; // continuous foreground seconds since the last break/reminder

    const id = setInterval(() => {
      const now = Date.now();
      const gap = now - last;
      last = now;

      if (document.visibilityState !== 'visible') return;
      if (gap > BREAK_GAP_MS) {
        streak = 0;
        return;
      }

      const seconds = gap / 1000;
      addSeconds(seconds);
      streak += seconds;

      if (streak >= REMINDER_AFTER_SECONDS) {
        streak = 0;
        if (getPref('breakReminder')) {
          toastRef.current.info("You've been on ClipPulse for an hour. Time for a break?");
        }
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, [isAuthenticated]);

  return null;
}
