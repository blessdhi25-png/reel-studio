'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

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
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto pb-20">
      <a href="/menu" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back to menu
      </a>

      <h1 className="font-display text-4xl text-bone tracking-wide mt-8 mb-2">Promote</h1>
      <p className="font-body text-smoke text-sm mb-8">
        Pay to give a video a temporary boost in the feed ranking.
      </p>

      {justBoosted && (
        <p className="font-body text-sm text-reel mb-6">
          Payment received — your boost will kick in within a minute once it's confirmed.
        </p>
      )}

      {loading && <p className="font-body text-smoke text-sm">Loading…</p>}
      {error && <p className="font-body text-sm text-red-400">{error}</p>}
      {!loading && videos.length === 0 && (
        <p className="font-body text-smoke text-sm">
          You need a published video before you can promote one.
        </p>
      )}

      <div className="space-y-1">
        {videos.map((v) => {
          const boosted = v.boostedUntil && new Date(v.boostedUntil) > new Date();
          return (
            <div key={v.id} className="py-3 border-b border-smoke/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-14 rounded-sprocket bg-ink2 overflow-hidden shrink-0">
                  {v.thumbnailUrl && (
                    <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-bone truncate">{v.caption || 'Untitled'}</p>
                  <p className="font-mono text-[10px] text-smoke">
                    {Number(v.viewCount)} views
                    {boosted && (
                      <span className="text-reel">
                        {' '}
                        · Boosted until{' '}
                        {new Date(v.boostedUntil).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setActiveVideo(activeVideo === v.id ? null : v.id)}
                  className="font-body text-xs font-semibold px-3 py-1.5 rounded-sprocket border border-reel/50 text-reel shrink-0"
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
    </main>
  );
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
    <div className="mt-3 rounded-sprocket border border-reel/30 bg-ink2 p-4">
      <div className="flex gap-2 mb-4">
        {tiers.map((t) => (
          <button
            key={t.id}
            onClick={() => setTier(t.id)}
            className={`flex-1 py-2 font-mono text-xs rounded-sprocket border ${
              tier === t.id ? 'border-reel text-reel' : 'border-smoke/40 text-smoke'
            }`}
          >
            {t.label}
            <br />${(t.amountCents / 100).toFixed(2)}
          </button>
        ))}
      </div>
      {error && <p className="font-body text-xs text-red-400 mb-3">{error}</p>}
      <button
        onClick={checkout}
        disabled={sending || !tier}
        className="w-full bg-reel text-ink font-body font-semibold py-2 rounded-sprocket disabled:opacity-50"
      >
        {sending ? 'Redirecting to checkout…' : 'Continue to payment'}
      </button>
      <button onClick={onClose} className="w-full mt-2 text-smoke text-sm font-body">
        Cancel
      </button>
    </div>
  );
}
