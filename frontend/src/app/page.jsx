'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import VideoCard from '@/components/VideoCard';
import DesktopRail from '@/components/DesktopRail';
import SprocketRail from '@/components/SprocketRail';
import { loadTuningWeights } from '@/components/TuneFeedPanel';
import FeedFiltersDrawer from '@/components/FeedFiltersDrawer';
import Logo from '@/components/Logo';
import StoriesBar from '@/components/StoriesBar';
import TopHeaderNav from '@/components/TopHeaderNav';

// Top feed filter tabs
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
  
  // Custom Header & Audio states
  const [activeTab, setActiveTab] = useState('All');
  const [isMuted, setIsMuted] = useState(false);

  // Core Feed States
  const [videos, setVideos] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [filter, setFilter] = useState(null); // null = mixed, 'short', 'long'
  const [circle, setCircle] = useState(null); // null = all circles
  const [circles, setCircles] = useState([]);
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tuningWeights, setTuningWeights] = useState({ nicheWeight: 50, freshWeight: 50, localWeight: 50 });
  const [activeTime, setActiveTime] = useState(0);
  const [celebration, setCelebration] = useState(null);

  const [isDesktop, setIsDesktop] = useState(null);

  function handleFilterClick(opt) {
    if (opt.href) {
      router.push(opt.href);
      return;
    }
    setFilter(opt.value);
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
        let videos = data.videos;
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
          const fresh = data.videos.filter((v) => !seen.has(v.id));
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

  // Desktop Header
  const desktopHeader = (
    <header className="hidden md:flex h-16 items-center justify-between gap-6 px-6 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md shrink-0 z-20">
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
            onClick={() => handleFilterClick(opt)}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              !opt.href && filter === opt.value ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
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
        <button
          onClick={() => setFiltersOpen(true)}
          aria-label="Filters and feed tuning"
          className="relative text-zinc-300 hover:text-white"
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

      {/* Desktop Header Navigation */}
      {!focusMode && isDesktop && (
        <>
          {desktopHeader}
          <StoriesBar className="border-b border-zinc-800 bg-zinc-950/80" />
        </>
      )}

      {/* Mobile Top Overlay Header Navigation */}
      {!focusMode && isDesktop === false && (
        <>
          <TopHeaderNav
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((prev) => !prev)}
            onSearchClick={() => router.push('/search')}
          />
          <div className="fixed inset-x-0 z-20" style={{ top: 'calc(env(safe-area-inset-top) + 3.75rem)' }}>
            <StoriesBar />
          </div>
        </>
      )}

      {/* Mobile Feed Section */}
      {isDesktop === false && (
        <div className="h-full w-full flex-1 min-h-0">
          <SprocketRail count={videos.length} activeIndex={activeIndex} />
          <div
            ref={mobileContainerRef}
            className="feed-scroll h-full w-full overflow-y-scroll snap-y snap-mandatory"
          >
            {videos.map((video, i) => (
              <div key={video.id} className="h-dvh w-full snap-start">
                <VideoCard
                  ref={(el) => { videoCardRefs.current[video.id] = el; }}
                  video={video}
                  isActive={i === activeIndex}
                  shouldLoad={Math.abs(i - activeIndex) <= 1}
                  focusMode={focusMode}
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
                <p className="font-body text-smoke">No videos yet — be the first to post.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Workspace Section */}
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
                      shouldLoad={Math.abs(i - activeIndex) <= 1}
                      focusMode={focusMode}
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

      {celebration && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-reel text-ink font-body font-semibold px-5 py-3 rounded-sprocket shadow-lg flex items-center gap-2">
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

      {!focusMode && (
        <div className="hidden md:block fixed bottom-4 left-4 z-20 font-mono text-[10px] text-smoke/50 uppercase tracking-widest">
          J/K scroll · L like · C comment · F focus
        </div>
      )}
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
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-11 h-11 rounded-full bg-zinc-800 animate-pulse" />
        ))}
      </div>
    </div>
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

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
