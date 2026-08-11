'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { LoadingSpinner } from '../../../components/LoadingScreen';

export default function AdminVideosPage() {
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState('published');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.adminGetVideos(status).then(setVideos).finally(() => setLoading(false));
  }, [status]);

  async function remove(id) {
    const reason = window.prompt('Reason for removal?') || undefined;
    setBusyId(id);
    try {
      await api.adminRemoveVideo(id, reason);
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        {['published', 'processing', 'removed', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`font-mono text-xs uppercase tracking-widest px-3 py-1 rounded-sprocket border ${
              status === s ? 'border-reel text-reel' : 'border-smoke/30 text-smoke'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner label="Loading…" />}

      <div className="space-y-3">
        {videos.map((v) => (
          <div key={v.id} className="bg-ink2 rounded-sprocket p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-body text-sm text-bone">@{v.user?.username}</p>
              {v.reportsCount > 0 && (
                <span className="font-mono text-[10px] text-red-400">
                  {v.reportsCount} report{v.reportsCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="font-body text-xs text-smoke mb-2">{v.caption || <em>No caption</em>}</p>
            <p className="font-mono text-[10px] text-smoke mb-3">
              {v.videoType} · {v.status} · {new Date(v.createdAt).toLocaleDateString()}
            </p>
            {v.status !== 'removed' && (
              <button
                disabled={busyId === v.id}
                onClick={() => remove(v.id)}
                className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-sprocket border border-red-400/40 text-red-400 disabled:opacity-40"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
