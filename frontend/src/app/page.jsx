'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { hasSeenWelcome, hasToken, isGuest } from '@/lib/onboarding';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import VideoCard from '../components/VideoCard';
import { useFeedScrolling } from '../hooks/useFeedScrolling';
import DesktopRail from '../components/DesktopRail';
import { loadTuningWeights } from '../components/TuneFeedPanel';
import FeedFiltersDrawer from '../components/FeedFiltersDrawer';
import { DesktopIconNav } from '@/components/DesktopNav';
import Logo from '../components/Logo';
import StoriesBar from '../components/StoriesBar';
import TopHeaderNav from '../components/TopHeaderNav';

const FILTERS = [
  { label: 'All', value: null },
  { label: 'Shorts', value: 'short' },
  { label: 'Features', value: 'long' },
  { label: 'LIVE', href: '/live' },
  { label: 'Communities', href: '/communities' },
  { label: 'Collections', href: '/collections' },
];

function CircleParamSync({ onCircle }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const c = searchParams.get('circle');
    if (c) onCircle(c);
  }, [searchParams, onCircle]);

  return null;
}

export default function FeedPage() {
  const router = useRouter();
  const [guest, setGuest] = useState(false);

  // Welcome gate: a brand-new install (no session, welcome never seen) is sent to the intro before
  // any feed content. Keys: the session token is stored as 'token' (not 'auth_token').
  useEffect(() => {
    if (!hasToken() && !hasSeenWelcome()) {
      router.replace('/welcome');
      return;
    }
    setGuest(!hasToken() && isGuest());
  }, [router]);

  // Audio & Header state
  const [activeTab, setActiveTab] = useState('All');
  const [isMuted, setIsMuted] = useState(false);

  // Core Feed States
  const [videos, setVideos] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [filter, setFilter] = useState(null); // null = mixed, 'short', 'long'
  const [circle, setCircle] = useState(null);
  const [circles, setCircles] = useState([]);
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const { isScrolling, handlers: scrollHandlers } = useFeedScrolling();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tuningWeights, setTuningWeights] = useState({ nicheWeight: 50, freshWeight: 50, localWeight: 50 });
  const [activeTime, setActiveTime] = useState(0);
  const [celebration, setCelebration] = useState(null);

  const [isDesktop, setIsDesktop] = useState(null);

  // Unified click handler for filter tabs
  function handleFilterClick(opt) {
    if (opt.href) {
      router.push(opt.href);
      return;
    }
    setActiveTab(opt.label);
    setFilter(opt.value);
  }

  // Mobile TopHeaderNav Tab Handler
  function handleMobileTabSelect(tabLabel) {
    setActiveTab(tabLabel);
    // Case-insensitive match against FILTERS by label — this is how tabs
    // shared with the desktop nav (All, Shorts, LIVE, Communities,
    // Collections) get routed/filtered. Keep TopHeaderNav's NAV_TABS
    // labels in sync with FILTERS' labels or this silently no-ops.
    const match = FILTERS.find((f) => f.label.toLowerCase() === tabLabel.toLowerCase());
    if (match) {
      handleFilterClick(match);
    } else if (tabLabel === 'Shorts') {
      setFilter('short');
    } else if (tabLabel === 'Following') {
      setFilter('following');
    } else if (tabLabel === 'DMs') {
      // DMs has no FILTERS entry (it's a standalone header link on
      // desktop, not part of the tab/filter row), so it needs its own
      // explicit route here.
      router.push('/messages');
    } else {
      setFilter(null);
    }
  }

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

  const mobileContainerRef = useRef(null);
  const desktopContainerRef = useRef(null);
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
    setInitialLoading(true);
    api
      .getFeed(filter, undefined, tuningWeights, circle)
      .then((data) => {
        let videos = data.videos || [];
        const PENDING_TTL_MS = 5 * 60 * 1000;
        const pendingRaw = typeof window !== 'undefined' ? sessionStorage.getItem('pendingUpload') : null;
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw);
            const alreadyInResults = videos.some((v) => v.id === pending.id);
            const expired = !pending.postedAt || Date.now() - pending.postedAt > PENDING_TTL_MS;
            if (alreadyInResults || expired) {
              sessionStorage.removeItem('pendingUpload');
            } else if (filter === null || filter === pending.videoType) {
              videos = [pending, ...videos];
            }
          } catch {
            sessionStorage.removeItem('pendingUpload');
          }
        }
        setVideos(videos);
        setNextCursor(data.nextCursor || null);
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, [filter, tuningWeights, circle]);

  useEffect(() => {
    if (!nextCursor || loadingMore) return;
    if (activeIndex < videos.length - 3) return;

    setLoadingMore(true);
    api
      .getFeed(filter, nextCursor, tuningWeights, circle)
      .then((data) => {
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          const fresh = (data.videos || []).filter((v) => !seen.has(v.id));
          return [...prev, ...fresh];
        });
        setNextCursor(data.nextCursor || null);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [activeIndex, nextCursor, loadingMore, videos.length, filter, tuningWeights, circle]);

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

  function handleVideoDeleted(videoId) {
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
  }

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

  // Video currently centered in the feed — feeds the desktop side rail
  // (comments/details) and its seek callback below. This was previously
  // referenced in the JSX without ever being declared, which threw a
  // ReferenceError on every render and crashed the whole page (not just
  // the desktop rail) — including the nav.
  const activeVideo = videos[activeIndex] || null;

  // Desktop Header
  const desktopHeader = (
    <header className="hidden md:flex h-16 items-center justify-between gap-6 px-6 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md shrink-0 z-30 relative">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <a href="/" className="shrink-0" aria-label="Reel Studio home">
          <Logo size="sm" showText />
        </a>
        <div className="w-px h-6 bg-zinc-800 shrink-0" />
        {user ? (
          <a href={`/profile/${user.id}`} className="flex items-center gap-2 min-w-0 group">
            <span className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center font-display text-amber-400 text-sm">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                user.username?.[0]?.toUpperCase()
              )}
            </span>
            <span className="font-body text-sm font-semibold lg:font-extrabold lg:tracking-tight text-white truncate group-hover:text-amber-400 transition-colors">
              @{user.username}
            </span>
          </a>
        ) : (
          <a href="/login" className="font-body text-sm font-semibold text-zinc-400 hover:text-white">
            Log in
          </a>
        )}
      </div>

      <div className="flex gap-1 bg-zinc-900/80 border border-zinc-800 rounded-xl p-1 font-mono text-xs uppercase tracking-widest lg:font-body lg:font-extrabold lg:text-sm lg:tracking-tight shrink-0 z-10">
        {FILTERS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => handleFilterClick(opt)}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              (opt.value === filter && !opt.href) || activeTab === opt.label
                ? 'bg-amber-500 text-black font-bold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-end gap-5 font-mono text-xs uppercase tracking-widest lg:font-body lg:font-extrabold lg:text-sm lg:tracking-tight flex-1">
        {user && (
          <>
            {user.role === 'admin' && (
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
        )}
        <DesktopIconNav />
        <button
          type="button"
          onClick={() => setIsMuted((prev) => !prev)}
          className="text-zinc-300 hover:text-white px-2 py-1 rounded bg-zinc-800/50 lg:font-extrabold lg:tracking-tight"
        >
          {isMuted ? '🔇 Mute' : '🔊 Sound'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/search')}
          aria-label="Search"
          className="text-zinc-300 hover:text-white cursor-pointer"
        >
          <SearchIcon />
        </button>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label="Filters and feed tuning"
          className="relative text-zinc-300 hover:text-white cursor-pointer"
        >
          <DotsIcon />
          {circle !== null && (
            <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>
      </div>
    </header>
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink flex flex-col">
      <Suspense fallback={null}>
        <CircleParamSync onCircle={setCircle} />
      </Suspense>

      {/* Guest browsing (chose "Continue as Guest" on /welcome): a slim, tappable nudge. */}
      {guest && !focusMode && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] inset-x-0 z-30 flex justify-center pointer-events-none px-4">
          <a
            href="/signup"
            className="pointer-events-auto flex items-center gap-2 bg-black/75 backdrop-blur-sm text-white text-xs font-extrabold px-4 py-2 rounded-full shadow-lg border border-white/15"
          >
            Browsing as a guest <span className="text-amber-400">Sign up to join in</span>
          </a>
        </div>
      )}

      {/* Desktop Header */}
      {!focusMode && isDesktop && (
        <>
          {desktopHeader}
          <StoriesBar className="border-b border-zinc-800 bg-zinc-950/80" />
        </>
      )}

      {/* Mobile Header Overlay */}
      {!focusMode && isDesktop === false && (
        <div className="fixed top-0 inset-x-0 z-40 pointer-events-auto">
          <TopHeaderNav
            activeTab={activeTab}
            setActiveTab={handleMobileTabSelect}
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((prev) => !prev)}
            onSearchClick={() => router.push('/search')}
          />
          {/* TopHeaderNav is in normal flow now (sticky), so the stories bar simply follows it — no offset needed. */}
          <div className="relative z-10">
            <StoriesBar />
          </div>
        </div>
      )}

      {/* Mobile Feed */}
      {isDesktop === false && (
        <div className="h-full w-full flex-1 min-h-0 pt-14">
          <div
            ref={mobileContainerRef}
            className="feed-scroll h-full w-full overflow-y-scroll snap-y snap-mandatory"
            {...scrollHandlers}
          >
            {videos.map((video, i) => (
              <div key={video.id} className="h-dvh w-full snap-start">
                <VideoCard
                  ref={(el) => { videoCardRefs.current[video.id] = el; }}
                  video={video}
                  isActive={i === activeIndex}
                  isMuted={isMuted}
                  onMuteChange={setIsMuted}
                  shouldLoad={Math.abs(i - activeIndex) <= 1}
                  focusMode={focusMode}
                  isScrolling={isScrolling}
                  onAdvance={() => scrollToIndex(i + 1)}
                  onToggleFollow={handleToggleFollow}
                  onDeleted={handleVideoDeleted}
                />
              </div>
            ))}
            {loadingMore && (
              <div className="h-dvh w-full snap-start">
                <FeedSkeletonCard />
              </div>
            )}
            {videos.length === 0 && initialLoading && (
              <div className="h-dvh w-full snap-start">
                <FeedSkeletonCard />
              </div>
            )}
            {videos.length === 0 && !initialLoading && (
              <div className="h-dvh flex items-center justify-center">
                <p className="font-body text-smoke">No videos found for this filter.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Workspace */}
      {isDesktop === true && (
        <div className="flex-1 min-h-0 flex gap-4 p-4 lg:w-full lg:max-w-7xl lg:mx-auto lg:px-6 lg:py-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-8 lg:items-start">
          <div className="flex-1 flex items-center justify-center min-w-0">
            <div className="h-full w-full max-w-[calc((100vh-6rem)*9/16+2rem)] flex items-center justify-center lg:h-auto bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-md shadow-2xl p-4 lg:max-w-none lg:bg-transparent lg:border-0 lg:shadow-none lg:backdrop-blur-none lg:p-0">
              <div
                ref={desktopContainerRef}
                className="feed-scroll h-full max-h-[calc(100vh-8rem)] w-auto aspect-[9/16] overflow-y-scroll snap-y snap-mandatory rounded-xl mx-auto lg:aspect-auto lg:w-full lg:max-w-lg lg:h-[min(80vh,calc(100dvh_-_14.5rem))] lg:rounded-2xl lg:shadow-2xl lg:border lg:border-zinc-800 lg:bg-black"
                {...scrollHandlers}
              >
                {videos.map((video, i) => (
                  <div key={video.id} className="h-full w-full snap-start">
                    <VideoCard
                      ref={(el) => { videoCardRefs.current[video.id] = el; }}
                      video={video}
                      isActive={i === activeIndex}
                      isMuted={isMuted}
                      onMuteChange={setIsMuted}
                      shouldLoad={Math.abs(i - activeIndex) <= 1}
                      focusMode={focusMode}
                      isScrolling={isScrolling}
                  onAdvance={() => scrollToIndex(i + 1)}
                      onToggleFollow={handleToggleFollow}
                      onDeleted={handleVideoDeleted}
                      onActiveTimeUpdate={setActiveTime}
                    />
                  </div>
                ))}
                {loadingMore && (
                  <div className="h-full w-full snap-start">
                    <FeedSkeletonCard />
                  </div>
                )}
                {videos.length === 0 && initialLoading && (
                  <div className="h-full w-full snap-start">
                    <FeedSkeletonCard />
                  </div>
                )}
                {videos.length === 0 && !initialLoading && (
                  <div className="h-full flex items-center justify-center">
                    <p className="font-body text-smoke text-center px-6">No videos found for this filter.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {!focusMode && activeVideo && (
            <div className="w-full max-w-md shrink-0 bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-md shadow-2xl p-4 overflow-hidden lg:max-w-none lg:h-[min(80vh,calc(100dvh_-_14.5rem))] lg:min-h-0 lg:overflow-y-auto lg:p-0 lg:bg-zinc-900/80">
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

      {celebration && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-amber-400 text-black font-body font-semibold px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <span>You just got tipped ${(celebration.amountCents / 100).toFixed(2)}!</span>
          </div>
        </div>
      )}

      <FeedFiltersDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        circles={circles}
        circle={circle}
        onSelectCircle={(c) => {
          setCircle(c);
          setFiltersOpen(false);
        }}
        weights={tuningWeights}
        onWeightsChange={setTuningWeights}
      />
    </main>
  );
}

function FeedSkeletonCard() {
  return (
    <div className="relative h-full w-full flex items-center justify-center bg-ink">
      <div className="h-full w-full max-w-md bg-zinc-900 animate-pulse" />
      <div className="absolute bottom-24 left-4 right-20 space-y-3">
        <div className="h-4 w-1/3 bg-zinc-800 rounded animate-pulse" />
        <div className="h-3 w-2/3 bg-zinc-800 rounded animate-pulse" />
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
