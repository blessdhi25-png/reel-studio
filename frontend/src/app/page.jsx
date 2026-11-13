'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { hasSeenWelcome, hasToken, isGuest } from '@/lib/onboarding';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import VideoCard from '../components/VideoCard';
import { useFeedScrolling } from '../hooks/useFeedScrolling';
import DesktopRail from '../components/DesktopRail';
import { loadTuningWeights } from '../components/TuneFeedPanel';
import FeedFiltersDrawer from '../components/FeedFiltersDrawer';
import Logo from '../components/Logo';
import StoriesBar from '../components/StoriesBar';
import TopHeaderNav from '../components/TopHeaderNav';
import { useFeedSync } from '../hooks/useFeedSync';
import { getOfflineFeed, precacheVideo } from '../lib/offlineCache';

const FILTERS = [
  { label: 'All', value: null },
  { label: 'Shorts', value: 'short' },
  { label: 'Features', value: 'long' },
  { label: 'LIVE', href: '/live' },
  { label: 'Communities', href: '/communities' },
  { label: 'Collections', href: '/collections' },
];

// Sidebar "Following" → /?tab=following selects the following-only feed.
function TabParamSync({ onTab }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onTab(searchParams.get('tab') === 'following' ? 'following' : null);
  }, [searchParams, onTab]);
  return null;
}

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
  const [bottomNavH, setBottomNavH] = useState(null); // measured BottomNav height (px) so the mobile feed ends exactly at its top edge

  // Background sync / offline state
  const [pendingNew, setPendingNew] = useState([]); // newer clips fetched in the background, not yet in the feed
  const [offlineMode, setOfflineMode] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Unified click handler for filter tabs
  function handleFilterClick(opt) {
    if (opt.href) {
      router.push(opt.href);
      return;
    }
    setActiveTab(opt.label);
    setFilter(opt.value);
  }

  // URL-driven tab (/?tab=following from the desktop sidebar). null = back to the default feed.
  const handleUrlTab = useCallback((tab) => {
    if (tab === 'following') {
      setActiveTab('Following');
      setFilter('following');
    } else {
      setActiveTab((t) => (t === 'Following' ? 'All' : t));
      setFilter((f) => (f === 'following' ? null : f));
    }
  }, []);

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
  const seenIdsRef = useRef(new Set()); // every clip id ever loaded (survives pruning) so pruned clips never look "new"
  const videosRef = useRef([]);
  const feedParamsRef = useRef({});
  const offlineModeRef = useRef(false);
  const pruneAnchorRef = useRef(null);
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

  // Rebuilds the feed from clips whose .mp4 is verifiably in the Cache API, so
  // an offline user never lands on a black, unplayable card.
  async function enterOfflineFeed() {
    const cached = await getOfflineFeed();
    setOfflineMode(true);
    setVideos(cached);
    setNextCursor(null);
    setPendingNew([]);
    setActiveIndex(0);
    setInitialLoading(false);
    desktopContainerRef.current?.scrollTo({ top: 0 });
    mobileContainerRef.current?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      enterOfflineFeed();
      return;
    }
    setOfflineMode(false);
    setInitialLoading(true);
    seenIdsRef.current = new Set();
    setPendingNew([]);
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
      .catch(() => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) enterOfflineFeed();
      })
      .finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, tuningWeights, circle, reloadKey]);

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

    // Desktop cards are shorter than the scroller (88vh + gap), so index-by-height
    // doesn't work: the active card is the one whose centre is nearest the scroller's centre.
    function makeCenterHandler(el) {
      return () => {
        const box = el.getBoundingClientRect();
        const mid = box.top + box.height / 2;
        const count = Math.min(el.children.length, videos.length);
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < count; i++) {
          const r = el.children[i].getBoundingClientRect();
          const d = Math.abs(r.top + r.height / 2 - mid);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
        setActiveIndex(best);
      };
    }

    const onMobileScroll = mobileEl && makeScrollHandler(mobileEl);
    const onDesktopScroll = desktopEl && makeCenterHandler(desktopEl);

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
    if (isDesktop) {
      const card = el.children[clamped];
      if (!card) return;
      const box = el.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      el.scrollTo({ top: el.scrollTop + (r.top + r.height / 2) - (box.top + box.height / 2), behavior: 'smooth' });
      return;
    }
    el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' });
  }

  // Measure the real bottom-nav height (it grows with the device's safe-area inset), so the
  // feed fills the space above it with no gap and no overlap.
  useEffect(() => {
    if (isDesktop !== false) return undefined;
    const nav = document.querySelector('[data-bottom-nav]');
    if (!nav) return undefined;
    const measure = () => setBottomNavH(Math.round(nav.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [isDesktop]);

  // ---- Silent background refresh, pruning, offline media cache ----
  const MAX_FEED_VIDEOS = 30; // sliding window of clips kept in React state
  const KEEP_ABOVE_ACTIVE = 8; // watched clips kept above the current one so a short scroll-back still works

  videosRef.current = videos;
  feedParamsRef.current = { filter, tuningWeights, circle };
  offlineModeRef.current = offlineMode;
  useEffect(() => {
    videos.forEach((v) => seenIdsRef.current.add(v.id));
  }, [videos]);

  // 1) Poll for newer clips (every 60s while visible, plus on focus/online).
  //    Found clips are only queued in `pendingNew`; the feed itself isn't touched here.
  useFeedSync({
    enabled: !offlineMode && !initialLoading,
    check: async () => {
      const { filter: f, tuningWeights: w, circle: c } = feedParamsRef.current;
      const data = await api.getFeed(f, undefined, w, c);
      const fresh = (data.videos || []).filter((v) => !seenIdsRef.current.has(v.id));
      if (!fresh.length) return;
      setPendingNew((prev) => {
        const queued = new Set(prev.map((v) => v.id));
        const add = fresh.filter((v) => !queued.has(v.id));
        return add.length ? [...add, ...prev] : prev;
      });
    },
  });

  // 2) At the top of the feed and idle: slot the queued clips in right AFTER the
  //    playing one, so nothing shifts above it and playback isn't interrupted.
  useEffect(() => {
    if (!pendingNew.length || offlineMode || activeIndex !== 0 || isScrolling) return;
    const incoming = pendingNew;
    setPendingNew([]);
    setVideos((prev) => {
      const seen = new Set(prev.map((v) => v.id));
      const add = incoming.filter((v) => !seen.has(v.id));
      return add.length ? [...prev.slice(0, 1), ...add, ...prev.slice(1)] : prev;
    });
  }, [pendingNew, activeIndex, isScrolling, offlineMode]);

  // Pill tap (user is further down): put the new clips on top, then glide to them.
  function showNewClips() {
    const incoming = pendingNew;
    setPendingNew([]);
    setVideos((prev) => {
      const seen = new Set(prev.map((v) => v.id));
      return [...incoming.filter((v) => !seen.has(v.id)), ...prev];
    });
    setTimeout(() => scrollToIndexRef.current?.(0), 60);
  }

  // 3) Bulk pruning: once more than MAX_FEED_VIDEOS are loaded, drop watched clips
  //    far above the current one. The active card's on-screen position is recorded
  //    first and restored in the layout effect below, so the view doesn't jump.
  useEffect(() => {
    if (offlineMode || isScrolling || videos.length <= MAX_FEED_VIDEOS) return;
    const drop = activeIndex - KEEP_ABOVE_ACTIVE;
    if (drop <= 0) return;
    const el = isDesktop ? desktopContainerRef.current : mobileContainerRef.current;
    const anchor = el?.children[activeIndex];
    pruneAnchorRef.current = el && anchor ? { el, anchor, top: anchor.getBoundingClientRect().top } : null;
    setVideos((prev) => prev.slice(drop));
    setActiveIndex((i) => Math.max(0, i - drop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.length, activeIndex, isScrolling, offlineMode, isDesktop]);

  useLayoutEffect(() => {
    const a = pruneAnchorRef.current;
    if (!a) return;
    pruneAnchorRef.current = null;
    if (!a.anchor.isConnected) return;
    const delta = a.anchor.getBoundingClientRect().top - a.top;
    if (delta) a.el.scrollTop += delta;
  }, [videos]);

  // 4) Pre-cache the playing clip + the next 3 (debounced so fast flicking doesn't spawn fetches).
  useEffect(() => {
    if (offlineMode) return undefined;
    const t = setTimeout(() => {
      videos.slice(activeIndex, activeIndex + 4).forEach((v) => precacheVideo(v));
    }, 1200);
    return () => clearTimeout(t);
  }, [activeIndex, videos, offlineMode]);

  // 5) Offline / online switching.
  useEffect(() => {
    function onOffline() {
      enterOfflineFeed();
    }
    function onOnline() {
      if (offlineModeRef.current) {
        setOfflineMode(false);
        setReloadKey((k) => k + 1); // refetch the live feed
      }
    }
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: ArrowDown / ArrowUp step through the feed on desktop. Ignored while typing,
  // with modifier keys held, or while a dialog is open.
  const scrollToIndexRef = useRef(null);
  scrollToIndexRef.current = scrollToIndex;
  const keyTargetRef = useRef(null);
  const keyTimerRef = useRef(null);
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  useEffect(() => {
    if (!isDesktop) return;
    function onKeyDown(e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (window.innerWidth < 1024) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      const base = keyTargetRef.current ?? activeIndexRef.current;
      const next = Math.max(0, base + (e.key === 'ArrowDown' ? 1 : -1));
      keyTargetRef.current = next;
      clearTimeout(keyTimerRef.current);
      keyTimerRef.current = setTimeout(() => { keyTargetRef.current = null; }, 450);
      scrollToIndexRef.current?.(next);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(keyTimerRef.current);
    };
  }, [isDesktop]);

  // Video currently centered in the feed — feeds the desktop side rail
  // (comments/details) and its seek callback below. This was previously
  // referenced in the JSX without ever being declared, which threw a
  // ReferenceError on every render and crashed the whole page (not just
  // the desktop rail) — including the nav.
  const activeVideo = videos[activeIndex] || null;

  // Desktop Header
  const desktopHeader = (
    <header className="hidden md:flex lg:hidden h-16 items-center justify-between gap-6 px-6 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md shrink-0 z-30 relative">
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
        <TabParamSync onTab={handleUrlTab} />
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
          <StoriesBar className="border-b border-zinc-800 bg-zinc-950/80 lg:hidden" />
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
        <div className="pt-16 pb-20 lg:pt-0 lg:pb-0 h-full w-full flex-1 min-h-0 flex flex-col items-center" style={bottomNavH ? { paddingBottom: bottomNavH } : undefined}>
          <div
            ref={mobileContainerRef}
            className="feed-scroll h-full w-full overflow-y-scroll snap-y snap-mandatory"
            {...scrollHandlers}
          >
            {videos.map((video, i) => (
              <div key={video.id} className="h-full w-full snap-start flex items-center justify-center relative">
               <div className="h-full w-full">
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
                <p className="font-body text-smoke">No videos found for this filter.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* lg+: compact account shortcut, top-right */}
      {!focusMode && isDesktop === true && (
        <a
          href="/profile"
          aria-label="Your profile"
          className="fixed top-4 right-6 z-40 hidden lg:flex w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-zinc-600 hover:border-amber-400 items-center justify-center font-extrabold text-amber-400 text-sm shadow-lg transition-colors"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            user?.username?.[0]?.toUpperCase() || '?'
          )}
        </a>
      )}

      {/* lg+: the top header bar is gone (the sidebar carries navigation); the feed-specific
          controls it held float over the top of the feed. */}
      {!focusMode && isDesktop === true && (
        <div className="hidden lg:flex absolute top-3 left-0 right-0 z-30 justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md border border-neutral-800 p-1 text-sm font-extrabold tracking-tight">
            {FILTERS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => handleFilterClick(opt)}
                className={`px-3.5 py-1.5 rounded-full transition-colors ${
                  (opt.value === filter && !opt.href) || activeTab === opt.label
                    ? 'bg-amber-500 text-black'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <span className="w-px h-5 bg-neutral-700 mx-1" />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label="Filters and feed tuning"
              className="relative px-3 py-1.5 rounded-full text-neutral-300 hover:text-white"
            >
              <DotsIcon />
              {circle !== null && <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-amber-500" />}
            </button>
          </div>
        </div>
      )}

      {/* Desktop Workspace */}
      {isDesktop === true && (
        <div className="relative flex-1 min-h-0 flex gap-4 p-4 lg:p-0 lg:gap-0 lg:items-stretch">
          <div className="flex-1 flex items-center justify-center min-w-0 lg:items-stretch lg:justify-center">
            <div className="h-full w-full max-w-[calc((100vh-6rem)*9/16+2rem)] flex items-center justify-center lg:h-full bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-md shadow-2xl p-4 lg:max-w-none lg:bg-transparent lg:border-0 lg:shadow-none lg:backdrop-blur-none lg:p-0">
              <div
                ref={desktopContainerRef}
                className="feed-scroll h-full max-h-[calc(100vh-8rem)] w-auto aspect-[9/16] overflow-y-scroll snap-y snap-mandatory rounded-xl mx-auto lg:aspect-auto lg:w-full lg:max-h-none lg:mx-0 lg:rounded-none lg:flex lg:flex-col lg:items-center lg:pt-14 lg:pb-6"
                {...scrollHandlers}
              >
                {videos.map((video, i) => (
                  <div key={video.id} className="h-full w-full snap-start lg:h-[88vh] lg:max-w-[560px] lg:shrink-0 lg:snap-center lg:snap-always lg:flex lg:items-center lg:justify-center lg:relative lg:mb-8">
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
                  <div className="h-full w-full snap-start lg:h-[88vh] lg:max-w-[560px] lg:shrink-0 lg:rounded-2xl lg:overflow-hidden lg:mb-8">
                    <FeedSkeletonCard />
                  </div>
                )}
                {videos.length === 0 && initialLoading && (
                  <div className="h-full w-full snap-start lg:h-[88vh] lg:max-w-[560px] lg:shrink-0 lg:rounded-2xl lg:overflow-hidden lg:mb-8">
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
            <div className="w-full max-w-md shrink-0 bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-md shadow-2xl p-4 overflow-hidden lg:hidden xl:block xl:w-[320px] xl:max-w-[320px] xl:h-[88vh] xl:self-center xl:mr-6 lg:min-h-0 lg:overflow-y-auto lg:p-0 lg:bg-zinc-900/80">
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

      {pendingNew.length > 0 && activeIndex > 0 && !offlineMode && (
        <button
          type="button"
          onClick={showNewClips}
          className="fixed top-24 lg:top-20 left-1/2 lg:left-[calc(50%+2.5rem)] xl:left-[calc(50%+8rem)] -translate-x-1/2 z-[45] px-4 py-2 rounded-full bg-amber-500 text-black text-xs font-extrabold tracking-tight shadow-xl hover:bg-amber-400 transition-colors animate-[fadeIn_0.2s_ease-out]"
        >
          ↑ New clips available
        </button>
      )}

      {offlineMode && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 lg:left-[calc(50%+2.5rem)] xl:left-[calc(50%+8rem)] -translate-x-1/2 z-[45] px-4 py-2 rounded-full bg-zinc-900/90 border border-zinc-700 text-neutral-200 text-xs font-bold tracking-tight shadow-xl pointer-events-none">
          Offline · {videos.length ? 'showing saved clips' : 'no saved clips yet'}
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
