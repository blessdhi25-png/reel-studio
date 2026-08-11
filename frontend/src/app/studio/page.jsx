'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingScreen';

// Small inline icon set — no icon library dependency, kept minimal/monoline
// to match the premium dashboard look without pulling in a new package.
function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
      <path d="M16 8.25a3.25 3.25 0 1 1 3.75 3.2" />
      <path d="M21.5 20c0-3-2.2-5.3-5-5.9" />
    </svg>
  );
}
function HeartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path d="M12 20.5s-8-4.9-8-11.1A4.9 4.9 0 0 1 12 6.1a4.9 4.9 0 0 1 8 3.3c0 6.2-8 11.1-8 11.1Z" />
    </svg>
  );
}
function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3L16 9.8" />
    </svg>
  );
}
function FlameIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path d="M12 2.5s5.5 4.3 5.5 10a5.5 5.5 0 1 1-11 0c0-1.6.8-2.7 1.6-3.7.2 1.4 1 2 1 2-.4-3 1-4.8 2.9-6.3-.2 1.7.5 2.7 0 4 1.2-.7 2-2.4 2-6Z" />
    </svg>
  );
}
function StarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path d="M12 2.5l2.85 6.24 6.65.7-5 4.66 1.4 6.9L12 17.9l-5.9 3.1 1.4-6.9-5-4.66 6.65-.7L12 2.5Z" />
    </svg>
  );
}
function MusicIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path d="M9 18V5.5l10-2v12.5" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </svg>
  );
}

function KpiCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5" />
        </span>
        {/* No week-over-week comparison exists on the backend yet (studio
           overview only returns lifetime totals) — showing a fabricated
           "+12.4%" badge here would look like real analytics but wouldn't
           be. Once the API tracks a historical snapshot, swap this for a
           real delta badge instead of "All time". */}
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">All time</span>
      </div>
      <p className="text-3xl font-extrabold text-white tabular-nums">{value}</p>
      <p className="text-xs text-zinc-400 mt-1">{label}</p>
    </div>
  );
}

function ToolCard({ icon: Icon, label, href }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 hover:border-amber-500/40 hover:bg-zinc-900 transition-colors"
    >
      <span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <span className="text-sm text-white font-medium">{label}</span>
    </a>
  );
}

