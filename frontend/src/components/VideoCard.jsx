'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../lib/api';
import CommentsPanel from './CommentsPanel';
import ReportModal from './ReportModal';
import ShareSheet from './ShareSheet';

// Whether the viewer has ever tapped a video (a real user gesture). Browsers
// block autoplay-with-sound until one happens, so every clip starts muted
// and this flips permanently true — and gets remembered — the first time
// someone taps to play/pause. There's no dedicated mute button: once this
// is true, sound just stays on for the rest of the session.
function getStoredAudioEnabled() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('feedAudioEnabled') === 'true';
}

function formatTimecode(seconds = 0) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const VideoCard = forwardRef(function VideoCard(
  { video, isActive, shouldLoad = true, focusMode = false, onToggleFollow, onActiveTimeUpdate },
  ref
) {
  const videoRef = useRef(null);
  const commentsRef = useRef(null);
  const [liked, setLiked] = useState(Boolean(video.isLiked));
  const [likeCount, setLikeCount] = useState(Number(video.likeCount || 0));
  const [commentCount, setCommentCount] = useState(Number(video.commentCount || 0));
  const [showTip, setShowTip] = useState(false);
  const [showTipUnavailable, setShowTipUnavailable] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [bookmarked, setBookmarked] = useState(Boolean(video.isBookmarked));
  const [bookmarkCount, setBookmarkCount] = useState(Number(video.bookmarkCount || 0));
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [isOwnVideo, setIsOwnVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // video.durationSeconds is only ever populated by the transcode worker's
  // completion callback (POST /:id/complete) — which, per the immediate-
  // publish upload flow (see backend/src/routes/videos.js), never runs in
  // this self-hosted setup. That left durationSeconds permanently null on
  // every video ever posted, which is why the on-screen duration badge was
  // stuck at "0:00" for every published clip, not just freshly uploaded
  // ones. Reading the real <video> element's own duration once its
  // metadata loads sidesteps the missing backend field entirely — this is
  // the actual duration of whatever's playing, regardless of whether a
  // transcode pipeline ever fills in durationSeconds.
  const [liveDuration, setLiveDuration] = useState(null);
  const following = Boolean(video.user?.isFollowing);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      const me = JSON.parse(stored);
      setIsOwnVideo(me.id === video.user?.id);
    }
  }, [video.user?.id]);

  useEffect(() => {
    setAudioEnabled(getStoredAudioEnabled());
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video.videoUrl) return;

    // Previously every VideoCard set a real src the moment it mounted,
    // regardless of isActive — meaning every video in the feed (the whole
    // fetched batch, and now every page appended by infinite scroll) would
    // start downloading/buffering at once. shouldLoad restricts a real src
    // to a small window around the active card (see page.jsx, which passes
    // true only for |i - activeIndex| <= 1); everything else gets its src
    // cleared and, for HLS, its instance destroyed so decoded buffers don't
    // pile up as the feed grows.
    if (!shouldLoad) {
      el.removeAttribute('src');
      el.load();
      return;
    }

    let hls;
    if (video.videoUrl.endsWith('.m3u8') && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(video.videoUrl);
          hls.attachMedia(el);
        }
      });
    } else {
      el.src = video.videoUrl;
    }

    return () => hls?.destroy();
  }, [video.videoUrl, shouldLoad]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (isActive) {
      setPaused(false);
      el.play().catch(() => {});
      api.logView(video.id).catch(() => {});
      api.logEvent(video.id, 'impression').catch(() => {});

      const watchStart = Date.now();
      const onEnded = () => {
        api.logEvent(video.id, 'watch_complete', Date.now() - watchStart).catch(() => {});
      };
      el.addEventListener('ended', onEnded);

      return () => {
        el.removeEventListener('ended', onEnded);
        el.pause();

        // If they scrolled away well before the clip finished, count it as a skip —
        // this is what the ranking worker penalizes. Falls back to the live-read
        // duration (see liveDuration above) since video.durationSeconds is null
        // for every video published through the immediate-publish upload path.
        const elapsed = Date.now() - watchStart;
        const duration = (video.durationSeconds || liveDuration || 0) * 1000;
        if (duration > 0 && elapsed < duration * 0.5) {
          api.logEvent(video.id, 'skip', elapsed).catch(() => {});
        }
      };
    } else {
      el.pause();
    }
  }, [isActive, video.id, video.durationSeconds, liveDuration]);

  // Drives timestamp-comment highlighting (locally, for the mobile overlay
  // panel below) and reports the active card's position up to the page so
  // the desktop rail's comments panel can highlight in sync too.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTimeUpdate = () => {
      setCurrentTime(el.currentTime);
      if (isActive) onActiveTimeUpdate?.(el.currentTime);
    };
    el.addEventListener('timeupdate', onTimeUpdate);
    return () => el.removeEventListener('timeupdate', onTimeUpdate);
  }, [isActive, onActiveTimeUpdate]);

  // Jumps playback to an exact second — used by clickable timestamp comments
  // ("video chapters"). Exposed on the ref so the desktop rail (which
  // renders its own copy of the comments list, outside this component) can
  // drive this card's player too.
  function seekTo(seconds) {
    const el = videoRef.current;
    if (!el || !Number.isFinite(seconds)) return;
    el.currentTime = seconds;
    setCurrentTime(seconds);
    if (el.paused) {
      el.play().catch(() => {});
      setPaused(false);
    }
  }

  function togglePlayPause() {
    const el = videoRef.current;
    if (!el) return;

    // The tap that resolves this is itself the user gesture that lets us
    // turn sound on going forward — no separate mute control needed.
    if (!audioEnabled) {
      setAudioEnabled(true);
      window.localStorage.setItem('feedAudioEnabled', 'true');
    }

    if (el.paused) {
      el.play().catch(() => {});
      setPaused(false);
    } else {
      el.pause();
      setPaused(true);
    }
  }

  async function toggleLike() {
    setLiked((prev) => !prev);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
    try {
      liked ? await api.unlikeVideo(video.id) : await api.likeVideo(video.id);
    } catch {
      // revert on failure
      setLiked((prev) => !prev);
      setLikeCount((c) => (liked ? c + 1 : c - 1));
    }
  }

  function handleFollow(e) {
    e.stopPropagation();
    if (!video.user?.id) return;
    onToggleFollow?.(video.user.id);
  }

  async function toggleBookmark() {
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    setBookmarked((prev) => !prev);
    setBookmarkCount((c) => (bookmarked ? c - 1 : c + 1));
    try {
      bookmarked ? await api.unbookmarkVideo(video.id) : await api.bookmarkVideo(video.id);
    } catch {
      // revert on failure
      setBookmarked((prev) => !prev);
      setBookmarkCount((c) => (bookmarked ? c + 1 : c - 1));
    }
  }

  // Opens the mobile comments sheet and focuses its input — used by the 'C'
  // keyboard shortcut. On desktop the rail's own comments are already
  // visible, so the page-level keyboard controller calls the rail directly
  // instead of this.
  function openCommentsAndFocus() {
    setShowComments(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => commentsRef.current?.focusInput());
    });
  }

  // Exposes the actions the keyboard controller in page.jsx needs to drive,
  // since it doesn't own this card's local state directly.
  useImperativeHandle(ref, () => ({
    toggleLike,
    togglePlayPause,
    openComments: openCommentsAndFocus,
    seekTo,
  }));

  return (
    <div className="relative h-full w-full flex items-center justify-center bg-ink">
      <video
        ref={videoRef}
        loop
        playsInline
        muted={!audioEnabled}
        onClick={togglePlayPause}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          // Some browsers report Infinity for a duration that isn't fully
          // known yet (e.g. certain streamed responses mid-load) — only
          // trust it once it's an actual finite number.
          if (Number.isFinite(d)) setLiveDuration(d);
        }}
        className="h-full w-full max-w-md object-cover mx-auto cursor-pointer"
        poster={video.thumbnailUrl}
      />

      {/* Explicit mute toggle — audioEnabled previously only ever turned on
          implicitly via the first tap-to-play (see togglePlayPause) with no
          visible control and no way to mute again afterward. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAudioEnabled((prev) => {
            const next = !prev;
            window.localStorage.setItem('feedAudioEnabled', String(next));
            return next;
          });
        }}
        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-ink/50 flex items-center justify-center text-bone"
        aria-label={audioEnabled ? 'Mute' : 'Unmute'}
      >
        {audioEnabled ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </button>

      {/* Paused indicator — appears when the viewer taps the video to pause it */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-16 h-16 rounded-full bg-ink/50 flex items-center justify-center text-bone text-3xl">
            ▶
          </span>
        </div>
      )}

      {/* Tap-for-sound hint — shown until the viewer's first tap enables
          audio for the rest of the session. Not a control itself (tapping
          anywhere on the video already does this via togglePlayPause). */}
      {!audioEnabled && (
        <div
          className="absolute right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink/60 text-bone font-mono text-[10px] uppercase tracking-widest pointer-events-none z-10"
          style={{ top: 'calc(env(safe-area-inset-top) + 5rem)' }}
        >
          🔇 Tap for sound
        </div>
      )}

      {/* Everything below is "chrome" that focus mode (F) hides so the video is unobstructed */}
      <div
        className={`transition-opacity duration-200 ${
          focusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        {/* Type badge — reads like a film-can label */}
        <div
          className="absolute left-10 font-mono text-xs tracking-widest text-reel border border-reel/50 px-2 py-1 rounded-sprocket uppercase"
          style={{ top: 'calc(env(safe-area-inset-top) + 5rem)' }}
        >
          {video.videoType === 'long' ? 'Feature' : 'Short'} · {formatTimecode(video.durationSeconds || liveDuration)}
        </div>

        {/* Caption + creator — bottom-24 clears the fixed bottom nav on mobile */}
        <div className="absolute bottom-24 left-10 right-24 text-bone">
          <a href={`/profile/${video.user?.id}`} className="font-display text-2xl tracking-wide">
            @{video.user?.username}
          </a>
          <p className="font-body text-sm text-smoke mt-1">{video.caption}</p>
        </div>

        {/* Engagement rail — bottom-24 clears the fixed bottom nav on mobile */}
        <div className="absolute bottom-24 right-6 flex flex-col items-center gap-5">
          {!isOwnVideo && (
            <a href={`/profile/${video.user?.id}`} className="relative block w-11 h-11 mb-1">
              <span className="block w-11 h-11 rounded-full overflow-hidden border-2 border-bone bg-ink2">
                {video.user?.avatarUrl ? (
                  <img src={video.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center font-display text-bone text-lg">
                    {video.user?.username?.[0]?.toUpperCase()}
                  </span>
                )}
              </span>
              {!following && (
                <button
                  onClick={handleFollow}
                  aria-label="Follow"
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-reel text-ink flex items-center justify-center text-xs font-bold border-2 border-ink"
                >
                  +
                </button>
              )}
            </a>
          )}
          <button onClick={toggleLike} className="flex flex-col items-center gap-1">
            <span className={`text-2xl ${liked ? 'text-reel' : 'text-bone'}`}>♥</span>
            <span className="font-mono text-xs text-smoke">{likeCount}</span>
          </button>
          <button
            onClick={() => {
              // On desktop the comments are already visible in the persistent
              // rail — no need to also pop the mobile sheet over the video.
              if (window.innerWidth < 768) setShowComments(true);
            }}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-2xl text-bone">💬</span>
            <span className="font-mono text-xs text-smoke">{commentCount}</span>
          </button>
          <button onClick={toggleBookmark} className="flex flex-col items-center gap-1">
            <span className={`text-2xl ${bookmarked ? 'text-reel' : 'text-bone'}`}>🔖</span>
            <span className="font-mono text-xs text-smoke">{bookmarkCount}</span>
          </button>
          {video.user?.stripeOnboarded ? (
            <button onClick={() => setShowTip(true)} className="flex flex-col items-center gap-1">
              <span className="text-2xl text-reel">$</span>
              <span className="font-mono text-xs text-smoke">Tip</span>
            </button>
          ) : (
            <button
              onClick={() => setShowTipUnavailable(true)}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-2xl text-smoke/40">$</span>
              <span className="font-mono text-xs text-smoke/40">Tip</span>
            </button>
          )}
          <button onClick={() => setShowReport(true)} className="flex flex-col items-center gap-1">
            <span className="text-lg text-smoke/60">⚑</span>
          </button>
          <button
            onClick={() => {
              api.logEvent(video.id, 'share').catch(() => {});
              setShowShare(true);
            }}
            className="flex flex-col items-center gap-1"
          >
            <span className="text-2xl text-bone">↗</span>
            <span className="font-mono text-xs text-smoke">Share</span>
          </button>
        </div>
      </div>

      {showTip && <TipModal videoId={video.id} onClose={() => setShowTip(false)} />}
      {showTipUnavailable && (
        <TipUnavailableModal onClose={() => setShowTipUnavailable(false)} />
      )}
      {showComments && (
        // md:hidden — on desktop the persistent rail already shows comments,
        // so this mobile sheet stays out of the DOM's visible flow there
        // rather than risking a second copy covering the video.
        <div className="md:hidden">
          <CommentsPanel
            ref={commentsRef}
            videoId={video.id}
            onClose={() => setShowComments(false)}
            onCountChange={(updater) => setCommentCount(updater)}
            currentTime={currentTime}
            onSeek={seekTo}
          />
        </div>
      )}
      {showReport && (
        <ReportModal targetType="video" targetId={video.id} onClose={() => setShowReport(false)} />
      )}
      {showShare && (
        <ShareSheet
          video={video}
          onClose={() => setShowShare(false)}
          onReport={() => setShowReport(true)}
        />
      )}
    </div>
  );
});

export default VideoCard;

function TipUnavailableModal({ onClose }) {
  return (
    <div className="absolute inset-0 bg-ink/90 flex items-center justify-center z-30">
      <div className="bg-ink2 rounded-sprocket p-6 w-72 border border-smoke/20 text-center">
        <p className="font-display text-xl text-bone mb-2 tracking-wide">Tips not open yet</p>
        <p className="font-body text-sm text-smoke mb-5">
          This creator hasn't set up their payout account, so tips are turned off for now.
        </p>
        <button
          onClick={onClose}
          className="w-full bg-reel text-ink font-body font-semibold py-2 rounded-sprocket"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function TipModal({ videoId, onClose }) {
  const [amount, setAmount] = useState(200);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  async function sendTip() {
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { url } = await api.tipVideoCheckout(videoId, amount);
      window.location.href = url; // hand off to Stripe-hosted checkout
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-ink/90 flex items-center justify-center z-30">
      <div className="bg-ink2 rounded-sprocket p-6 w-72 border border-reel/30">
        <p className="font-display text-xl text-bone mb-4 tracking-wide">Send a tip</p>
        <div className="flex gap-2 mb-4">
          {[100, 200, 500].map((cents) => (
            <button
              key={cents}
              onClick={() => setAmount(cents)}
              className={`flex-1 py-2 font-mono text-sm rounded-sprocket border ${
                amount === cents ? 'border-reel text-reel' : 'border-smoke/40 text-smoke'
              }`}
            >
              ${(cents / 100).toFixed(2)}
            </button>
          ))}
        </div>
        {error && <p className="font-body text-xs text-red-400 mb-3">{error}</p>}
        <button
          onClick={sendTip}
          disabled={sending}
          className="w-full bg-reel text-ink font-body font-semibold py-2 rounded-sprocket disabled:opacity-50"
        >
          {sending ? 'Redirecting to checkout…' : 'Continue to payment'}
        </button>
        <button onClick={onClose} className="w-full mt-3 text-smoke text-sm font-body">
          Close
        </button>
      </div>
    </div>
  );
}
