'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import VideoCard from '../components/VideoCard';
import DesktopRail from '../components/DesktopRail';
import SprocketRail from '../components/SprocketRail';
import TuneFeedPanel, { loadTuningWeights } from '../components/TuneFeedPanel';

const FILTERS = [
  { label: 'All', value: null },
  { label: 'Shorts', value: 'short' },
  { label: 'Features', value: 'long' },
];

// useSearchParams() opts the whole route out of static rendering unless a
// Suspense boundary sits above whatever calls it — that's what was failing
// the Vercel build ("useSearchParams() should be wrapped in a suspense
// boundary at page '/'"). Isolating the hook into this tiny component (it
// renders nothing — it just reads the ?circle= deep link once and hands it
// up) means only this sliver suspends during prerender, not the entire
// feed. Wrapping the whole page instead would work too, but would mean the
// entire video feed waits behind a loading fallback for no reason, since
// nothing else on the page actually depends on search params.
function CircleParamSync({ onCircle }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const c = searchParams.get('circle');
    if (c) onCircle(c);
  }, [searchParams, onCircle]);

  return null;
}

export default function FeedPage() {
  const [videos, setVideos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState(null); // null = mixed, 'short', 'long'
  const [circle, setCircle] = useState(null); // null = all circles
  const [circles, setCircles] = useState([]);
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [tuningWeights, setTuningWeights] = useState({ nicheWeight: 50, freshWeight: 50, localWeight: 50 });
  const [activeTime, setActiveTime] = useState(0);
  const [celebration, setCelebration] = useState(null);

  // null until the first effect runs on the client — we deliberately render
  // neither layout until we know the viewport. Rendering both (one merely
  // CSS-hidden) used to mount two <video> elements for the same clip at
  // once; the hidden one kept autoplaying — and playing audio — in the
  // background, which is why pausing the visible player didn't actually
  // silence anything, and why the mute toggle looked broken (it only ever
  // muted whichever copy you could see). Only ever mounting one instance
  // per video fixes both.
  const [isDesktop, setIsDesktop] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mq.matches);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setTuningWeights(loadTuningWeights());
  }, []);

  // Deep link from the Topic Circles page (/?circle=name) — applied once on
  // load via <CircleParamSync>, rendered further down, so a direct link
  // still lands filtered instead of on "All circles".

  const mobileContainerRef = useRef(null);
  const desktopContainerRef = useRef(null);
  // Keyed by video id (not array index) so refs stay correct even if the
  // feed list is refetched/reordered underneath an in-progress interaction.
  const videoCardRefs = useRef({});
  const desktopRailRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!user) return;
    api.getUnreadCount().then((d) => setUnreadCount(d.count)).catch(() => {});

    const socket = getSocket();
    if (!socket) return;
    const onNew = () => setUnreadCount((c) => c + 1);
    socket.on('notification:new', onNew);

    // Fires the moment the Stripe webhook confirms a tip paid to *this*
    // logged-in user — real-time, not just "eventually shows up in the
    // notification bell." Drives the celebration banner below.
    const onTip = (payload) => {
      setCelebration(payload);
      setTimeout(() => setCelebration((c) => (c === payload ? null : c)), 4000);
    };
    socket.on('tip:received', onTip);

    return () => {
      socket.off('notification:new', onNew);
      socket.off('tip:received', onTip);
    };
  }, [user]);

  useEffect(() => {
    api.getCircles().then(setCircles).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .getFeed(filter, undefined, tuningWeights, circle)
      .then((data) => {
        let videos = data.videos;
        // See app/upload/page.jsx — after a successful upload it stashes a
        // lightweight optimistic entry here so the clip shows up right away
        // instead of waiting on background HLS processing to finish and the
        // video to flip to 'published'. Consumed once and removed; the real
        // published version will appear on a later feed load in its normal
        // ranked position.
        const pendingRaw = typeof window !== 'undefined' ? sessionStorage.getItem('pendingUpload') : null;
        if (pendingRaw) {
          sessionStorage.removeItem('pendingUpload');
          try {
            const pending = JSON.parse(pendingRaw);
            if (!videos.some((v) => v.id === pending.id)) {
              videos = [pending, ...videos];
            }
          } catch {
            /* ignore malformed stash */
          }
        }
        setVideos(videos);
      })
      .catch(() => {});
  }, [filter, tuningWeights, circle]);

  // Single source of truth for follow state. VideoCard's own avatar badge and
  // DesktopRail's Follow button both show the same creator when that
  // creator's video is active — without this, following from one doesn't
  // reflect in the other until the next feed reload.
  async function handleToggleFollow(userId) {
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    const wasFollowing = videos.find((v) => v.user?.id === userId)?.user?.isFollowing;
    const next = !wasFollowing;

    setVideos((prev) =>
      prev.map((v) => (v.user?.id === userId ? { ...v, user: { ...v.user, isFollowing: next } } : v))
    );
    try {
      next ? await api.followUser(userId) : await api.unfollowUser(userId);
    } catch {
      setVideos((prev) =>
        prev.map((v) => (v.user?.id === userId ? { ...v, user: { ...v.user, isFollowing: wasFollowing } } : v))
      );
    }
  }

  // Active-index tracking — mobile and desktop each scroll their own
  // container (only one is ever mounted per breakpoint at a time), both
  // feeding the same activeIndex state.
  useEffect(() => {
    const mobileEl = mobileContainerRef.current;
    const desktopEl = desktopContainerRef.current;

    function makeScrollHandler(el) {
      return () => setActiveIndex(Math.round(el.scrollTop / el.clientHeight));
    }

    const onMobileScroll = mobileEl && makeScrollHandler(mobileEl);
    const onDesktopScroll = desktopEl && makeScrollHandler(desktopEl);

    mobileEl?.addEventListener('scroll', onMobileScroll);
    desktopEl?.addEventListener('scroll', onDesktopScroll);
    return () => {
      mobileEl?.removeEventListener('scroll', onMobileScroll);
      desktopEl?.removeEventListener('scroll', onDesktopScroll);
    };
  }, [videos, isDesktop]);

  function scrollToIndex(i) {
    const clamped = Math.max(0, Math.min(videos.length - 1, i));
    const el = isDesktop ? desktopContainerRef.current : mobileContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' });
  }

  // Power-user keyboard controls. Ignored while typing in an input/textarea
  // so shortcuts don't fight with comment composers, search boxes, etc.
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

      const activeVideo = videos[activeIndex];
      const activeCard = activeVideo && videoCardRefs.current[activeVideo.id];

      switch (e.key) {
        case 'j':
        case 'J':
        case 'ArrowDown':
          e.preventDefault();
          scrollToIndex(activeIndex + 1);
          break;
        case 'k':
        case 'K':
        case 'ArrowUp':
          e.preventDefault();
          scrollToIndex(activeIndex - 1);
          break;
        case 'l':
        case 'L':
          activeCard?.toggleLike();
          break;
        case 'c':
        case 'C':
          if (isDesktop) {
            desktopRailRef.current?.focusComments();
          } else {
            activeCard?.openComments();
          }
          break;
        case 'f':
        case 'F': {
          const next = !focusMode;
          setFocusMode(next);
          if (next && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else if (!next && document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [videos, activeIndex, focusMode, isDesktop]);

  const activeVideo = videos[activeIndex];

  const mobileTopNav = (
    <>
      <div className="fixed top-6 right-6 z-20 font-mono text-xs uppercase tracking-widest flex items-center gap-4">
        {user ? (
          <>
            {(user.role === 'admin' || user.role === 'moderator') && (
              <a href="/admin" className="text-yellow-400">Admin</a>
            )}
            <a href="/live" className="text-smoke">Live</a>
            <a href="/messages" className="relative text-smoke">
              DMs
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-3 bg-reel text-ink rounded-full w-4 h-4 flex items-center justify-center text-[9px]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </a>
          </>
        ) : (
          <a href="/login" className="text-smoke">Log in</a>
        )}
        <a href="/search" aria-label="Search" className="text-bone">
          <SearchIcon />
        </a>
      </div>

      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
        <div className="flex gap-1 bg-ink2/80 rounded-sprocket p-1 font-mono text-xs uppercase tracking-widest">
          {FILTERS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1 rounded-sprocket ${
                filter === opt.value ? 'bg-reel text-ink' : 'text-smoke'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Topic Circles — micro-community filter, only shown once at least
            one video has been posted into a circle. */}
        {circles.length > 0 && (
          <div className="flex gap-1 bg-ink2/80 rounded-sprocket p-1 font-mono text-[10px] uppercase tracking-widest max-w-[90vw] overflow-x-auto">
            <button
              onClick={() => setCircle(null)}
              className={`px-2.5 py-1 rounded-sprocket shrink-0 ${
                circle === null ? 'bg-reel text-ink' : 'text-smoke'
              }`}
            >
              All circles
            </button>
            {circles.map((c) => (
              <button
                key={c.circle}
                onClick={() => setCircle(c.circle)}
                className={`px-2.5 py-1 rounded-sprocket shrink-0 ${
                  circle === c.circle ? 'bg-reel text-ink' : 'text-smoke'
                }`}
              >
                {c.circle} · {c.count}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  // Desktop-only header bar — replaces the floating pill nav with a single
  // balanced strip: identity on the left, feed filters centered, secondary
  // links on the right.
  const desktopHeader = (
    <header className="hidden md:flex h-16 items-center justify-between gap-6 px-6 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {user ? (
          <a href={`/profile/${user.id}`} className="flex items-center gap-2 min-w-0 group">
            <span className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center font-display text-amber-400 text-sm">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                user.username?.[0]?.toUpperCase()
              )}
            </span>
            <span className="font-body text-sm font-semibold text-white truncate group-hover:text-amber-400 transition-colors">
              @{user.username}
            </span>
          </a>
        ) : (
          <a href="/login" className="font-body text-sm font-semibold text-zinc-400 hover:text-white">
            Log in
          </a>
        )}
      </div>

      <div className="flex gap-1 bg-zinc-900/80 border border-zinc-800 rounded-xl p-1 font-mono text-xs uppercase tracking-widest shrink-0">
        {FILTERS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === opt.value ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-end gap-5 font-mono text-xs uppercase tracking-widest flex-1">
        {user ? (
          <>
            {(user.role === 'admin' || user.role === 'moderator') && (
              <a href="/admin" className="text-yellow-400 hover:text-yellow-300">Admin</a>
            )}
            <a href="/live" className="text-zinc-400 hover:text-white">Live</a>
            <a href="/messages" className="relative text-zinc-400 hover:text-white">
              DMs
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-3 bg-amber-500 text-black rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </a>
          </>
        ) : null}
        <a href="/search" aria-label="Search" className="text-zinc-300 hover:text-white">
          <SearchIcon />
        </a>
      </div>
    </header>
  );

  return (
    <main className="relative h-screen w-full overflow-hidden bg-ink flex flex-col">
      {/* Deep-link param read isolated here + Suspense-wrapped: satisfies
          Next.js's requirement that useSearchParams() have a Suspense
          boundary above it during static prerendering, without suspending
          the rest of the page (this renders nothing visible either way). */}
      <Suspense fallback={null}>
        <CircleParamSync onCircle={setCircle} />
      </Suspense>

      {!focusMode && isDesktop && desktopHeader}
      {!focusMode && isDesktop === false && mobileTopNav}

      {/* ── Mobile: full-bleed vertical swipe feed ── */}
      {isDesktop === false && (
        <div className="h-full w-full flex-1 min-h-0">
          <SprocketRail count={videos.length} activeIndex={activeIndex} />
          <div
            ref={mobileContainerRef}
            className="feed-scroll h-full w-full overflow-y-scroll snap-y snap-mandatory"
          >
            {videos.map((video, i) => (
              <div key={video.id} className="h-screen w-full snap-start">
                <VideoCard
                  ref={(el) => { videoCardRefs.current[video.id] = el; }}
                  video={video}
                  isActive={i === activeIndex}
                  focusMode={focusMode}
                  onToggleFollow={handleToggleFollow}
                />
              </div>
            ))}
            {videos.length === 0 && (
              <div className="h-screen flex items-center justify-center">
                <p className="font-body text-smoke">No videos yet — be the first to post.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Desktop: dual-pane workspace — glass video canvas + glass rail ── */}
      {isDesktop === true && (
        <div className="flex-1 min-h-0 flex gap-4 p-4">
          <div className="flex-1 flex items-center justify-center min-w-0">
            <div className="h-full w-full max-w-[calc((100vh-6rem)*9/16+2rem)] flex items-center justify-center bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-md shadow-2xl p-4">
              <div
                ref={desktopContainerRef}
                className="feed-scroll h-full max-h-[calc(100vh-8rem)] w-auto aspect-[9/16] overflow-y-scroll snap-y snap-mandatory rounded-xl mx-auto"
              >
                {videos.map((video, i) => (
                  <div key={video.id} className="h-full w-full snap-start">
                    <VideoCard
                      ref={(el) => { videoCardRefs.current[video.id] = el; }}
                      video={video}
                      isActive={i === activeIndex}
                      focusMode={focusMode}
                      onToggleFollow={handleToggleFollow}
                      onActiveTimeUpdate={setActiveTime}
                    />
                  </div>
                ))}
                {videos.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <p className="font-body text-smoke text-center px-6">No videos yet — be the first to post.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!focusMode && (
            <div className="w-full max-w-md shrink-0 bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-md shadow-2xl p-4 overflow-hidden">
              <DesktopRail
                ref={desktopRailRef}
                video={activeVideo}
                onToggleFollow={handleToggleFollow}
                currentTime={activeTime}
                onSeek={(seconds) => videoCardRefs.current[activeVideo?.id]?.seekTo(seconds)}
              />
            </div>
          )}
        </div>
      )}

      {/* Tip celebration banner — real-time via the 'tip:received' socket
          event, fired the instant the Stripe webhook confirms payment.
          Sits above both layouts so it works whether the recipient is
          browsing on mobile or desktop. */}
      {celebration && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-reel text-ink font-body font-semibold px-5 py-3 rounded-sprocket shadow-lg flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <span>You just got tipped ${(celebration.amountCents / 100).toFixed(2)}!</span>
          </div>
        </div>
      )}

      {!focusMode && (
        <TuneFeedPanel weights={tuningWeights} onChange={setTuningWeights} />
      )}

      {/* Keyboard shortcut legend — desktop only, tucked out of the way */}
      {!focusMode && (
        <div className="hidden md:block fixed bottom-4 left-4 z-20 font-mono text-[10px] text-smoke/50 uppercase tracking-widest">
          J/K scroll · L like · C comment · F focus
        </div>
      )}
    </main>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
