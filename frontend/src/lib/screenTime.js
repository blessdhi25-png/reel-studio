// Foreground-time ledger behind the Pulse Wellbeing dashboard.
//
// ScreenTimeTracker (mounted in AppShell) adds seconds here while the app is
// visible; /settings/wellbeing reads them back. Stored per device in
// localStorage as { 'YYYY-MM-DD': seconds }, trimmed to the last 28 days.

const KEY = 'cp:screentime';
const KEEP_DAYS = 28;

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local-calendar day key (not UTC — "today" should roll over at the user's midnight).
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function readUsage() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function addSeconds(seconds, date = new Date()) {
  if (!(seconds > 0)) return;
  try {
    const usage = readUsage();
    const key = dayKey(date);
    usage[key] = (usage[key] || 0) + seconds;

    const cutoff = new Date(date);
    cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
    const cutoffKey = dayKey(cutoff);
    for (const k of Object.keys(usage)) if (k < cutoffKey) delete usage[k];

    window.localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // Storage unavailable — usage just isn't recorded.
  }
}

// Sunday→Saturday for the week containing `now`.
export function weekUsage(usage = readUsage(), now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return DAY_LABELS.map((label, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dayKey(d);
    return {
      label,
      key,
      seconds: usage[key] || 0,
      isToday: key === dayKey(now),
      isFuture: i > now.getDay(),
    };
  });
}

// Average over the days of this week that have happened so far (Sun → today),
// so a quiet Monday morning isn't averaged against six days that haven't occurred.
export function dailyAverageSeconds(week) {
  const elapsed = week.filter((d) => !d.isFuture);
  if (elapsed.length === 0) return 0;
  return elapsed.reduce((sum, d) => sum + d.seconds, 0) / elapsed.length;
}

export function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return seconds > 0 ? '<1m' : '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