export default function StudioPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trending, setTrending] = useState([]);
  const [inspirationTab, setInspirationTab] = useState('posts');

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
    api.getTrending().then(setTrending).catch(() => {});
  }, [router]);

  return (
    <main className="bg-zinc-950 text-white min-h-screen p-6 max-w-6xl mx-auto space-y-8">
      <a href="/menu" className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
        ← Back to menu
      </a>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="bg-gradient-to-r from-amber-400 via-amber-200 to-white bg-clip-text text-transparent font-extrabold text-3xl tracking-tight">
          REEL STUDIO
        </h1>
        <div className="flex gap-3">
          <a
            href="/live"
            className="text-sm font-semibold px-4 py-2 rounded-xl border border-zinc-700 text-white hover:border-amber-400/50 transition-colors"
          >
            ● Go Live
          </a>
          <a
            href="/upload"
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-colors"
          >
            + Upload Reel
          </a>
        </div>
      </div>

      {loading && <LoadingSpinner label="Loading…" />}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && (
        <>
          {/* Analytics */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Analytics</h2>
              <a href="/analytics" className="text-xs text-amber-400 hover:text-amber-300">
                Full analytics ›
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard icon={EyeIcon} label="Post views" value={data.totals.views.toLocaleString()} />
              <KpiCard icon={UsersIcon} label="Followers" value={data.totals.followerCount.toLocaleString()} />
              <KpiCard icon={HeartIcon} label="Likes" value={data.totals.likes.toLocaleString()} />
            </div>
          </section>

          {/* Monetisation */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Monetisation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <a
                href="/earnings"
                className="rounded-2xl p-5 bg-gradient-to-br from-amber-500/15 to-transparent border border-amber-500/30 hover:border-amber-400/50 transition-colors"
              >
                <p className="text-sm font-semibold text-white mb-1">Subscription</p>
                <p className="text-xs text-zinc-400">
                  Connect more closely with viewers through subscriber perks.
                </p>
              </a>
              <a
                href="/upload"
                className="rounded-2xl p-5 bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <p className="text-sm font-semibold text-white mb-1">Work with Artists</p>
                <p className="text-xs text-zinc-400">Create posts with featured sounds and artists.</p>
              </a>
            </div>
            <div className="flex gap-3 mb-4">
              <span className="flex-1 rounded-full border border-zinc-800 bg-zinc-900/60 py-2.5 text-center text-xs text-zinc-300">
                🎁 Video Gifts
              </span>
              <span className="flex-1 rounded-full border border-zinc-800 bg-zinc-900/60 py-2.5 text-center text-xs text-zinc-300">
                ↗ Service+
              </span>
            </div>
            <a
              href="/earnings"
              className="block text-center text-sm font-semibold text-white rounded-2xl py-3.5 border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent hover:from-amber-500/20 hover:border-amber-400/60 transition-all"
            >
              More ways to get paid
            </a>
          </section>

          {/* More Tools */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">More Tools</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ToolCard icon={CheckIcon} label="Account Check" href="/settings" />
              <ToolCard icon={FlameIcon} label="Promote" href="/promote" />
              <ToolCard icon={StarIcon} label="Benefits" href="/earnings" />
              <ToolCard icon={MusicIcon} label="Reel for Artists" href="/artist/register" />
            </div>
          </section>

          {/* Inspiration */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Inspiration</h2>
            </div>
            <div className="flex gap-2 mb-4">
              {['posts', 'creators', 'searches'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInspirationTab(tab)}
                  className={`px-4 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    inspirationTab === tab
                      ? 'bg-amber-500 text-black'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {inspirationTab === 'posts' ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {trending.slice(0, 6).map((v, i) => (
                  <a
                    key={v.id}
                    href={`/profile/${v.user?.id}`}
                    className="relative aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800"
                  >
                    {v.thumbnailUrl && (
                      <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    )}
                    <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md bg-black/70 text-amber-400 text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="absolute bottom-1.5 left-1.5 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded-md">
                      ♥ {Number(v.likeCount)}
                    </span>
                  </a>
                ))}
                {trending.length === 0 && (
                  <p className="col-span-full text-sm text-zinc-400">Nothing trending yet.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Nothing here yet.</p>
            )}
          </section>

          {/* Video Performance */}
          <section id="video-performance">
            <h2 className="text-lg font-semibold text-white mb-4">Video Performance</h2>

            {data.videos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
                <p className="text-sm text-zinc-400 mb-4">Post a video to see its stats here.</p>
                <a
                  href="/upload"
                  className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-colors"
                >
                  + Upload Reel
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {data.videos.map((v) => {
                  const boosted = v.boostedUntil && new Date(v.boostedUntil) > new Date();
                  return (
                    <div
                      key={v.id}
                      className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3"
                    >
                      <div className="w-10 h-14 rounded-lg bg-zinc-800 overflow-hidden shrink-0">
                        {v.thumbnailUrl && (
                          <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{v.caption || 'Untitled'}</p>
                        <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                          {new Date(v.createdAt).toLocaleDateString()}
                          {v.status === 'processing' && ' · Processing'}
                          {boosted && ' · Boosted'}
                        </p>
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400 text-right shrink-0 space-y-0.5">
                        <p>{Number(v.viewCount)} views</p>
                        <p>{Number(v.likeCount)} likes</p>
                        <p>{Number(v.commentCount)} comments</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <a
            href="/promote"
            className="block text-center text-sm font-semibold px-6 py-3.5 rounded-2xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            Promote a video →
          </a>
        </>
      )}
    </main>
  );
}
