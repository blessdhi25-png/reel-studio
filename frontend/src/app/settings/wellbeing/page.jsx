'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePref } from '@/lib/settingsPrefs';
import { dailyAverageSeconds, formatDuration, readUsage, weekUsage } from '@/lib/screenTime';
import { SettingsGroup, SettingsPage, ToggleRow } from '@/components/settings/SettingsUI';

// Usage is kept for 28 days (lib/screenTime.js), so this week plus three back.
const MAX_WEEKS_BACK = 3;
const HOUR = 3600;
const CHART_HEIGHT_PX = 160;
const REFRESH_MS = 10_000; // ScreenTimeTracker flushes every 10s

// Round the y-axis ceiling up to the next half hour, never below one hour, so a
// few quiet minutes don't render as a full-height bar.
function chartCeiling(week) {
  const peak = Math.max(...week.map((d) => d.seconds), 0);
  return Math.max(HOUR, Math.ceil(peak / (HOUR / 2)) * (HOUR / 2));
}

function weekRangeLabel(week, weeksBack) {
  if (weeksBack === 0) return 'This week';
  if (weeksBack === 1) return 'Last week';
  const fmt = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  return `${fmt(week[0].key)} – ${fmt(week[6].key)}`;
}

export default function WellbeingPage() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const [breakReminder, setBreakReminder] = usePref('breakReminder');

  const [usage, setUsage] = useState(null); // null until read on the client (localStorage)
  const [weeksBack, setWeeksBack] = useState(0);
  const [selectedKey, setSelectedKey] = useState(null);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  // Read on mount, then keep fresh while the page is open.
  useEffect(() => {
    setUsage(readUsage());
    const id = setInterval(() => setUsage(readUsage()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const week = useMemo(() => {
    if (!usage) return null;
    const now = new Date();
    // A past week is evaluated as of its Saturday so none of its days read as "future".
    const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - weeksBack * 7 + (weeksBack ? 6 : now.getDay()));
    return weekUsage(usage, anchor);
  }, [usage, weeksBack]);

  // Changing week resets the selection to that week's "today" (or its busiest day).
  useEffect(() => setSelectedKey(null), [weeksBack]);

  if (!ready || !isAuthenticated) return null;

  const average = week ? dailyAverageSeconds(week) : 0;
  const ceiling = week ? chartCeiling(week) : HOUR;
  // Default selection: today for the current week, the busiest day for past weeks.
  // (weekUsage flags "today" relative to its anchor date, so only trust it when weeksBack === 0.)
  const selected =
    week &&
    (week.find((d) => d.key === selectedKey) ||
      (weeksBack === 0 ? week.find((d) => d.isToday) : week.reduce((a, b) => (b.seconds > a.seconds ? b : a))));
  const weekTotal = week ? week.reduce((sum, d) => sum + d.seconds, 0) : 0;

  return (
    <SettingsPage title="Screen Time & Activity">
      {/* Header card: daily average */}
      <section
        aria-label="Daily average watch time"
        className="bg-slate-50 dark:bg-neutral-900/90 rounded-2xl border border-slate-200 dark:border-neutral-800 p-5 mb-5"
      >
        <p className="font-sans font-bold text-[11px] tracking-widest uppercase text-slate-500 dark:text-neutral-500">Daily average</p>
        <p className="font-sans font-bold text-4xl tracking-tight text-slate-900 dark:text-white mt-1.5">
          {week ? formatDuration(average) : '—'}
        </p>
        <p className="font-sans font-medium text-xs text-slate-500 dark:text-neutral-400 mt-1.5">
          {week ? `${formatDuration(weekTotal)} total · ${weekRangeLabel(week, weeksBack)}` : 'Loading your activity…'}
        </p>
      </section>

      {/* Weekly bar chart */}
      <section
        aria-label="Weekly usage"
        className="bg-slate-50 dark:bg-neutral-900/90 rounded-2xl border border-slate-200 dark:border-neutral-800 p-4 mb-5"
      >
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setWeeksBack((w) => Math.min(MAX_WEEKS_BACK, w + 1))}
            disabled={weeksBack >= MAX_WEEKS_BACK}
            aria-label="Previous week"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <div className="text-center">
            <p className="font-sans font-bold text-sm text-slate-900 dark:text-white">{week ? weekRangeLabel(week, weeksBack) : ' '}</p>
            <p className="font-sans font-medium text-xs text-slate-500 dark:text-neutral-400 mt-0.5" aria-live="polite">
              {selected ? `${selected.label} · ${formatDuration(selected.seconds)}` : ' '}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWeeksBack((w) => Math.max(0, w - 1))}
            disabled={weeksBack === 0}
            aria-label="Next week"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-2">
          {/* y-axis */}
          <div
            className="flex flex-col justify-between items-end pr-1 font-sans font-bold text-[10px] text-slate-500 dark:text-neutral-500 tabular-nums"
            style={{ height: CHART_HEIGHT_PX }}
            aria-hidden="true"
          >
            <span>{formatDuration(ceiling)}</span>
            <span>{formatDuration(ceiling / 2)}</span>
            <span>0</span>
          </div>

          {/* bars */}
          <div className="relative flex-1">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-200 dark:border-neutral-800" aria-hidden="true" />
            <div className="absolute inset-x-0 border-t border-dashed border-slate-200 dark:border-neutral-800" aria-hidden="true" style={{ top: CHART_HEIGHT_PX / 2 }} />
            <div className="relative grid grid-cols-7 gap-2 items-end" style={{ height: CHART_HEIGHT_PX }} role="group" aria-label="Minutes watched per day, Sunday to Saturday">
              {(week || Array.from({ length: 7 }, (_, i) => ({ key: i, label: '', seconds: 0 }))).map((d) => {
                const isSelected = selected && d.key === selected.key;
                const pct = Math.min(100, (d.seconds / ceiling) * 100);
                return (
                  <button
                    key={d.key}
                    type="button"
                    disabled={!week || d.isFuture}
                    onClick={() => setSelectedKey(d.key)}
                    aria-label={`${d.label}: ${formatDuration(d.seconds)}`}
                    aria-pressed={!!isSelected}
                    className="h-full flex items-end justify-center group focus:outline-none"
                  >
                    <span
                      className={`block w-full max-w-[28px] rounded-t-lg transition-all duration-300 motion-reduce:transition-none group-focus-visible:ring-2 group-focus-visible:ring-amber-400 ${
                        isSelected ? 'bg-amber-500' : d.isFuture ? 'bg-slate-100 dark:bg-neutral-800/60' : 'bg-neutral-700 group-hover:bg-neutral-600'
                      }`}
                      // 3px floor so an empty-but-elapsed day still reads as a baseline stub.
                      style={{ height: d.isFuture ? 3 : `max(3px, ${pct}%)` }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-7 gap-2 mt-2" aria-hidden="true">
              {(week || []).map((d) => (
                <span
                  key={d.key}
                  className={`text-center font-sans font-bold text-[11px] ${
                    selected && d.key === selected.key ? 'text-amber-600 dark:text-amber-500' : 'text-slate-500 dark:text-neutral-500'
                  }`}
                >
                  {d.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SettingsGroup
        title="Reminders"
        footer="Time is counted while ClipPulse is open and visible, on this device and browser only."
      >
        <ToggleRow
          icon="⏰"
          title="Daily Reminder"
          subtitle="Take a break after 60 mins"
          checked={breakReminder}
          onChange={setBreakReminder}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}
