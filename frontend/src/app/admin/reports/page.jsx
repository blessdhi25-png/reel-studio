'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

const REASON_LABELS = {
  spam: 'Spam',
  fraud_or_scam: 'Fraud or scam',
  harassment_or_abuse: 'Harassment',
  impersonation: 'Impersonation',
  intellectual_property: 'Copyright',
  sexual_content: 'Sexual content',
  child_safety: 'Child safety',
  other: 'Other',
};

// Category badge color — bold red for the most severe categories, amber for
// abuse-adjacent-but-lower-severity, blue for IP/copyright, zinc for the rest.
const REASON_STYLES = {
  impersonation: 'bg-red-500/15 text-red-400 border border-red-500/40',
  harassment_or_abuse: 'bg-red-500/15 text-red-400 border border-red-500/40',
  child_safety: 'bg-red-500/15 text-red-400 border border-red-500/40',
  sexual_content: 'bg-red-500/15 text-red-400 border border-red-500/40',
  spam: 'bg-amber-500/15 text-amber-400 border border-amber-500/40',
  fraud_or_scam: 'bg-amber-500/15 text-amber-400 border border-amber-500/40',
  intellectual_property: 'bg-blue-500/15 text-blue-400 border border-blue-500/40',
  other: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
};

const STATUS_BADGE = {
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/40',
  resolved: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40',
  dismissed: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
};

const STATUS_TABS = ['pending', 'resolved', 'dismissed', 'all'];

