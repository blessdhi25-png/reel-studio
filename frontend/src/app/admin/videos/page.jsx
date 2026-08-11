'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

const STATUS_FILTERS = [
  { value: 'published', label: 'Published' },
  { value: 'processing', label: 'Processing' },
  { value: 'removed', label: 'Removed' },
  { value: 'all', label: 'All' },
];

const STATUS_BADGE = {
  published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  processing: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  removed: 'bg-red-500/10 text-red-400 border-red-500/30',
};

function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AdminVideosPage() {
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState('published');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [flagsFor, setFlagsFor] = useState(null); // video id currently showing its flags panel
  const [flags, setFlags] = useState([]);
  const [flagsLoading, setFlagsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.adminGetVideos(status).then(setVideos).catch(() => setVideos([])).finally(() => setLoading(false));
  }, [status]);

  async function takedown(id) {
    const reason = window.prompt('Reason for takedown?') || undefined;
    setBusyId(id);
    try {
      await api.adminRemoveVideo(id, reason);
      setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, status: 'removed' } : v)));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function viewFlags(id) {
    if (flagsFor === id) {
      setFlagsFor(null);
      return;
    }
    setFlagsFor(id);
    setFlagsLoading(true);
    try {
      const data = await api.adminGetVideoFlags(id);
      setFlags(data);
    } catch {
      setFlags([]);
    } finally {
      setFlagsLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-white tracking-wide mb-6">Video Queue</h1>

      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`font-mono text-xs uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-colors ${
              status === s.value
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                : 'border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner label="Loading…" />}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map((v) => (
            <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
              <div className="relative aspect-[9/16] bg-zinc-950">
                {v.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                    No thumbnail
                  </div>
                )}
                <span className={`absolute top-2 left-2 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${STATUS_BADGE[v.status]}`}>
                  {v.status}
                </span>
                {v.reportsCount > 0 && (
                  <span className="absolute top-2 right-2 font-mono text-[9px] text-red-400 bg-black/70 px-1.5 py-0.5 rounded">
                    {v.reportsCount} flag{v.reportsCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="p-3 flex-1 flex flex-col gap-2">
                <a href={`/profile/${v.user?.id}`} className="font-body text-xs text-zinc-400 hover:text-amber-400 truncate">
                  @{v.user?.username || 'unknown'}
                </a>
                <p className="font-body text-sm text-white line-clamp-2 min-h-[2.5em]">
                  {v.caption || <em className="text-zinc-600">No caption</em>}
                </p>
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                  {formatCount(v.viewCount)} views · {formatCount(v.likeCount)} likes
                </p>

                <div className="flex gap-2 mt-auto pt-1">
                  {v.status !== 'removed' && (
                    <button
                      disabled={busyId === v.id}
                      onClick={() => takedown(v.id)}
                      className="flex-1 font-mono text-[10px] uppercase tracking-widest px-2 py-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                    >
                      Takedown
                    </button>
                  )}
                  <button
                    onClick={() => viewFlags(v.id)}
                    className="flex-1 font-mono text-[10px] uppercase tracking-widest px-2 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    {flagsFor === v.id ? 'Hide flags' : 'View Flags'}
                  </button>
                </div>

                {flagsFor === v.id && (
                  <div className="mt-2 pt-2 border-t border-zinc-800">
                    {flagsLoading && <LoadingSpinner size={14} label="Loading flags…" />}
                    {!flagsLoading && flags.length === 0 && (
                      <p className="font-body text-xs text-zinc-500">No flags on this video.</p>
                    )}
                    {!flagsLoading &&
                      flags.map((f) => (
                        <div key={f.id} className="font-body text-xs text-zinc-400 mb-1.5 last:mb-0">
                          <span className="text-amber-400">{f.reason.replace(/_/g, ' ')}</span>
                          {' — '}reported by @{f.reporter?.username || 'unknown'}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {videos.length === 0 && (
            <div className="col-span-full text-center py-10">
              <p className="font-body text-sm text-zinc-500">No videos match this filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
