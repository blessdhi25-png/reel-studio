'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { api } from '@/lib/api';
import CommentsPanel from '@/components/CommentsPanel';
import ReportModal from '@/components/ReportModal';
import ShareSheet from '@/components/ShareSheet';
import SoundPicker from '@/components/SoundPicker';
import SaveToCollectionModal from '@/components/SaveToCollectionModal';
import { useOptimisticLike } from '@/hooks/useOptimisticLike';
import { useAutoPlayOnScroll } from '@/hooks/useAutoPlayOnScroll';
import { useToast } from '@/context/ToastContext';

// A second tap/click arriving within this window counts as a double-tap
// (like) rather than two separate single-taps (play/pause). 300ms matches
// the double-tap window most touch UIs already train people to expect.
const DOUBLE_TAP_MS = 300;

// High-contrast engagement-rail icons — deliberately plain white/red fills
// rather than the app's softer `bone` text token, since these sit directly
// over arbitrary (often bright) video content and need to stay legible no
// matter what's playing underneath, the same way TikTok/Reels overlays do.
function HeartIcon({ filled, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? '#ef4444' : 'white'} stroke="none">
      <path d="M12 21s-6.7-4.35-9.33-8.2C.9 10.1 1.4 6.6 4.2 4.9c2.3-1.4 5-.7 6.6 1.2l1.2 1.4 1.2-1.4c1.6-1.9 4.3-2.6 6.6-1.2 2.8 1.7 3.3 5.2 1.53 7.9C18.7 16.65 12 21 12 21z" />
    </svg>
  );
}

function CommentIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="white" stroke="none">
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

function BookmarkIcon({ filled, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? '#ef4444' : 'white'} stroke="none">
      <path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4.5L5 22V3a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function TipIcon({ muted, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={muted ? 'rgba(255,255,255,0.4)' : 'white'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.4c0 1.5 1.3 2 3 2.4 1.7.4 3 1 3 2.4 0 1.4-1.3 2.4-3 2.4s-3-1-3-2.4" />
    </svg>
  );
}

function MoreDotsIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="white" stroke="none">
      <circle cx="5" cy="12" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="12" r="2.2" />
    </svg>
  );
}

function MusicNoteIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

function ShareIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <path d="M16 6l-4-4-4 4" /><path d="M12 2v14" />
    </svg>
  );
}

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
  { video, isActive, shouldLoad = true, focusMode = false, onToggleFollow, onActiveTimeUpdate, onDeleted },
  ref
) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const commentsRef = useRef(null);
  const menuRef = useRef(null);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef(null);
  const toast = useToast();
  const { liked, likeCount, toggleLike } = useOptimisticLike(video.id, video.isLiked, video.likeCount);
  const [commentCount, setCommentCount] = useState(Number(video.commentCount || 0));
  const [showTip, setShowTip] = useState(false);
  const [showTipUnavailable, setShowTipUnavailable] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bookmarked, setBookmarked] = useState(Boolean(video.isBookmarked));
  const [bookmarkCount, setBookmarkCount] = useState(Number(video.bookmarkCount || 0));
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [isOwnVideo, setIsOwnVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // Tracks whether this card's own media is still buffering (fresh load,
  // network stall, HLS still initializing) so a loading indicator can sit
  // over the poster instead of a video that just looks frozen. Starts true
  // — nothing has proven itself ready to play yet.
  const [buffering, setBuffering] = useState(true);
  // Bumped (not just toggled) on every double-tap so a second double-tap
  // mid-animation restarts the pop cleanly via a fresh `key` rather than
  // fighting the still-running CSS animation from the first one.
  const [heartPopId, setHeartPopId] = useState(0);
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

  // Drives actual play()/pause() off real on-screen visibility (see the
  // hook for why 60% specifically) instead of the parent's discretized
  // activeIndex — enabled only once shouldLoad has given this card a real
  // src to play, so an off-screen, unloaded card's observer never tries to
  // play a video with nothing loaded into it.
  const inView = useAutoPlayOnScroll(containerRef, videoRef, { threshold: 0.6, enabled: shouldLoad });

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

  // A fresh src (new video, or shouldLoad just turned on for this card) is
  // presumed to need buffering again — cleared once onCanPlay/onPlaying/
  // onLoadedData fires below.
  useEffect(() => {
    setBuffering(true);
  }, [video.videoUrl, shouldLoad]);

  // Actual play()/pause() calls live inside useAutoPlayOnScroll now — this
  // effect only handles the side effects of a card becoming genuinely
  // visible: resetting the paused-icon, view/impression logging, and
  // watch-time tracking for the ranking worker's skip signal.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !inView) return;

    setPaused(false);
    api.logView(video.id).catch(() => {});
    api.logEvent(video.id, 'impression').catch(() => {});

    const watchStart = Date.now();
    const onEnded = () => {
      api.logEvent(video.id, 'watch_complete', Date.now() - watchStart).catch(() => {});
    };
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('ended', onEnded);

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
  }, [inView, video.id, video.durationSeconds, liveDuration]);

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

  // Double-tap-to-like: always *likes*, never toggles off — matches the
  // Instagram/TikTok convention where tapping an already-liked video twice
  // just re-plays the heart animation rather than unliking it.
  function likeWithHeartPop() {
    if (!liked) toggleLike();
    setHeartPopId((id) => id + 1);
  }

  // A single handler covers both mouse double-click (desktop) and touch
  // double-tap (mobile) — touch taps already fire regular `click` events,
  // so timing between two clicks is all that's needed to tell one gesture
  // from two, without separate touch-event plumbing. A lone tap is held
  // for DOUBLE_TAP_MS before actually toggling play/pause, in case a
  // second tap is about to arrive and turn it into a like instead.
  function handleVideoTap() {
    const now = Date.now();
    const sinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    if (sinceLastTap > 0 && sinceLastTap < DOUBLE_TAP_MS) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      likeWithHeartPop();
    } else {
      singleTapTimerRef.current = setTimeout(() => {
        togglePlayPause();
        singleTapTimerRef.current = null;
      }, DOUBLE_TAP_MS);
    }
  }

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    };
  }, []);

  // Close the ⋯ menu on an outside click, matching the same pattern used
  // for the profile page's ⋯ dropdown.
  useEffect(() => {
    if (!showMenu) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showMenu]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.deleteVideo(video.id);
      setShowDeleteConfirm(false);
      toast.success('Post deleted');
      // The feed array itself lives in the parent (page.jsx) — this just
      // reports success up so the parent can drop it from state
      // immediately, the same way handleToggleFollow reports follow
      // changes up rather than owning follow state locally.
      onDeleted?.(video.id);
    } catch (err) {
      setDeleting(false);
      toast.error(err.message || "Couldn't delete this post — try again.");
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
    <div ref={containerRef} className="relative h-full w-full flex items-center justify-center bg-ink">
      <video
        ref={videoRef}
        loop
        playsInline
        muted={!audioEnabled}
        onClick={handleVideoTap}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedData={() => setBuffering(false)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          // Some browsers report Infinity for a duration that isn't fully
          // known yet (e.g. certain streamed responses mid-load) — only
          // trust it once it's an actual finite number.
          if (Number.isFinite(d)) setLiveDuration(d);
        }}
        className="h-full w-full max-w-md object-cover mx-auto cursor-pointer touch-manipulation"
        poster={video.thumbnailUrl}
      />

      {/* Buffering indicator — only for a card that's actually trying to
          load (shouldLoad); far-off cards with no src deliberately show
          nothing here rather than a permanent, misleading spinner. */}
      {shouldLoad && buffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
          <div className="w-10 h-10 rounded-full border-2 border-bone/25 border-t-bone animate-spin" />
        </div>
      )}

      {/* Double-tap-to-like heart — key={heartPopId} forces a fresh mount
          (and so a fresh animation run) on every double-tap, even ones
          that land mid-animation. */}
      {heartPopId > 0 && (
        <div
          key={heartPopId}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          onAnimationEnd={() => setHeartPopId(0)}
        >
          <span className="text-8xl text-reel drop-shadow-lg animate-heart-pop">♥</span>
        </div>
      )}

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

          {/* Sound ticker — only renders once video.track is actually
              populated. Today's feed endpoint doesn't include the track
              relation on each video (see backend/src/routes/videos.js /
              artists.js's Track model), so this stays hidden until that
              route's Prisma query adds `include: { track: { include: {
              artist: true } } }` and maps it onto the response the same
              way GET /artists/tracks/search already does. */}
          {video.track && (
            <div className="mt-2 flex items-center gap-1.5 max-w-full overflow-hidden">
              <MusicNoteIcon className="w-3.5 h-3.5 text-bone shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
              <div className="overflow-hidden">
                <div className="flex w-max animate-marquee font-body text-xs text-bone whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                  <span className="pr-8">
                    {video.track.artistName} - {video.track.title}
                  </span>
                  <span className="pr-8" aria-hidden="true">
                    {video.track.artistName} - {video.track.title}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Engagement rail — bottom-24 clears the fixed bottom nav on mobile.
            Pure white icons + heavy drop shadows (rather than the app's
            softer `bone` token) so these stay legible over any video
            content, TikTok-style. */}
        <div className="absolute bottom-24 right-6 flex flex-col items-center gap-5">
          {!isOwnVideo && (
            <a href={`/profile/${video.user?.id}`} className="relative block w-11 h-11 mb-1">
              <span className="block w-11 h-11 rounded-full overflow-hidden border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,0.6)] bg-ink2">
                {video.user?.avatarUrl ? (
                  <img src={video.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center font-display text-white text-lg">
                    {video.user?.username?.[0]?.toUpperCase()}
                  </span>
                )}
              </span>
              {!following && (
                <button
                  onClick={handleFollow}
                  aria-label="Follow"
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-reel text-ink flex items-center justify-center text-xs font-bold border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
                >
                  +
                </button>
              )}
            </a>
          )}
          <button
            onClick={toggleLike}
            className="flex flex-col items-center gap-1 p-2 -m-2 text-white hover:scale-110 transition-transform"
          >
            <HeartIcon
              filled={liked}
              className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            />
            <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {likeCount}
            </span>
          </button>
          <button
            onClick={() => {
              // On desktop the comments are already visible in the persistent
              // rail — no need to also pop the mobile sheet over the video.
              if (window.innerWidth < 768) setShowComments(true);
            }}
            className="flex flex-col items-center gap-1 p-2 -m-2 text-white hover:scale-110 transition-transform"
          >
            <CommentIcon className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {commentCount}
            </span>
          </button>
          <button
            onClick={() => {
              if (!localStorage.getItem('token')) {
                window.location.href = '/login';
                return;
              }
              setShowSaveModal(true);
            }}
            className="flex flex-col items-center gap-1 p-2 -m-2 text-white hover:scale-110 transition-transform"
          >
            <BookmarkIcon
              filled={bookmarked}
              className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            />
            <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {bookmarkCount}
            </span>
          </button>
          {video.user?.stripeOnboarded ? (
            <button
              onClick={() => setShowTip(true)}
              className="flex flex-col items-center gap-1 p-2 -m-2 text-white hover:scale-110 transition-transform"
            >
              <TipIcon className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
              <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                Tip
              </span>
            </button>
          ) : (
            <button
              onClick={() => setShowTipUnavailable(true)}
              className="flex flex-col items-center gap-1 p-2 -m-2 hover:scale-110 transition-transform"
            >
              <TipIcon muted className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
              <span className="text-xs font-bold text-white/40 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                Tip
              </span>
            </button>
          )}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="flex flex-col items-center gap-1 p-2 -m-2 text-white hover:scale-110 transition-transform"
              aria-label="More options"
            >
              <MoreDotsIcon className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            </button>
            {showMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-ink2 border border-smoke/20 rounded-sprocket overflow-hidden z-10 w-40">
                {isOwnVideo ? (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteConfirm(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-smoke/10 font-body"
                  >
                    Delete Post
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowReport(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs text-bone hover:bg-smoke/10 font-body"
                  >
                    Report
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              api.logEvent(video.id, 'share').catch(() => {});
              setShowShare(true);
            }}
            className="flex flex-col items-center gap-1 p-2 -m-2 text-white hover:scale-110 transition-transform"
          >
            <ShareIcon className="w-8 h-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            <span className="text-xs font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              Share
            </span>
          </button>

          {/* Spinning vinyl badge — only shows once video.track is
              populated (see the sound-ticker comment above for why that's
              not the case yet on the live feed). Rotation state mirrors
              `paused`, the same local play/pause flag the tap-to-pause
              overlay above already uses, so the disc always matches what's
              actually on screen. */}
          {video.track && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSoundPicker(true);
              }}
              aria-label="View sound"
              className={`mt-1 w-11 h-11 rounded-full border-2 border-white/80 shadow-[0_2px_6px_rgba(0,0,0,0.6)] overflow-hidden bg-ink2 flex items-center justify-center text-reel animate-[spin_4s_linear_infinite] ${
                paused ? '[animation-play-state:paused]' : ''
              }`}
            >
              {video.track.coverUrl ? (
                <img src={video.track.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <MusicNoteIcon className="w-4 h-4" />
              )}
            </button>
          )}
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
      {showDeleteConfirm && (
        <DeleteConfirmModal
          deleting={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showShare && (
        <ShareSheet
          video={video}
          onClose={() => setShowShare(false)}
          onReport={() => setShowReport(true)}
        />
      )}
      {showSoundPicker && video.track && (
        <SoundPicker
          mode="track-videos"
          activeTrack={video.track}
          onClose={() => setShowSoundPicker(false)}
          // "Use this sound" from someone else's reel hands off to Upload
          // with the track preselected, TikTok-style, rather than trying
          // to attach it to this card. Upload doesn't read a trackId query
          // param yet, so this is a no-op there until that's wired up —
          // tracked separately, out of scope for the feed overlay itself.
          onSelect={({ soundId }) => {
            window.location.href = `/upload?trackId=${soundId}`;
          }}
        />
      )}
      {showSaveModal && (
        <SaveToCollectionModal
          videoId={video.id}
          quickSaved={bookmarked}
          onQuickSaveToggle={toggleBookmark}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
});

export default VideoCard;

function DeleteConfirmModal({ deleting, onConfirm, onCancel }) {
  return (
    <div className="absolute inset-0 bg-ink/90 flex items-center justify-center z-30">
      <div className="bg-ink2 rounded-sprocket p-6 w-72 border border-smoke/20 text-center">
        <p className="font-display text-xl text-bone mb-2 tracking-wide">Delete this post?</p>
        <p className="font-body text-sm text-smoke mb-5">
          Are you sure you want to delete this video? This action cannot be undone.
        </p>
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="w-full bg-red-500 text-ink font-body font-semibold py-2 rounded-sprocket disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete Post'}
        </button>
        <button
          onClick={onCancel}
          disabled={deleting}
          className="w-full mt-3 text-smoke text-sm font-body disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

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