const MODAL_ACTIONS = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'warn', label: 'Issue warning' },
  { value: 'remove_content', label: 'Remove content' },
  { value: 'suspend_user', label: 'Suspend target' },
  { value: 'ban_user', label: 'Ban target (permanent)' },
];

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function MetricCard({ label, value, sub, tone }) {
  const toneClasses = {
    default: 'bg-zinc-900/80 border-zinc-800 text-white',
    amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    red: 'bg-red-500/10 text-red-400 border border-red-500/30',
  };
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone] || toneClasses.default}`}>
      <p className="font-mono text-[10px] uppercase tracking-widest opacity-70 mb-2">{label}</p>
      <p className="font-display text-3xl tracking-wide">{value}</p>
      {sub && <p className="font-body text-xs opacity-70 mt-1">{sub}</p>}
    </div>
  );
}

function TargetPreview({ report, onOpenMedia }) {
  const { targetType, target } = report;

  if (!target) {
    return <p className="font-body text-sm text-zinc-500 italic">Target no longer exists.</p>;
  }

  if (targetType === 'video') {
    return (
      <button
        onClick={() => onOpenMedia(target)}
        className="flex items-center gap-3 text-left group"
      >
        <span className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
          {target.thumbnailUrl && (
            <img src={target.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block font-body text-sm text-white">
            Video by <span className="text-amber-400">@{target.user?.username}</span>
          </span>
          <span className="block font-body text-xs text-zinc-500 truncate max-w-xs group-hover:text-zinc-300">
            {target.caption || '(no caption)'}
          </span>
        </span>
      </button>
    );
  }

  if (targetType === 'user') {
    return (
      <a href={`/profile/${target.id}`} className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center font-display text-amber-400 text-sm">
          {target.avatarUrl ? (
            <img src={target.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            target.username?.[0]?.toUpperCase()
          )}
        </span>
        <span className="font-body text-sm text-white">
          User profile — <span className="text-amber-400">@{target.username}</span>
          {target.accountStatus !== 'active' && (
            <span className="ml-2 font-mono text-[10px] text-red-400 uppercase">{target.accountStatus}</span>
          )}
        </span>
      </a>
    );
  }

  // comment
  return (
    <p className="font-body text-sm text-white">
      Comment by <span className="text-amber-400">@{target.user?.username}</span>
      <span className="block text-xs text-zinc-500 mt-0.5 truncate max-w-xs">"{target.content}"</span>
    </p>
  );
}

function ResolutionModal({ report, onClose, onSave }) {
  const [action, setAction] = useState('dismiss');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(report.id, action, note.trim() || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <p className="font-display text-xl text-white tracking-wide mb-1">Resolve report</p>
        <p className="font-body text-xs text-zinc-500 mb-5">
          {REASON_LABELS[report.reason]} · reported by @{report.reporter?.username}
        </p>

        <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
          Action
        </label>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white mb-4 outline-none focus:border-amber-500/50"
        >
          {MODAL_ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>

        <label className="block font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
          Resolution notes
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="What did you find, and why this action?"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500/50 mb-5"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-amber-500 hover:bg-amber-400 text-black px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save resolution'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaPreviewModal({ video, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-[9/16] bg-zinc-800">
          {video.thumbnailUrl && (
            <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="p-4">
          <p className="font-body text-sm text-white mb-1">@{video.user?.username}</p>
          <p className="font-body text-xs text-zinc-400 mb-4">{video.caption || '(no caption)'}</p>
          <div className="flex gap-2">
            <a
              href={`/profile/${video.user?.id}`}
              className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-xs font-semibold"
            >
              View creator
            </a>
            <button
              onClick={onClose}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded-lg text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportCard({ report, isPending, busy, onQuickAction, onOpenModal, onOpenMedia }) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all shadow-xl">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded-lg font-bold ${
              REASON_STYLES[report.reason] || REASON_STYLES.other
            }`}
          >
            {REASON_LABELS[report.reason] || report.reason}
          </span>
          <span
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded-lg ${
              STATUS_BADGE[report.status] || STATUS_BADGE.dismissed
            }`}
          >
            {report.status === 'pending' && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
            {report.status}
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">{timeAgo(report.createdAt)}</span>
      </div>

      {/* Target + reporter box */}
      <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 mb-4 space-y-3">
        <TargetPreview report={report} onOpenMedia={onOpenMedia} />
        {report.details && (
          <div className="bg-zinc-800/60 border-l-4 border-amber-500 p-3 italic text-zinc-200 text-sm rounded-r-lg">
            "{report.details}"
          </div>
        )}
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
          Reported by @{report.reporter?.username || 'unknown'}
        </p>
      </div>

      {/* Resolution note, once resolved/dismissed */}
      {!isPending && report.resolution && (
        <p className="font-body text-xs text-zinc-400 mb-4">
          Resolution: <span className="text-zinc-300">{report.resolution}</span>
        </p>
      )}

      {/* Quick-action toolbar */}
      {isPending && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => onQuickAction(report.id, 'dismiss')}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
          >
            Dismiss Report
          </button>
          <button
            disabled={busy}
            onClick={() => onQuickAction(report.id, 'warn')}
            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
          >
            Issue Warning
          </button>
          <button
            disabled={busy}
            onClick={() => onQuickAction(report.id, 'suspend_user')}
            className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
          >
            Suspend Target
          </button>
          <button
            disabled={busy}
            onClick={() => onOpenModal(report)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 border border-zinc-700"
          >
            Add note &amp; resolve…
          </button>
        </div>
      )}
    </div>
  );
}

function AdminReportsInner() {
  const searchParams = useSearchParams();
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [busyId, setBusyId] = useState(null);
  const [modalReport, setModalReport] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);

  useEffect(() => {
    api.adminGetReportStats().then(setStats).catch(() => {});
  }, [reports]);

  useEffect(() => {
    setLoading(true);
    const handle = setTimeout(() => {
      api
        .adminGetReports(status, search)
        .then(setReports)
        .finally(() => setLoading(false));
    }, 250); // debounce so typing in search doesn't fire a request per keystroke
    return () => clearTimeout(handle);
  }, [status, search]);

  async function resolve(id, action, note) {
    setBusyId(id);
    try {
      await api.adminResolveReport(id, action, note);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const openCount = stats ? stats.pending : 0;

  return (
    <div>
      <h1 className="font-display text-3xl text-white tracking-wide mb-6">Moderation Reports</h1>

      {/* Overview banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Total Reports" value={stats?.total ?? '—'} sub={`${openCount} open`} tone="default" />
        <MetricCard label="Pending Action" value={stats?.pending ?? '—'} tone="amber" />
        <MetricCard label="Critical Violations" value={stats?.critical ?? '—'} sub="Impersonation & harassment" tone="red" />
        <MetricCard
          label="Avg Resolution Time"
          value={stats?.avgResolutionMinutes != null ? `${stats.avgResolutionMinutes}m` : '—'}
          sub="response avg"
          tone="default"
        />
      </div>

      {/* Search + status filter pills */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by keyword, target username, or reporter handle…"
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500/50"
        />
        <div className="bg-zinc-800 rounded-xl p-1 flex gap-1 shrink-0">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${
                status === s ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingSpinner label="Loading…" />}
      {!loading && reports.length === 0 && (
        <p className="font-body text-zinc-500 text-sm">No {status === 'all' ? '' : status} reports match.</p>
      )}

      <div className="space-y-3">
        {reports.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            isPending={r.status === 'pending'}
            busy={busyId === r.id}
            onQuickAction={(id, action) => resolve(id, action)}
            onOpenModal={setModalReport}
            onOpenMedia={setMediaPreview}
          />
        ))}
      </div>

      {modalReport && (
        <ResolutionModal report={modalReport} onClose={() => setModalReport(null)} onSave={resolve} />
      )}
      {mediaPreview && <MediaPreviewModal video={mediaPreview} onClose={() => setMediaPreview(null)} />}
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={<LoadingSpinner label="Loading…" />}>
      <AdminReportsInner />
    </Suspense>
  );
}
