'use client';

import BackButton from '@/components/BackButton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { ALLOWED_CIRCLES } from '../../lib/circles';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  CreatorCard,
  CreatorStripSkeleton,
  EmptyState,
  ErrorState,
  HashtagCard,
  HashtagGridSkeleton,
  SectionHeader,
  SoundRow,
  UserListSkeleton,
  UserRow,
  VideoGridSkeleton,
  VideoMasonry,
} from '../../components/search/SearchParts';

const TABS = [
  { id: 'top', label: 'Top' },
  { id: 'users', label: 'Users' },
  { id: 'videos', label: 'Videos' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'hashtags', label: 'Hashtags' },
];

const RECENTS_KEY = 'clippulse.recentSearches';
const RECENTS_MAX = 10;
const RECENTS_VISIBLE = 5;
const EMPTY_RESULTS = { users: [], videos: [], hashtags: [], sounds: [] };

// --- recent searches (localStorage, defensive against bad JSON / blocked storage)

function readRecents() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === 'string').slice(0, RECENTS_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeRecents(list) {
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // storage full / blocked (private mode): recents just won't persist
  }
}

// Fallback used only when the backend doesn't return hashtag counts (older
// deployment): tallies #tags from the captions already loaded.
function deriveHashtags(videos, contains = '') {
  const needle = contains.replace(/^#/, '').toLowerCase();
  const counts = new Map();
  videos.forEach((v) => {
    const tags = new Set(
      (v.caption?.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1).toLowerCase())
    );
    tags.forEach((t) => {
      if (!needle || t.includes(needle)) counts.set(t, (counts.get(t) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);
}

export default function SearchPage() {
  const router = useRouter();
  const toast = useToast();
  const { user: me, isAuthenticated } = useAuth();

  const [q, setQ] = useState('');
  const [tab, setTab] = useState('top');
  const inputRef = useRef(null);

  const [results, setResults] = useState(EMPTY_RESULTS);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [retryKey, setRetryKey] = useState(0);

  // Default (no-query) feeds. `null` means "still loading".
  const [trendingVideos, setTrendingVideos] = useState(null);
  const [trendingTags, setTrendingTags] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [trendingSounds, setTrendingSounds] = useState(null);
  const [defaultsFailed, setDefaultsFailed] = useState(false);

  const [recents, setRecents] = useState([]);
  const [showAllRecents, setShowAllRecents] = useState(false);

  // Follow state layered over whatever the server last reported.
  const [followOverrides, setFollowOverrides] = useState({});
  const [followPending, setFollowPending] = useState({});

  const term = q.trim();
  const hasQuery = term.length > 0;

  // --- mount: focus + recents ----------------------------------------------
  useEffect(() => {
    inputRef.current?.focus();
    setRecents(readRecents());
  }, []);

  // --- default feeds -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([api.getTrending(), api.getTrendingHashtags()]).then(([vids, tags]) => {
      if (cancelled) return;
      const videos = vids.status === 'fulfilled' && Array.isArray(vids.value) ? vids.value : [];
      setTrendingVideos(videos);
      setTrendingTags(
        tags.status === 'fulfilled' && Array.isArray(tags.value)
          ? tags.value
          : deriveHashtags(videos)
      );
      setDefaultsFailed(vids.status === 'rejected' && tags.status === 'rejected');
    });

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  // Suggested creators need a logged-in user (the endpoint is auth-only).
  useEffect(() => {
    if (!isAuthenticated) {
      setSuggested([]);
      return undefined;
    }
    let cancelled = false;
    api
      .getSuggestedUsers(12)
      .then((list) => {
        if (cancelled) return;
        setSuggested(
          (Array.isArray(list) ? list : []).map((u) => ({
            id: u.id,
            username: u.username,
            avatarUrl: u.avatarUrl,
            creatorStatus: u.creatorStatus,
            followerCount: u._count?.followers,
            isFollowing: false, // endpoint only returns people you don't follow yet
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setSuggested([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Trending sounds load the first time the Sounds tab is opened.
  useEffect(() => {
    if (tab !== 'sounds' || trendingSounds !== null) return undefined;
    let cancelled = false;
    api
      .getTrendingSounds({ limit: 20 })
      .then((list) => {
        if (!cancelled) setTrendingSounds(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setTrendingSounds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, trendingSounds]);

  // --- debounced search ------------------------------------------------------------
  useEffect(() => {
    if (!term) {
      setResults(EMPTY_RESULTS);
      setStatus('idle');
      return undefined;
    }

    setStatus('loading');
    let cancelled = false;

    const timer = setTimeout(async () => {
      const [main, sounds] = await Promise.allSettled([
        api.search(term),
        api.searchTracks(term.replace(/^[#@]/, '')),
      ]);
      if (cancelled) return;

      if (main.status === 'rejected') {
        setResults(EMPTY_RESULTS);
        setStatus('error');
        return;
      }

      const data = main.value || {};
      const videos = data.videos || [];
      setResults({
        users: data.users || [],
        videos,
        hashtags: Array.isArray(data.hashtags) ? data.hashtags : deriveHashtags(videos, term),
        sounds: sounds.status === 'fulfilled' && Array.isArray(sounds.value) ? sounds.value : [],
      });
      setStatus('done');
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, retryKey]);

  // --- recents ---------------------------------------------------------------------------
  const saveRecent = useCallback((value) => {
    const v = value.trim();
    if (!v) return;
    setRecents((prev) => {
      const next = [v, ...prev.filter((r) => r.toLowerCase() !== v.toLowerCase())].slice(0, RECENTS_MAX);
      writeRecents(next);
      return next;
    });
  }, []);

  const removeRecent = (value) => {
    setRecents((prev) => {
      const next = prev.filter((r) => r !== value);
      writeRecents(next);
      return next;
    });
  };

  const clearRecents = () => {
    setRecents([]);
    setShowAllRecents(false);
    writeRecents([]);
  };

  // --- interactions ---------------------------------------------------------------------------
  const runSearch = (value, nextTab) => {
    setQ(value);
    if (nextTab) setTab(nextTab);
    saveRecent(value);
    inputRef.current?.focus();
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!hasQuery) return;
    saveRecent(term);
    inputRef.current?.blur(); // dismiss the keyboard so results are fully visible
  };

  const clearQuery = () => {
    setQ('');
    inputRef.current?.focus();
  };

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/');
  };

  const pickHashtag = (tag) => runSearch(`#${tag}`, 'videos');
  const rememberQuery = () => {
    if (hasQuery) saveRecent(term);
  };

  // --- follow ------------------------------------------------------------------------------------
  const followState = (u) => {
    const base = !!u.isFollowing;
    const following = followOverrides[u.id] ?? base;
    const delta = (following ? 1 : 0) - (base ? 1 : 0);
    return {
      following,
      pending: !!followPending[u.id],
      followerCount:
        typeof u.followerCount === 'number' ? Math.max(0, u.followerCount + delta) : undefined,
    };
  };

  const toggleFollow = async (u) => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (followPending[u.id]) return;

    const wasFollowing = followOverrides[u.id] ?? !!u.isFollowing;
    setFollowOverrides((p) => ({ ...p, [u.id]: !wasFollowing }));
    setFollowPending((p) => ({ ...p, [u.id]: true }));

    try {
      if (wasFollowing) await api.unfollowUser(u.id);
      else await api.followUser(u.id);
    } catch (err) {
      setFollowOverrides((p) => ({ ...p, [u.id]: wasFollowing }));
      toast.error(err?.message || 'Couldn’t update follow. Try again.');
    } finally {
      setFollowPending((p) => ({ ...p, [u.id]: false }));
    }
  };

  // Fallback terms for the empty state: real trending tags when there are
  // enough, otherwise the app's fixed interest circles.
  const suggestionTerms = useMemo(() => {
    const tags = (trendingTags || []).slice(0, 4).map((t) => `#${t.tag}`);
    return tags.length >= 3 ? tags : ALLOWED_CIRCLES.slice(0, 4);
  }, [trendingTags]);

  const retryDefaults = () => {
    setDefaultsFailed(false);
    setTrendingVideos(null);
    setTrendingTags(null);
    setRetryKey((k) => k + 1);
  };

  // --- render helpers ---------------------------------------------------------------------------
  const renderUsers = (list, limit) =>
    list.slice(0, limit).map((u) => (
      <UserRow
        key={u.id}
        user={u}
        followState={followState(u)}
        onToggleFollow={() => toggleFollow(u)}
        onOpen={rememberQuery}
        showFollow={me?.id !== u.id}
      />
    ));

  const renderTagGrid = (list, { limit, ranked }) => (
    <div className="grid grid-cols-2 gap-3">
      {list.slice(0, limit).map((t, i) => (
        <HashtagCard
          key={t.tag}
          tag={t.tag}
          count={t.count}
          rank={ranked ? i + 1 : null}
          onSelect={pickHashtag}
        />
      ))}
    </div>
  );

  // --- default (no query) panels -------------------------------------------------------------
  const recentsSection = recents.length > 0 && (
    <section className="mb-8" aria-label="Recent searches">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-white">Recent searches</h2>
        <button
          type="button"
          onClick={clearRecents}
          className="text-sm font-semibold text-amber-500 hover:text-amber-400 py-1 pl-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          Clear all
        </button>
      </div>
      <ul>
        {(showAllRecents ? recents : recents.slice(0, RECENTS_VISIBLE)).map((r) => (
          <li key={r} className="flex items-center">
            <button
              type="button"
              onClick={() => runSearch(r)}
              className="flex items-center gap-3 flex-1 min-w-0 h-11 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
            >
              <Clock className="w-5 h-5 text-neutral-400 shrink-0" aria-hidden="true" />
              <span className="text-base text-white truncate">{r}</span>
            </button>
            <button
              type="button"
              onClick={() => removeRecent(r)}
              aria-label={`Remove ${r} from recent searches`}
              className="w-11 h-11 flex items-center justify-center text-neutral-400 hover:text-white shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </li>
        ))}
      </ul>
      {recents.length > RECENTS_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAllRecents((s) => !s)}
          className="mt-1 text-sm font-semibold text-neutral-300 hover:text-white py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        >
          {showAllRecents ? 'Show fewer' : `Show ${recents.length - RECENTS_VISIBLE} more`}
        </button>
      )}
    </section>
  );

  const suggestedStrip = isAuthenticated && (suggested === null || suggested.length > 0) && (
    <section className="mb-8" aria-label="Suggested creators">
      <SectionHeader
        title="Suggested creators"
        actionLabel={suggested && suggested.length > 3 ? 'See all' : undefined}
        onAction={() => setTab('users')}
      />
      {suggested === null ? (
        <CreatorStripSkeleton />
      ) : (
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 snap-x snap-mandatory">
          {suggested.map((u) => (
            <CreatorCard
              key={u.id}
              user={u}
              followState={followState(u)}
              onToggleFollow={() => toggleFollow(u)}
              onOpen={rememberQuery}
              showFollow={me?.id !== u.id}
            />
          ))}
        </div>
      )}
    </section>
  );

  const hashtagsSection = (limit, withSeeAll) => (
    <section className="mb-8" aria-label="Trending hashtags">
      <SectionHeader
        title="Trending hashtags"
        actionLabel={
          withSeeAll && trendingTags && trendingTags.length > limit ? 'See all' : undefined
        }
        onAction={() => setTab('hashtags')}
      />
      {trendingTags === null ? (
        <HashtagGridSkeleton count={6} />
      ) : trendingTags.length === 0 ? (
        <p className="text-sm text-neutral-400 py-2">
          No hashtags yet. Add #tags to a caption and they’ll show up here.
        </p>
      ) : (
        renderTagGrid(trendingTags, { limit, ranked: true })
      )}
    </section>
  );

  const videosSection = (
    <section aria-label="Trending videos">
      <SectionHeader title="Trending videos" />
      {trendingVideos === null ? (
        <VideoGridSkeleton />
      ) : trendingVideos.length === 0 ? (
        <p className="text-sm text-neutral-400 py-2">
          No videos are trending yet. Post one to get things started.
        </p>
      ) : (
        <VideoMasonry videos={trendingVideos} onOpen={rememberQuery} />
      )}
    </section>
  );

  const defaultPanel = () => {
    if (defaultsFailed) return <ErrorState onRetry={retryDefaults} />;

    switch (tab) {
      case 'users':
        if (!isAuthenticated) {
          return (
            <EmptyState
              title="Find creators"
              hint="Search by username, or log in to get suggestions based on who you follow."
            />
          );
        }
        return (
          <section aria-label="Suggested creators">
            <SectionHeader title="Suggested creators" />
            {suggested === null ? (
              <UserListSkeleton />
            ) : suggested.length === 0 ? (
              <EmptyState title="No suggestions yet" hint="Search for a creator by username." />
            ) : (
              <div className="divide-y divide-neutral-800/80">{renderUsers(suggested, 50)}</div>
            )}
          </section>
        );
      case 'videos':
        return videosSection;
      case 'sounds':
        return (
          <section aria-label="Trending sounds">
            <SectionHeader title="Trending sounds" />
            {trendingSounds === null ? (
              <UserListSkeleton rows={5} />
            ) : trendingSounds.length === 0 ? (
              <EmptyState
                title="No sounds yet"
                hint="Sounds uploaded by artists will appear here."
              />
            ) : (
              <div className="divide-y divide-neutral-800/80">
                {trendingSounds.map((s) => (
                  <SoundRow key={s.id} sound={s} />
                ))}
              </div>
            )}
          </section>
        );
      case 'hashtags':
        return hashtagsSection(20, false);
      case 'top':
      default:
        return (
          <>
            {hashtagsSection(6, true)}
            {suggestedStrip}
            {videosSection}
          </>
        );
    }
  };

  // --- result panels ------------------------------------------------------------------------------
  const resultsPanel = () => {
    if (status === 'error') return <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />;

    const loading = status !== 'done';
    const { users, videos, hashtags, sounds } = results;

    const empty = (label) => (
      <EmptyState
        title={`No ${label} for “${term}”`}
        hint="Check the spelling or try a different keyword."
        suggestions={suggestionTerms}
        onPickSuggestion={(s) => runSearch(s)}
      />
    );

    if (tab === 'users') {
      if (loading) return <UserListSkeleton />;
      return users.length ? (
        <div className="divide-y divide-neutral-800/80">{renderUsers(users, 50)}</div>
      ) : (
        empty('users')
      );
    }

    if (tab === 'videos') {
      if (loading) return <VideoGridSkeleton />;
      return videos.length ? (
        <VideoMasonry videos={videos} onOpen={rememberQuery} />
      ) : (
        empty('videos')
      );
    }

    if (tab === 'sounds') {
      if (loading) return <UserListSkeleton rows={4} />;
      return sounds.length ? (
        <div className="divide-y divide-neutral-800/80">
          {sounds.map((s) => (
            <SoundRow key={s.id} sound={s} />
          ))}
        </div>
      ) : (
        empty('sounds')
      );
    }

    if (tab === 'hashtags') {
      if (loading) return <HashtagGridSkeleton />;
      return hashtags.length ? renderTagGrid(hashtags, { limit: 20, ranked: false }) : empty('hashtags');
    }

    // Top
    if (loading) {
      return (
        <>
          <UserListSkeleton rows={3} />
          <div className="mt-6">
            <VideoGridSkeleton />
          </div>
        </>
      );
    }
    if (!users.length && !videos.length && !hashtags.length && !sounds.length) {
      return empty('results');
    }

    return (
      <>
        {users.length > 0 && (
          <section className="mb-8" aria-label="Users">
            <SectionHeader
              title="Users"
              actionLabel={users.length > 3 ? 'See all' : undefined}
              onAction={() => setTab('users')}
            />
            <div className="divide-y divide-neutral-800/80">{renderUsers(users, 3)}</div>
          </section>
        )}
        {hashtags.length > 0 && (
          <section className="mb-8" aria-label="Hashtags">
            <SectionHeader
              title="Hashtags"
              actionLabel={hashtags.length > 2 ? 'See all' : undefined}
              onAction={() => setTab('hashtags')}
            />
            {renderTagGrid(hashtags, { limit: 2, ranked: false })}
          </section>
        )}
        {sounds.length > 0 && (
          <section className="mb-8" aria-label="Sounds">
            <SectionHeader
              title="Sounds"
              actionLabel={sounds.length > 2 ? 'See all' : undefined}
              onAction={() => setTab('sounds')}
            />
            <div className="divide-y divide-neutral-800/80">
              {sounds.slice(0, 2).map((s) => (
                <SoundRow key={s.id} sound={s} />
              ))}
            </div>
          </section>
        )}
        {videos.length > 0 && (
          <section aria-label="Videos">
            <SectionHeader
              title="Videos"
              actionLabel={videos.length > 6 ? 'See all' : undefined}
              onAction={() => setTab('videos')}
            />
            <VideoMasonry videos={videos.slice(0, 6)} onOpen={rememberQuery} />
          </section>
        )}
      </>
    );
  };

  // --- layout -----------------------------------------------------------------------------------------
  return (
    <main className="min-h-screen px-4 pt-3 pb-36 max-w-2xl mx-auto">
      <header className="flex items-center justify-between h-11">
        <BackButton onClick={goBack} />
        <h1 className="text-base font-bold text-white">Search</h1>
        {/* spacer keeps the title centred against the back button */}
        <span className="w-10" aria-hidden="true" />
      </header>

      {/* Search bar + tabs stay pinned while results scroll */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-2 bg-ink/95 backdrop-blur">
        <form role="search" onSubmit={onSubmit} className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search creators and videos"
            aria-label="Search creators and videos"
            className="w-full appearance-none bg-neutral-800/80 border-none outline-none focus:ring-2 focus:ring-amber-500 text-white rounded-full pl-12 pr-12 py-3 text-base placeholder:text-neutral-400 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {q.length > 0 && (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-neutral-600/70 text-white flex items-center justify-center hover:bg-neutral-500/70 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
        </form>

        <div
          role="tablist"
          aria-label="Search categories"
          className="mt-2 flex gap-5 overflow-x-auto no-scrollbar border-b border-neutral-800"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                id={`search-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="search-panel"
                onClick={() => setTab(t.id)}
                className={`shrink-0 py-3 -mb-px text-sm border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-t ${
                  active
                    ? 'border-amber-500 text-white font-bold tracking-wide'
                    : 'border-transparent text-neutral-400 font-semibold hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id="search-panel"
        role="tabpanel"
        aria-labelledby={`search-tab-${tab}`}
        aria-busy={status === 'loading'}
        className="pt-5"
      >
        {hasQuery ? (
          resultsPanel()
        ) : (
          <>
            {recentsSection}
            {defaultPanel()}
          </>
        )}
      </div>
    </main>
  );
}
