'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { friendlyError } from '@/lib/friendlyError';
import { SettingsPage } from '@/components/settings/SettingsUI';
import { LoadingSpinner } from '@/components/LoadingScreen';

const RECENTS_KEY = 'clippulse.recentSearches'; // same key app/search/page.jsx writes

const TITLES = {
  watch: 'Watch history',
  comments: 'Comment history',
  search: 'Search history',
  ads: 'Ad activity history',
  mentions: 'Mention history',
  account: 'Account history',
  reuse: 'Reuse of content history',
};

const EMPTY = {
  watch: 'Videos you watch will show up here.',
  comments: 'Comments you post will show up here.',
  search: 'Your recent searches will show up here.',
  ads: 'There’s no ad activity to show yet.',
  mentions: 'There’s no mention history to show yet.',
  account: 'No sign-ins recorded yet.',
  reuse: 'There’s no reuse-of-content history to show yet.',
};

const dayLabel = (iso) => {
  const d = new Date(iso);
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts);
};
const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();

// Groups rows (already newest-first) under their calendar day.
function groupByDay(rows, getDate) {
  const groups = [];
  for (const r of rows) {
    const label = dayLabel(getDate(r));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

const CARD = 'bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-sm';

function Thumb({ video }) {
  return (
    <span className="w-12 h-16 rounded-lg overflow-hidden bg-slate-200 dark:bg-neutral-800 shrink-0 block">
      {video?.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
      )}
    </span>
  );
}

function VideoRow({ video, primary, secondary, at }) {
  const body = (
    <>
      <Thumb video={video} />
      <span className="flex-1 min-w-0">
        <span className="block font-sans font-bold text-sm text-slate-900 dark:text-white line-clamp-2 break-words">{primary}</span>
        <span className="block font-sans text-xs text-slate-500 dark:text-neutral-400 mt-0.5 truncate">{secondary}</span>
        <span className="block font-sans text-xs text-slate-400 dark:text-neutral-500 mt-0.5">{timeLabel(at)}</span>
      </span>
    </>
  );
  const cls = `${CARD} flex items-center gap-3 p-3`;
  return video?.user?.id ? (
    <Link href={`/profile/${video.user.id}`} className={`${cls} hover:bg-slate-50 dark:hover:bg-neutral-800/60 transition-colors`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function ActivityKindPage() {
  const { kind } = useParams();
  const router = useRouter();
  const toast = useToast();
  const { ready, isAuthenticated } = useAuth();
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const title = TITLES[kind];

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!ready || !isAuthenticated || !title) return;
    let cancelled = false;
    const done = (list) => !cancelled && setRows(list);
    const fail = (err) => {
      if (cancelled) return;
      setError(friendlyError(err));
      setRows([]);
    };
    if (kind === 'account') api.getLoginHistory().then((d) => done(d.events || [])).catch(fail);
    else if (kind === 'comments') api.getCommentHistory().then((d) => done(d.comments || [])).catch(fail);
    else if (kind === 'watch') api.getWatchHistory().then((d) => done(d.items || [])).catch(fail);
    else if (kind === 'search') {
      try {
        const list = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || '[]');
        done(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
      } catch {
        done([]);
      }
    } else done([]); // ads / mentions / reuse: nothing is tracked for these yet
    return () => {
      cancelled = true;
    };
  }, [kind, ready, isAuthenticated, title]);

  const grouped = useMemo(() => {
    if (!rows) return [];
    if (kind === 'account') return groupByDay(rows, (r) => r.createdAt);
    if (kind === 'comments' || kind === 'watch') return groupByDay(rows, (r) => r.createdAt);
    return [];
  }, [rows, kind]);

  function clearSearches() {
    try {
      window.localStorage.removeItem(RECENTS_KEY);
    } catch {
      /* storage blocked */
    }
    setRows([]);
    toast.success('Search history cleared');
  }

  if (!ready || !isAuthenticated) return null;
  if (!title) {
    return (
      <SettingsPage title="Activity centre" backHref="/settings/activity" backLabel="Activity centre">
        <p className="text-sm text-slate-500 dark:text-neutral-400">That page doesn’t exist.</p>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title={title} backHref="/settings/activity" backLabel="Activity centre">
      {kind === 'account' && (
        <p className="-mt-1 mb-5 rounded-xl bg-slate-200/60 dark:bg-neutral-900 px-4 py-3 text-sm text-slate-600 dark:text-neutral-400 leading-relaxed">
          Account history from the past one year will be shown. If you don’t recognise any activity, review your{' '}
          <Link href="/settings/account" className="font-bold text-slate-900 dark:text-white underline-offset-2 hover:underline">Account information</Link> or{' '}
          <Link href="/settings/security" className="font-bold text-slate-900 dark:text-white underline-offset-2 hover:underline">Manage devices</Link>.
        </p>
      )}

      {rows === null && <LoadingSpinner label="Loading…" />}
      {error && <p className="text-sm font-semibold text-red-500 mb-4" role="alert">{error}</p>}

      {rows && rows.length === 0 && !error && (
        <p className="text-center text-sm text-slate-500 dark:text-neutral-400 py-16 px-6">{EMPTY[kind]}</p>
      )}

      {kind === 'search' && rows?.length > 0 && (
        <>
          <div className={`${CARD} divide-y divide-slate-100 dark:divide-neutral-800 overflow-hidden`}>
            {rows.map((q) => (
              <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="block px-4 py-3.5 text-sm font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-neutral-800/60">
                {q}
              </Link>
            ))}
          </div>
          <button type="button" onClick={clearSearches} className="mt-4 w-full py-3 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 font-bold text-sm hover:bg-red-500/15 transition-colors">
            Clear search history
          </button>
        </>
      )}

      {grouped.map((g) => (
        <section key={g.label} className="mb-6">
          <h2 className="font-sans font-bold text-lg text-slate-900 dark:text-white px-1 mb-2.5">{g.label}</h2>
          <div className="space-y-3">
            {g.rows.map((r) =>
              kind === 'account' ? (
                <div key={r.id} className={`${CARD} flex gap-3 p-4`}>
                  <span className="w-9 h-9 rounded-full bg-slate-700 dark:bg-neutral-700 text-white flex items-center justify-center shrink-0">
                    <LogIn size={16} strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-sans font-bold text-base text-slate-900 dark:text-white">Account logged in</span>
                    <span className="block font-sans text-sm text-slate-500 dark:text-neutral-400 mt-1 leading-snug">
                      You logged in to your account from {r.device}
                      {r.location ? ` in ${r.location}` : ''}
                      {r.method === 'google' ? ' with Google' : ''}
                    </span>
                    <span className="block font-sans text-sm text-slate-400 dark:text-neutral-500 mt-1.5">{timeLabel(r.createdAt)}</span>
                  </span>
                </div>
              ) : kind === 'comments' ? (
                <VideoRow key={r.id} video={r.video} primary={r.content} secondary={`On ${r.video?.user?.username ? `@${r.video.user.username}’s` : 'a'} video`} at={r.createdAt} />
              ) : (
                <VideoRow
                  key={`${r.video?.id}-${r.createdAt}`}
                  video={r.video}
                  primary={r.video?.caption || 'Untitled video'}
                  secondary={`@${r.video?.user?.username || 'unknown'}${r.completed ? ' · Watched to the end' : ''}`}
                  at={r.createdAt}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </SettingsPage>
  );
}
