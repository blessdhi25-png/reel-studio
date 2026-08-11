'use client';

import { useEffect, useState } from 'react';
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

export default function ModerationQueuePage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // adminGetReports isn't filterable by targetType server-side, so this
      // groups video reports by video here instead of adding a new backend
      // param for a single admin view — /admin/reports already covers the
      // general case (any target type) for the rest of the team.
      const reports = await api.adminGetReports('pending');
      const videoReports = reports.filter((r) => r.targetType === 'video');

      const byVideo = new Map();
      for (const r of videoReports) {
        if (!byVideo.has(r.targetId)) byVideo.set(r.targetId, []);
        byVideo.get(r.targetId).push(r);
      }
      setGroups(
        [...byVideo.entries()]
          .map(([videoId, reports]) => ({ videoId, reports }))
          .sort((a, b) => b.reports.length - a.reports.length)
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function approve(group) {
    setBusyId(group.videoId);
    try {
      // "Approve" = the video is fine, dismiss every report against it.
      await Promise.all(
        group.reports.map((r) => api.adminResolveReport(r.id, 'dismiss', 'Reviewed — content approved'))
      );
      setGroups((prev) => prev.filter((g) => g.videoId !== group.videoId));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteVideo(group) {
    if (!confirm('Remove this video? This resolves all its pending reports too.')) return;
    setBusyId(group.videoId);
    try {
      await api.adminRemoveVideo(group.videoId, `Removed via moderation queue (${group.reports.length} reports)`);
      await Promise.all(
        group.reports.map((r) => api.adminResolveReport(r.id, 'remove_content', 'Video removed'))
      );
      setGroups((prev) => prev.filter((g) => g.videoId !== group.videoId));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Moderation queue</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Reported videos grouped by video, most-reported first. For non-video reports
            (users, comments) or full history, use the Moderation Reports tab.
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs font-mono uppercase tracking-widest text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 hover:border-amber-500/40"
        >
          Refresh
        </button>
      </div>

      {loading && <LoadingSpinner label="Loading…" />}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && groups.length === 0 && (
        <p className="text-sm text-zinc-400">No reported videos pending review.</p>
      )}

      <div className="space-y-3">
        {groups.map((group) => {
          const first = group.reports[0];
          const reasonCounts = {};
          for (const r of group.reports) reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;

          return (
            <div key={group.videoId} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="text-sm text-white font-semibold">
                    Video <span className="font-mono text-xs text-zinc-500">{group.videoId}</span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Most recently reported {new Date(first.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="shrink-0 bg-red-500/15 text-red-400 border border-red-500/40 rounded-lg px-2.5 py-1 text-xs font-bold">
                  {group.reports.length} report{group.reports.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(reasonCounts).map(([reason, count]) => (
                  <span
                    key={reason}
                    className="text-[11px] font-mono uppercase tracking-widest bg-zinc-800 text-zinc-300 rounded-lg px-2 py-1"
                  >
                    {REASON_LABELS[reason] || reason} × {count}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => approve(group)}
                  disabled={busyId === group.videoId}
                  className="text-xs font-semibold px-4 py-2 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
                >
                  ✓ Approve (dismiss reports)
                </button>
                <button
                  onClick={() => deleteVideo(group)}
                  disabled={busyId === group.videoId}
                  className="text-xs font-semibold px-4 py-2 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                >
                  🗑 Delete video
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
