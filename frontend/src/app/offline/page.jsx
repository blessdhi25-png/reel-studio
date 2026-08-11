'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingScreen';
import {
  isOfflineSupported,
  getOfflineVideos,
  isDownloaded,
  downloadVideo,
  removeDownload,
  getPlaybackUrl,
} from '../../lib/offline';

export default function OfflineVideosPage() {
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState([]);
  const [downloaded, setDownloaded] = useState([]);
  const [progress, setProgress] = useState({}); // videoId -> 0..1 while downloading
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [error, setError] = useState(null);
  const supported = isOfflineSupported();

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    api
      .getBookmarks()
      .then(setBookmarks)
      .catch(() => {})
      .finally(() => setLoading(false));
    setDownloaded(getOfflineVideos());
  }, [router]);

  async function handleDownload(video) {
    setError(null);
    setProgress((p) => ({ ...p, [video.id]: 0 }));
    try {
      await downloadVideo(video, (frac) => setProgress((p) => ({ ...p, [video.id]: frac })));
      setDownloaded(getOfflineVideos());
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress((p) => {
        const next = { ...p };
        delete next[video.id];
        return next;
      });
    }
  }

  async function handleRemove(id) {
    await removeDownload(id);
    setDownloaded(getOfflineVideos());
    if (playingId === id) setPlayingId(null);
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto pb-20">
      <a href="/menu" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back to menu
      </a>

      <h1 className="font-display text-4xl text-bone tracking-wide mt-8 mb-2">Offline videos</h1>
      <p className="font-body text-smoke text-sm mb-8">
        Download your saved videos to watch without a connection. Videos stay in this browser —
        they're not exported as files.
      </p>

      {!supported && (
        <p className="font-body text-sm text-red-400 mb-6">
          This browser doesn't support offline storage, so downloads aren't available here.
        </p>
      )}
      {error && <p className="font-body text-sm text-red-400 mb-6">{error}</p>}

      {downloaded.length > 0 && (
        <Section title="Downloaded">
          {downloaded.map((v) => (
            <div key={v.id} className="py-3 border-b border-smoke/10">
              <div className="flex items-center gap-3">
                <Thumb video={v} />
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-bone truncate">{v.caption || 'Untitled'}</p>
                  <p className="font-mono text-[10px] text-smoke">
                    Saved {new Date(v.savedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => setPlayingId(playingId === v.id ? null : v.id)}
                  className="font-body text-xs font-semibold px-3 py-1.5 rounded-sprocket border border-reel/50 text-reel shrink-0"
                >
                  {playingId === v.id ? 'Close' : 'Play'}
                </button>
                <button
                  onClick={() => handleRemove(v.id)}
                  className="font-body text-xs px-2 py-1.5 rounded-sprocket text-smoke shrink-0"
                >
                  Remove
                </button>
              </div>
              {playingId === v.id && <OfflinePlayer videoId={v.id} />}
            </div>
          ))}
        </Section>
      )}

      <Section title="Saved videos">
        {loading && <LoadingSpinner label="Loading…" />}
        {!loading && bookmarks.length === 0 && (
          <p className="font-body text-smoke text-sm">
            Bookmark videos from the feed to download them for offline viewing.
          </p>
        )}
        {bookmarks.map((v) => {
          const already = isDownloaded(v.id);
          const pct = progress[v.id];
          return (
            <div key={v.id} className="flex items-center gap-3 py-3 border-b border-smoke/10">
              <Thumb video={v} />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm text-bone truncate">{v.caption || 'Untitled'}</p>
                {pct !== undefined && (
                  <div className="h-1 bg-ink2 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-reel transition-all"
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {already ? (
                <span className="font-mono text-[10px] uppercase tracking-widest text-smoke shrink-0">
                  Downloaded
                </span>
              ) : (
                <button
                  onClick={() => handleDownload(v)}
                  disabled={!supported || pct !== undefined}
                  className="font-body text-xs font-semibold px-3 py-1.5 rounded-sprocket border border-smoke/40 text-smoke shrink-0 disabled:opacity-50"
                >
                  {pct !== undefined ? `${Math.round(pct * 100)}%` : 'Download'}
                </button>
              )}
            </div>
          );
        })}
      </Section>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-smoke mb-2">{title}</p>
      <div>{children}</div>
    </div>
  );
}

function Thumb({ video }) {
  return (
    <div className="w-12 h-16 rounded-sprocket bg-ink2 overflow-hidden shrink-0">
      {video.thumbnailUrl && (
        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
      )}
    </div>
  );
}

function OfflinePlayer({ videoId }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let hls;
    let cancelled = false;

    getPlaybackUrl(videoId)
      .then((url) => {
        if (cancelled || !url) return;
        const el = videoRef.current;
        if (!el) return;
        if (el.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari can play HLS natively, including from a blob: URL.
          el.src = url;
        } else {
          import('hls.js').then(({ default: Hls }) => {
            if (cancelled) return;
            if (Hls.isSupported()) {
              hls = new Hls();
              hls.loadSource(url);
              hls.attachMedia(el);
            } else {
              el.src = url;
            }
          });
        }
        setReady(true);
      })
      .catch((err) => setError(err.message));

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [videoId]);

  return (
    <div className="mt-3 rounded-sprocket overflow-hidden bg-ink">
      {error && <p className="font-body text-xs text-red-400 p-3">{error}</p>}
      <video ref={videoRef} controls playsInline className="w-full max-h-96" />
      {!ready && !error && <p className="font-body text-xs text-smoke p-3">Loading from device…</p>}
    </div>
  );
}
