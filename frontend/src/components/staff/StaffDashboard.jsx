'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import ConfirmModal from '@/components/ConfirmModal';

// Shared dashboard for the admin (/admin) and moderator (/moderator) portals:
// KPI cards on top, then the flagged-video review queue with Approve / Delete /
// Ban actions. All numbers come from the backend (/admin/stats for admins,
// /moderation/stats for moderators) — nothing is mocked; a failed load shows an
// error with Retry instead of placeholder figures.

const REASON_LABELS = {
  spam: 'Spam',
  fraud_or_scam: 'Fraud / scam',
  harassment_or_abuse: 'Harassment',
  impersonation: 'Impersonation',
  intellectual_property: 'Copyright',
  sexual_content: 'Sexual content',
  child_safety: 'Child safety',
  other: 'Other',
};

const THEMES = {
  light: {
    heading: 'text-slate-900',
    sub: 'text-slate-500',
    card: 'bg-white border-slate-200 shadow-sm',
    kpiLabel: 'text-slate-500',
    kpiValue: 'text-slate-900',
    chip: 'bg-slate-100 text-slate-700',
    thumb: 'bg-slate-100 text-slate-400',
    quote: 'bg-slate-50 text-slate-600 border-slate-200',
    outlineBtn: 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100',
    link: 'text-slate-500',
  },
  dark: {
    heading: 'text-white',
    sub: 'text-zinc-400',
    card: 'bg-zinc-900/70 border-zinc-800',
    kpiLabel: 'text-zinc-400',
    kpiValue: 'text-white',
    chip: 'bg-zinc-800 text-zinc-200',
    thumb: 'bg-zinc-800 text-zinc-500',
    quote: 'bg-zinc-950 text-zinc-300 border-zinc-800',
    outlineBtn: 'bg-zinc-900 border-zinc-700 text-zinc-100 hover:bg-zinc-800',
    link: 'text-zinc-400',
  },
};

const ADMIN_KPIS = [
  { key: 'totalUsers', label: 'Total users' },
  { key: 'activeUsers24h', label: 'Active users · 24h', hint: 'Liked, commented, watched or posted' },
  { key: 'activeUsers7d', label: 'Active users · 7d', hint: 'Liked, commented, watched or posted' },
  { key: 'newUsers7d', label: 'New users · 7d' },
  { key: 'totalVideos', label: 'Live posts' },
  { key: 'pendingReports', label: 'Pending reports', tone: 'warn' },
  { key: 'flaggedContent', label: 'Flagged videos', tone: 'warn' },
  { key: 'bannedUsers', label: 'Banned users' },
];

const MOD_KPIS = [
  { key: 'pendingReports', label: 'Pending reports', tone: 'warn' },
  { key: 'flaggedVideos', label: 'Flagged videos', tone: 'warn' },
  { key: 'resolvedByMeToday', label: 'Resolved by you today' },
  { key: 'removedToday', label: 'Videos removed today' },
  { key: 'bannedUsers', label: 'Banned users' },
];

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

function KpiCard({ label, value, hint, tone, t }) {
  return (
    <div className={`rounded-2xl border p-4 ${t.card}`} title={hint}>
      <p className={`text-[11px] font-extrabold uppercase tracking-widest ${t.kpiLabel}`}>{label}</p>
      <p className={`mt-2 text-3xl font-black tracking-tight ${tone === 'warn' && value > 0 ? 'text-amber-500' : t.kpiValue}`}>
        {fmt(value)}
      </p>
    </div>
  );
}

