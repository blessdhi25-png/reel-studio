// Active-watch ledger behind the screen-time reminder.
//
// Unlike lib/screenTime.js (per-day totals for the Wellbeing chart), this is ONE running counter of
// continuous *active* viewing seconds that survives navigation, reloads and component remounts
// because it lives in localStorage. It is cleared by acknowledging the reminder or by a genuine
// break (BREAK_RESET_MS with no active viewing).

export const ACTIVE_WATCH_KEY = 'clippulse_active_watch_seconds';
export const ACTIVE_WATCH_LAST_KEY = 'clippulse_active_watch_last';
export const DEFAULT_THRESHOLD_MINUTES = 30; // 1,800 seconds
export const THRESHOLD_OPTIONS = [15, 30, 45, 60];
export const BREAK_RESET_MS = 10 * 60_000; // this long without active viewing counts as a real break
export const EXTEND_MINUTES = 10;

function read(key) {
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function write(key, value) {
  try {
    if (value > 0) window.localStorage.setItem(key, String(value));
    else window.localStorage.removeItem(key);
  } catch {
    // storage blocked: the timer still runs for this page load, it just won't survive a reload
  }
}

export const readActiveWatchSeconds = () => read(ACTIVE_WATCH_KEY);
export const writeActiveWatchSeconds = (s) => write(ACTIVE_WATCH_KEY, Math.round(s * 10) / 10);
export const readLastActiveAt = () => read(ACTIVE_WATCH_LAST_KEY);
export const writeLastActiveAt = (ts) => write(ACTIVE_WATCH_LAST_KEY, ts);

export function resetActiveWatch() {
  write(ACTIVE_WATCH_KEY, 0);
  write(ACTIVE_WATCH_LAST_KEY, 0);
}

export function thresholdSecondsFor(minutes) {
  const m = THRESHOLD_OPTIONS.includes(Number(minutes)) ? Number(minutes) : DEFAULT_THRESHOLD_MINUTES;
  return m * 60;
}

// "Keep watching": push the next reminder EXTEND_MINUTES out.
export function extendActiveWatch(thresholdSeconds) {
  write(ACTIVE_WATCH_KEY, Math.max(0, thresholdSeconds - EXTEND_MINUTES * 60));
}
