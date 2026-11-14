'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Film } from 'lucide-react';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingScreen';

// Light surface on mobile, crisp dark shell on desktop (lg:). The desktop sidebar padding comes
// from AppShell, so it isn't repeated here.
export default function PromotePage() {
  const router = useRouter();
  const [videos, setVideos] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  const [justBoosted, setJustBoosted] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    setJustBoosted(new URLSearchParams(window.location.search).get('boosted') === '1');
    Promise.all([api.getStudioOverview(), api.getBoostTiers()])
      .then(([overview, boostTiers]) => {
        setVideos(overview.videos.filter((v) => v.status === 'published'));
        setTiers(boostTiers);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <main className="bg-neutral-50 text-neutral-900 min-h-screen pb-28 lg:bg-black lg:text-white">
      <header className="sticky top-0 z-20 bg-neutral-50/90 backdrop-blur border-b border-neutral-200/80 lg:bg-black/80 lg:border-neutral-800">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <Link
            href="/menu"
            aria-label="Back to menu"
            className="w-10 h-10 shrink-0 rounded-full bg-neutral-200/70 hover:bg-neutral-200 flex items-center justify-center transition lg:bg-neutral-800 lg:hover:bg-neutral-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-extrabold text-xl tracking-tight leading-tight">Promote a Video</h1>
            <p className="text-xs font-medium text-neutral-500 truncate">
              Select a clip to boost its reach in the For You feed
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {justBoosted && (
          <p className="text-sm font-semibold text-amber-700 bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 mb-4 lg:text-amber-400">
            Payment received — your boost will kick in within a minute once it's confirmed.
          </p>
        )}

        {loading && <LoadingSpinner label="Loading…" />}
        {error && <p className="text-sm font-semibold text-red-600 mb-4">{error}</p>}
        {!loading && !error && videos.length === 0 && (
          <p className="text-sm font-medium text-neutral-500">
            You need a published video before you can promote one.
          </p>
        )}

        <div className="space-y-3">
          {videos.map((v) => {
            const boosted = v.boostedUntil && new Date(v.boostedUntil) > new Date();
            return (
              <div key={v.id}>
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between gap-3.5 lg:bg-neutral-900 lg:border-neutral-800">
                  <Thumb video={v} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-neutral-900 line-clamp-1 lg:text-white">
                      {v.caption || 'Untitled Clip'}
                    </p>
                    <p className="font-semibold text-xs text-neutral-500 mt-0.5">
                      {Number(v.viewCount || 0).toLocaleString()} views
                    </p>
                    {boosted && (
                      <p className="font-semibold text-xs text-amber-600 mt-0.5">
                        Boosted until{' '}
                        {new Date(v.boostedUntil).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveVideo(activeVideo === v.id ? null : v.id)}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs px-4 py-2 rounded-full shadow-sm transition active:scale-95 shrink-0"
                  >
                    {boosted ? 'Extend' : 'Boost'}
                  </button>
                </div>

                {activeVideo === v.id && (
                  <BoostPicker videoId={v.id} tiers={tiers} onClose={() => setActiveVideo(null)} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

// Poster image -> first video frame -> Film icon, so a thumbnail is never a blank black box.
function Thumb({ video }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const isHls = /\.m3u8(\?|#|$)/i.test(video.videoUrl || '');

  let content;
  if (video.thumbnailUrl && !imgFailed) {
    content = (
      <img
        src={video.thumbnailUrl}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  } else if (video.videoUrl && !isHls && !videoFailed) {
    content = (
      <video
        src={`${video.videoUrl}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        className="w-full h-full object-cover"
        onError={() => setVideoFailed(true)}
      />
    );
  } else {
    content = (
      <div className="w-full h-full flex items-center justify-center text-neutral-500">
        <Film className="w-6 h-6" />
      </div>
    );
  }

  return <div className="w-14 h-20 rounded-xl overflow-hidden bg-neutral-900 shrink-0 relative">{content}</div>;
}

function BoostPicker({ videoId, tiers, onClose }) {
  const [tier, setTier] = useState(tiers[1]?.id || tiers[0]?.id);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function checkout() {
    setSending(true);
    setError(null);
    try {
      const { url } = await api.boostVideoCheckout(videoId, tier);
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  }

  return (
    <div className="mt-2 rounded-2xl border border-amber-500/40 bg-white p-4 shadow-sm lg:bg-neutral-900">
      <div className="flex gap-2 mb-4">
        {tiers.map((t) => (
          <button
            key={t.id}
            onClick={() => setTier(t.id)}
            aria-pressed={tier === t.id}
            className={`flex-1 py-2.5 text-xs rounded-xl border transition ${
              tier === t.id
                ? 'bg-amber-500/15 text-amber-700 border-amber-500 font-bold lg:text-amber-400'
                : 'bg-neutral-100 text-neutral-700 border-transparent font-semibold hover:bg-neutral-200/70 lg:bg-neutral-800 lg:text-neutral-300'
            }`}
          >
            {t.label}
            <br />${(t.amountCents / 100).toFixed(2)}
          </button>
        ))}
      </div>
      {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
      <button
        onClick={checkout}
        disabled={sending || !tier}
        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-sm shadow-sm transition disabled:opacity-50"
      >
        {sending ? 'Redirecting to checkout…' : 'Continue to payment'}
      </button>
      <button onClick={onClose} className="w-full mt-2 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-800 lg:hover:text-white transition">
        Cancel
      </button>
    </div>
  );
}