function ActionButton({ onClick, disabled, tone, children }) {
  const tones = {
    approve: 'bg-emerald-500 hover:bg-emerald-400 text-black',
    delete: 'bg-red-600 hover:bg-red-500 text-white',
    ban: 'bg-black hover:bg-neutral-800 text-white border border-neutral-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 min-w-[7rem] px-4 py-3 rounded-xl text-sm font-extrabold tracking-tight transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function StaffDashboard({ mode = 'moderator', theme = 'light', viewerRole = 'moderator' }) {
  const t = THEMES[theme];
  const toast = useToast();
  const isAdmin = mode === 'admin';
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: 'delete' | 'ban', item }

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, q] = await Promise.all([isAdmin ? api.adminGetStats() : api.moderationStats(), api.moderationQueue()]);
      setStats(s);
      setQueue(q);
    } catch (err) {
      setError(err.message || "Couldn't load the dashboard.");
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  // Drop the card locally and refresh the KPI numbers in the background.
  async function afterAction(item, message) {
    setQueue((q) => q.filter((x) => x.videoId !== item.videoId));
    toast.success(message);
    try {
      setStats(await (isAdmin ? api.adminGetStats() : api.moderationStats()));
    } catch { /* KPIs refresh on the next load */ }
  }

  async function run(item, fn, message) {
    setBusyId(item.videoId);
    try {
      await fn();
      await afterAction(item, message);
    } catch (err) {
      toast.error(err.message || 'Action failed — try again.');
    } finally {
      setBusyId(null);
    }
  }

  const approve = (item) => run(item, () => api.moderationApprove(item.videoId), 'Approved — reports dismissed');

  function onConfirm() {
    const { kind, item } = confirm;
    setConfirm(null);
    if (kind === 'delete') return run(item, () => api.moderationRemove(item.videoId, `Removed from review queue (${item.reportCount} reports)`), 'Video removed');
    return run(item, async () => {
      await api.moderationBan(item.video.user.id, `Banned after review of flagged video (${item.reportCount} reports)`);
      await api.moderationRemove(item.videoId, 'Removed with author ban');
    }, `@${item.video.user.username} banned and video removed`);
  }

  const kpis = isAdmin ? ADMIN_KPIS : MOD_KPIS;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className={`text-2xl md:text-3xl font-black tracking-tight ${t.heading}`}>
            {isAdmin ? 'Admin dashboard' : 'Moderator dashboard'}
          </h1>
          <p className={`text-sm font-semibold mt-1 ${t.sub}`}>
            {isAdmin ? 'Platform health and the content review queue.' : 'Review flagged videos and keep ClipPulse safe.'}
          </p>
        </div>
        <button onClick={load} className={`shrink-0 px-4 py-2 rounded-xl border text-xs font-extrabold uppercase tracking-widest ${t.outlineBtn}`}>
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-red-500">{error}</p>
          <button onClick={load} className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-extrabold">Retry</button>
        </div>
      )}

      <div className={`grid gap-3 mb-8 ${isAdmin ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-5'}`}>
        {kpis.map((k) => (
          <KpiCard key={k.key} t={t} label={k.label} hint={k.hint} tone={k.tone} value={stats ? stats[k.key] : undefined} />
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-lg font-black tracking-tight ${t.heading}`}>Flagged video queue</h2>
        {queue && <span className={`text-xs font-extrabold uppercase tracking-widest ${t.sub}`}>{queue.length} to review</span>}
      </div>

      {!queue && !error && <p className={`text-sm font-bold ${t.sub}`}>Loading queue…</p>}
      {queue && queue.length === 0 && (
        <div className={`rounded-2xl border p-10 text-center ${t.card}`}>
          <p className={`text-lg font-black ${t.heading}`}>Queue clear 🎉</p>
          <p className={`text-sm font-semibold mt-1 ${t.sub}`}>No flagged videos are waiting for review.</p>
        </div>
      )}

      <ul className="space-y-4">
        {(queue || []).map((item) => {
          const v = item.video;
          const author = v?.user;
          const busy = busyId === item.videoId;
          const canBan = !!author && author.role !== 'admin' && (author.role !== 'moderator' || viewerRole === 'admin') && author.accountStatus !== 'banned';
          return (
            <li key={item.videoId} className={`rounded-2xl border p-4 ${t.card}`}>
              <div className="flex gap-4">
                <div className={`w-24 h-32 shrink-0 rounded-xl overflow-hidden flex items-center justify-center text-xs font-bold ${t.thumb}`}>
                  {v?.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{v ? 'No preview' : 'Deleted'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`font-extrabold tracking-tight truncate ${t.heading}`}>
                      {author ? `@${author.username}` : 'Unknown author'}
                      {author?.accountStatus === 'banned' && (
                        <span className="ml-2 align-middle text-[10px] font-extrabold uppercase tracking-widest text-red-500">Banned</span>
                      )}
                    </p>
                    <span className="shrink-0 rounded-lg bg-red-500/15 text-red-500 border border-red-500/40 px-2.5 py-1 text-xs font-black">
                      {item.reportCount} report{item.reportCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className={`text-sm font-semibold mt-1 line-clamp-2 ${t.sub}`}>{v?.caption || 'No caption'}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(item.reasons).map(([reason, count]) => (
                      <span key={reason} className={`text-[11px] font-extrabold uppercase tracking-wider rounded-lg px-2 py-1 ${t.chip}`}>
                        {REASON_LABELS[reason] || reason} ×{count}
                      </span>
                    ))}
                  </div>
                  {item.latestDetails && (
                    <p className={`mt-2 text-xs font-semibold rounded-lg border px-2.5 py-1.5 line-clamp-2 ${t.quote}`}>“{item.latestDetails}”</p>
                  )}
                  <p className={`text-[11px] font-bold mt-2 ${t.link}`}>
                    Last reported {new Date(item.latestAt).toLocaleString()}
                    {v?.status === 'removed' && ' · already removed'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <ActionButton tone="approve" disabled={busy} onClick={() => approve(item)}>✓ Approve</ActionButton>
                <ActionButton tone="delete" disabled={busy || !v || v.status === 'removed'} onClick={() => setConfirm({ kind: 'delete', item })}>🗑 Delete</ActionButton>
                <ActionButton tone="ban" disabled={busy || !canBan} onClick={() => setConfirm({ kind: 'ban', item })}>⛔ Ban author</ActionButton>
              </div>
            </li>
          );
        })}
      </ul>

      {confirm && (
        <ConfirmModal
          title={confirm.kind === 'delete' ? 'Delete this video?' : `Ban @${confirm.item.video.user.username}?`}
          message={
            confirm.kind === 'delete'
              ? 'The video is hidden everywhere and its reports are resolved. It stays in the database as evidence.'
              : "The account is banned immediately and can't log in. The flagged video is removed too."
          }
          confirmLabel={confirm.kind === 'delete' ? 'Delete video' : 'Ban account'}
          onConfirm={onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
