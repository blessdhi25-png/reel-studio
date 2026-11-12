'use client';

import BackButton from '@/components/BackButton';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Logo from '@/components/Logo';
import { LoadingSpinner } from '@/components/LoadingScreen';

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

const num = (n) => Number(n ?? 0) || 0;
const fmt = (n) => num(n).toLocaleString();

function KpiCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </span>
        {/* Lifetime totals only — the API has no historical snapshot yet, so no fake delta badge. */}
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">All time</span>
      </div>
      <p className="text-3xl font-extrabold text-black dark:text-white tabular-nums">{value}</p>
      <p className="text-xs font-bold text-slate-600 dark:text-zinc-400 mt-1">{label}</p>
    </div>
  );
}

function ToolCard({ icon: Icon, label, href }) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 px-4 py-3.5 hover:border-amber-500/60 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-colors"
    >
      <span className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <span className="text-sm font-bold text-black dark:text-white">{label}</span>
    </a>
  );
}

const H2 = 'text-lg font-extrabold tracking-tight text-black dark:text-white';

export default function StudioPage() {
  const router = useRouter();
  const { user, token, ready } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trending, setTrending] = useState([]);
  const [inspirationTab, setInspirationTab] = useState('posts');

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      router.push('/login');
      return;
    }
    let cancelled = false;
    api
      .getStudioOverview()
      .then((d) => !cancelled && setData(d ?? {}))
      .catch((err) => !cancelled && setError(err?.message || "Couldn't load Studio."))
      .finally(() => !cancelled && setLoading(false));
    api
      .getTrending()
      .then((t) => !cancelled && setTrending(Array.isArray(t) ? t : []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, token, router]);

  // Session still resolving, or signed out and about to be redirected.
  if (!ready || !user) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white flex items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }

  // Safe defaults — a partial or empty response never throws.
  const posts = Array.isArray(data?.videos) ? data.videos : [];
  const totalViews = num(data?.totals?.views);
  const followerCount = num(data?.totals?.followerCount);
  const totalLikes = num(data?.totals?.likes);
  const trendingPosts = Array.isArray(trending) ? trending.slice(0, 6) : [];

  return (
    <main className="bg-white dark:bg-zinc-950 text-black dark:text-white min-h-screen p-6 pb-36 max-w-6xl mx-auto space-y-8">
      <BackButton href="/menu" label="Back to menu" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Logo size="md" showText />
        <div className="flex gap-3">
          <a
            href="/live"
            className="text-sm font-extrabold px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-black dark:text-white hover:border-amber-500 transition-colors"
          >
            ● Go Live
          </a>
          <a
            href="/upload"
            className="text-sm font-extrabold px-4 py-2 rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-colors"
          >
            + Upload Reel
          </a>
        </div>
      </div>

      {loading && <LoadingSpinner label="Loading…" />}
      {error && (
        <p className="text-sm font-bold text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className={H2}>Analytics</h2>
              <a href="/analytics" className="text-xs font-extrabold text-amber-600 dark:text-amber-400 hover:underline">
                Full analytics ›
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard icon={EyeIcon} label="Post views" value={fmt(totalViews)} />
              <KpiCard icon={UsersIcon} label="Followers" value={fmt(followerCount)} />
              <KpiCard icon={HeartIcon} label="Likes" value={fmt(totalLikes)} />
            </div>
          </section>

          <section>
            <h2 className={`${H2} mb-4`}>Monetisation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <a href="/earnings" className="rounded-2xl p-5 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 hover:border-amber-500 transition-colors">
                <p className="text-sm font-extrabold text-black dark:text-white mb-1">Subscription</p>
                <p className="text-xs font-medium text-slate-600 dark:text-zinc-400">Connect more closely with viewers through subscriber perks.</p>
              </a>
              <a href="/upload" className="rounded-2xl p-5 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-700 transition-colors">
                <p className="text-sm font-extrabold text-black dark:text-white mb-1">Work with Artists</p>
                <p className="text-xs font-medium text-slate-600 dark:text-zinc-400">Create posts with featured sounds and artists.</p>
              </a>
            </div>
            <div className="flex gap-3 mb-4">
              <span className="flex-1 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 py-2.5 text-center text-xs font-bold text-slate-700 dark:text-zinc-300">🎁 Video Gifts</span>
              <span className="flex-1 rounded-full border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 py-2.5 text-center text-xs font-bold text-slate-700 dark:text-zinc-300">↗ Service+</span>
            </div>
            <a href="/earnings" className="block text-center text-sm font-extrabold text-black dark:text-white rounded-2xl py-3.5 border border-amber-400 dark:border-amber-500/40 bg-amber-50 dark:bg-transparent hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-all">
              More ways to get paid
            </a>
          </section>

          <section>
            <h2 className={`${H2} mb-4`}>More Tools</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ToolCard icon={CheckIcon} label="Account Check" href="/settings" />
              <ToolCard icon={FlameIcon} label="Promote" href="/promote" />
              <ToolCard icon={StarIcon} label="Benefits" href="/earnings" />
              <ToolCard icon={MusicIcon} label="Reel for Artists" href="/artist/register" />
            </div>
          </section>

          <section>
            <h2 className={`${H2} mb-4`}>Inspiration</h2>
            <div className="flex gap-2 mb-4">
              {['posts', 'creators', 'searches'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setInspirationTab(tab)}
                  className={`px-4 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    inspirationTab === tab
                      ? 'bg-amber-500 text-black'
                      : 'bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {inspirationTab === 'posts' ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {trendingPosts.map((v, i) => (
                  <a
                    key={v?.id ?? i}
                    href={v?.user?.id ? `/profile/${v.user.id}` : '#'}
                    className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800"
                  >
                    {v?.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                    <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md bg-black/70 text-amber-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded-md">♥ {num(v?.likeCount)}</span>
                  </a>
                ))}
                {trendingPosts.length === 0 && (
                  <p className="col-span-full text-sm font-medium text-slate-500 dark:text-zinc-400">Nothing trending yet.</p>
                )}
              </div>
            ) : (
              <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">Nothing here yet.</p>
            )}
          </section>

          <section id="video-performance">
            <h2 className={`${H2} mb-4`}>Video Performance</h2>
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-800 p-10 text-center">
                <p className="text-sm font-bold text-slate-600 dark:text-zinc-400 mb-4">Post a video to see its stats here.</p>
                <a href="/upload" className="inline-block text-sm font-extrabold px-5 py-2.5 rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-colors">
                  + Upload Reel
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                {posts.map((v) => {
                  const boosted = v?.boostedUntil && new Date(v.boostedUntil) > new Date();
                  const created = v?.createdAt ? new Date(v.createdAt).toLocaleDateString() : '';
                  return (
                    <div key={v.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/40 p-3">
                      <div className="w-10 h-14 rounded-lg bg-slate-200 dark:bg-zinc-800 overflow-hidden shrink-0">
                        {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-black dark:text-white truncate">{v.caption || 'Untitled'}</p>
                        <p className="font-mono text-[10px] font-semibold text-slate-500 dark:text-zinc-500 mt-0.5">
                          {created}
                          {v.status === 'processing' && ' · Processing'}
                          {boosted && ' · Boosted'}
                        </p>
                      </div>
                      <div className="font-mono text-[10px] font-bold text-slate-600 dark:text-zinc-400 text-right shrink-0 space-y-0.5">
                        <p>{num(v.viewCount)} views</p>
                        <p>{num(v.likeCount)} likes</p>
                        <p>{num(v.commentCount)} comments</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <a href="/promote" className="block text-center text-sm font-extrabold px-6 py-3.5 rounded-2xl border border-amber-400 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
            Promote a video →
          </a>
        </>
      )}
    </main>
  );
}
