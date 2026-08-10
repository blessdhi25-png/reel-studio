'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

function MetricCard({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-3xl font-extrabold text-white tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-zinc-400 mt-1">{label}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    api
      .getStudioOverview()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  // Top performing video is derived here rather than added as a new backend
  // field — the overview response already returns every video with its
  // viewCount, so there's a real number to rank by instead of adding an
  // endpoint just to sort client-side data that's already in hand.
  const topVideo =
    data?.videos?.length
      ? [...data.videos].sort((a, b) => Number(b.viewCount) - Number(a.viewCount))[0]
      : null;

  return (
    <main className="bg-zinc-950 text-white min-h-screen p-6 max-w-5xl mx-auto space-y-8">
      <a href="/studio" className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
        ← Back to Studio
      </a>

      <h1 className="text-3xl font-extrabold">Analytics</h1>

      {loading && <p className="text-sm text-zinc-400">Loading…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard icon="👁" label="Total video views" value={data.totals.views} />
            <MetricCard icon="♥" label="Total likes received" value={data.totals.likes} />
            <MetricCard icon="💬" label="Total comments" value={data.totals.comments} />
          </div>

          <section>
            <h2 className="text-lg font-semibold mb-4">Top performing video</h2>
            {topVideo ? (
              <div className="flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-5">
                <div className="w-16 h-24 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
                  {topVideo.thumbnailUrl && (
                    <img src={topVideo.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{topVideo.caption || 'Untitled'}</p>
                  <p className="font-mono text-xs text-zinc-400 mt-1">
                    {Number(topVideo.viewCount).toLocaleString()} views ·{' '}
                    {Number(topVideo.likeCount).toLocaleString()} likes ·{' '}
                    {Number(topVideo.commentCount).toLocaleString()} comments
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Post a video to see your top performer here.</p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-4">All videos</h2>
            {data.videos.length === 0 ? (
              <p className="text-sm text-zinc-400">Nothing posted yet.</p>
            ) : (
              <div className="space-y-2">
                {data.videos.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3"
                  >
                    <div className="w-10 h-14 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
                      {v.thumbnailUrl && (
                        <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <p className="flex-1 min-w-0 text-sm text-white truncate">{v.caption || 'Untitled'}</p>
                    <div className="font-mono text-[10px] text-zinc-400 text-right shrink-0 space-y-0.5">
                      <p>{Number(v.viewCount)} views</p>
                      <p>{Number(v.likeCount)} likes</p>
                      <p>{Number(v.commentCount)} comments</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
