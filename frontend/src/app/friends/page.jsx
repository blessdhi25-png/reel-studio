'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingScreen';

const TABS = [
  { value: 'following', label: 'Following' },
  { value: 'mutual', label: 'Mutual Friends' },
  { value: 'suggested', label: 'Suggested' },
];

function abbreviate(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(num);
}

// "just now", "5m ago", "3h ago", "2d ago", then a short date. `now` comes from
// a ticking clock in the page, so timestamps stay current while it's open.
function timeAgo(iso, now) {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Segmented control with a pill that slides to the active tab.
function TabPills({ tabs, value, onChange }) {
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));
  return (
    <div
      role="tablist"
      aria-label="Friends sections"
      className="relative grid grid-cols-3 w-full sm:w-96 bg-neutral-900 border border-neutral-800 rounded-full p-1"
    >
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-full bg-amber-500 shadow-md transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: 'calc((100% - 0.5rem) / 3)', transform: `translateX(${index * 100}%)` }}
      />
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`relative z-10 py-2 rounded-full text-[13px] sm:text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              active ? 'text-black font-bold' : 'text-neutral-400 font-semibold hover:text-white'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7.5-4.9-10-9.3C.4 8 2 4.5 5.6 4c2.1-.3 4 .8 5.4 2.7C12.4 4.8 14.3 3.7 16.4 4c3.6.5 5.2 4 3.6 7.7C17.5 16.1 12 21 12 21Z" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.9 8.4A9 9 0 0 1 4 18l-2 1 1-3.4A8.4 8.4 0 1 1 21 11.5Z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function FriendVideoCard({ video, now, onToast }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(Number(video.likeCount) || 0);
  const creatorId = video.user?.id ?? video.userId;
  const username = video.user?.username;
  const watchHref = `/?video=${video.id}`;

  async function toggleLike() {
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    const was = liked;
    setLiked(!was);
    setLikeCount((c) => (was ? c - 1 : c + 1));
    try {
      was ? await api.unlikeVideo(video.id) : await api.likeVideo(video.id);
    } catch {
      setLiked(was);
      setLikeCount((c) => (was ? c + 1 : c - 1));
    }
  }

  function share() {
    navigator.clipboard
      .writeText(`${window.location.origin}${watchHref}`)
      .then(() => onToast('Link copied'))
      .catch(() => onToast('Could not copy link'));
  }

  const posted = timeAgo(video.createdAt, now);

  // Not one big link: avatar, caption and the action buttons are separate
  // targets, so nothing interactive is nested inside another link.
  return (
    <article className="flex gap-4 bg-neutral-900/90 rounded-2xl p-4 border border-neutral-800 shadow-lg">
      <a
        href={watchHref}
        aria-label="Watch video"
        className="w-20 h-28 shrink-0 rounded-xl overflow-hidden bg-neutral-800"
      >
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : video.videoUrl ? (
          <video src={video.videoUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" />
        ) : null}
      </a>

      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-1.5">
          <a
            href={`/profile/${creatorId}`}
            aria-label={`View ${username ? `@${username}` : 'creator'}’s profile`}
            className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center text-xs font-bold text-amber-400 ring-1 ring-neutral-700 hover:ring-amber-500 transition-shadow"
          >
            {video.user?.avatarUrl ? (
              <img src={video.user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              username?.[0]?.toUpperCase()
            )}
          </a>
          <a href={`/profile/${creatorId}`} className="min-w-0 flex-1 text-sm font-semibold text-white truncate hover:underline">
            @{username}
          </a>
          {posted && (
            <time
              dateTime={new Date(video.createdAt).toISOString()}
              title={new Date(video.createdAt).toLocaleString()}
              className="text-xs text-neutral-500 shrink-0"
            >
              {posted}
            </time>
          )}
        </div>

        <a href={watchHref} className="text-sm text-neutral-100 line-clamp-2 flex-1">
          {video.caption || '(no caption)'}
        </a>

        <div className="flex items-center gap-5 mt-2">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            aria-label={liked ? 'Unlike' : 'Like'}
            className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${liked ? 'text-amber-400' : 'text-neutral-400 hover:text-white'}`}
          >
            <HeartIcon filled={liked} /> {abbreviate(likeCount)}
          </button>
          <a href={watchHref} aria-label="Comments" className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-white">
            <CommentIcon /> {abbreviate(video.commentCount)}
          </a>
          <button type="button" onClick={share} className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 hover:text-white">
            <ShareIcon /> Share
          </button>
        </div>
      </div>
    </article>
  );
}

function SuggestedCard({ person, following, onToggleFollow }) {
  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-col items-center text-center hover:border-zinc-700 transition-all">
      <a href={`/profile/${person.id}`} className="w-16 h-16 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center font-display text-xl text-amber-400 mb-3">
        {person.avatarUrl ? (
          <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          person.username?.[0]?.toUpperCase()
        )}
      </a>
      <a href={`/profile/${person.id}`} className="font-body text-sm font-semibold text-white truncate max-w-full">
        @{person.username}
      </a>
      {person.bio && <p className="font-body text-xs text-zinc-500 mt-1 line-clamp-2">{person.bio}</p>}
      <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-2">
        {person.mutualCount > 0
          ? `Followed by @${person.mutualSample}${person.mutualCount > 1 ? ` + ${person.mutualCount - 1} others` : ''}`
          : `${abbreviate(person._count?.followers)} followers`}
      </p>
      <button
        onClick={() => onToggleFollow(person.id)}
        className={
          following
            ? 'w-full mt-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-semibold py-2 px-4 rounded-xl transition-all'
            : 'w-full mt-4 bg-amber-500 hover:bg-amber-400 text-black font-bold py-2 px-4 rounded-xl transition-all'
        }
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

function SuggestedGrid({ people, followingIds, onToggleFollow, heading }) {
  if (people.length === 0) return null;
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl space-y-6">
      <div>
        <p className="text-3xl mb-2">🌐</p>
        <h2 className="font-display text-xl text-white tracking-wide">{heading}</h2>
        <p className="font-body text-zinc-500 text-sm mt-1">
          Follow a few creators to start seeing their videos here.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-left">
        {people.map((p) => (
          <SuggestedCard
            key={p.id}
            person={p}
            following={followingIds.has(p.id)}
            onToggleFollow={onToggleFollow}
          />
        ))}
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const [tab, setTab] = useState('following'); // defaults here, not 'mutual' — more likely to have content on a first visit
  const [me, setMe] = useState(null);
  const [followingList, setFollowingList] = useState([]);
  const [followerIds, setFollowerIds] = useState(new Set());
  const [suggested, setSuggested] = useState([]);
  const [followingFeed, setFollowingFeed] = useState([]);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [followBusy, setFollowBusy] = useState(new Set());
  // Ticks once a minute so "5m ago" labels stay current while the page is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setMe(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!me) return;
    setLoading(true);
    Promise.all([
      api.getFollowing(me.id).catch(() => []),
      api.getFollowers(me.id).catch(() => []),
      api.getSuggestedUsers(12).catch(() => []),
      api.getFeed(null, null, null, null, true).catch(() => ({ videos: [] })),
    ]).then(([following, followers, sug, feed]) => {
      setFollowingList(following);
      setFollowerIds(new Set(followers.map((u) => u.id)));
      setSuggested(sug);
      setFollowingFeed(feed.videos || []);
      setLoading(false);

      const traySampleIds = following.slice(0, 20).map((u) => u.id);
      if (traySampleIds.length) {
        api.getOnlineStatus(traySampleIds).then((r) => setOnlineIds(new Set(r.onlineIds))).catch(() => {});
      }
    });
  }, [me]);

  const followingIdSet = useMemo(() => new Set(followingList.map((u) => u.id)), [followingList]);
  const mutualFriends = useMemo(
    () => followingList.filter((u) => followerIds.has(u.id)),
    [followingList, followerIds]
  );
  const mutualIdSet = useMemo(() => new Set(mutualFriends.map((u) => u.id)), [mutualFriends]);

  const trayPeople = mutualFriends.length > 0 ? mutualFriends : followingList;

  async function handleToggleFollow(userId) {
    if (followBusy.has(userId)) return;
    const isFollowing = followingIdSet.has(userId);
    setFollowBusy((prev) => new Set(prev).add(userId));
    try {
      if (isFollowing) {
        await api.unfollowUser(userId);
        setFollowingList((prev) => prev.filter((u) => u.id !== userId));
      } else {
        await api.followUser(userId);
        const person = suggested.find((p) => p.id === userId);
        setFollowingList((prev) => [...prev, { id: userId, username: person?.username, avatarUrl: person?.avatarUrl }]);
      }
    } catch (err) {
      flashToast(err.message);
    } finally {
      setFollowBusy((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  const feedForTab =
    tab === 'mutual' ? followingFeed.filter((v) => mutualIdSet.has(v.userId)) : followingFeed;

  return (
    <main className="min-h-screen pb-28">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto p-6 md:p-8">
        {/* ── Header ── */}
        <div className="lg:col-span-12 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-sans text-2xl font-extrabold tracking-tight text-white">Friends &amp; Activity Hub</h1>
            <div className="mt-4">
              <TabPills tabs={TABS} value={tab} onChange={setTab} />
            </div>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-neutral-300 hover:text-white bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-full transition-colors self-start"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" /> Back to feed
          </a>
        </div>

        {/* ── Left: tray + content ── */}
        <div className="lg:col-span-8 space-y-6">
          {/* Active friends tray */}
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
            <a href="/upload" className="flex flex-col items-center gap-1.5 shrink-0">
              <span className="relative w-16 h-16 rounded-full border-2 border-zinc-700 p-0.5">
                <span className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden font-display text-lg text-zinc-400">
                  {me?.avatarUrl ? <img src={me.avatarUrl} alt="" className="w-full h-full object-cover" /> : 'Y'}
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-500 text-black flex items-center justify-center text-xs font-bold border-2 border-zinc-950">
                  +
                </span>
              </span>
              <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Your story</span>
            </a>

            {trayPeople.slice(0, 15).map((p) => (
              <a key={p.id} href={`/profile/${p.id}`} className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer">
                <span className="w-16 h-16 rounded-full border-2 border-amber-500 p-0.5 relative">
                  <span className="w-full h-full rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center font-display text-lg text-amber-400">
                    {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : p.username?.[0]?.toUpperCase()}
                  </span>
                  {onlineIds.has(p.id) && (
                    <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-zinc-950" />
                  )}
                </span>
                <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest group-hover:text-white truncate max-w-[4.5rem]">
                  @{p.username}
                </span>
              </a>
            ))}
          </div>

          {/* Content */}
          {loading && <LoadingSpinner label="Loading…" />}

          {!loading && tab === 'suggested' && (
            <SuggestedGrid
              people={suggested.slice(0, 6)}
              followingIds={followingIdSet}
              onToggleFollow={handleToggleFollow}
              heading="Find Friends & Discover Creators"
            />
          )}

          {!loading && tab !== 'suggested' && (
            feedForTab.length > 0 ? (
              <div className="space-y-3">
                {feedForTab.map((v) => (
                  <FriendVideoCard key={v.id} video={v} now={now} onToast={flashToast} />
                ))}
              </div>
            ) : (
              <SuggestedGrid
                people={suggested.slice(0, 6)}
                followingIds={followingIdSet}
                onToggleFollow={handleToggleFollow}
                heading="Find Friends & Discover Creators"
              />
            )
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4">
            <p className="font-display text-sm text-white tracking-wide mb-3">People You May Know</p>
            {suggested.length === 0 && <p className="font-body text-xs text-zinc-500">Nothing to show yet.</p>}
            <div className="space-y-3">
              {suggested.slice(6, 12).map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <a href={`/profile/${p.id}`} className="w-9 h-9 rounded-full overflow-hidden bg-zinc-800 shrink-0 flex items-center justify-center font-display text-xs text-amber-400">
                    {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : p.username?.[0]?.toUpperCase()}
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={`/profile/${p.id}`} className="font-body text-xs font-semibold text-white truncate block">
                      @{p.username}
                    </a>
                    {p.mutualCount > 0 && (
                      <p className="font-mono text-[10px] text-zinc-500 truncate">{p.mutualCount} mutual</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleFollow(p.id)}
                    className="font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/40 shrink-0"
                  >
                    Follow
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Real, functional alternative to a fake "contact sync" — searches actual accounts */}
          <a
            href="/search"
            className="bg-zinc-800/50 border border-zinc-700/60 p-4 rounded-2xl flex items-center justify-between hover:border-zinc-600 transition-colors"
          >
            <div>
              <p className="font-body text-sm font-semibold text-white">Find people</p>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                Search creators &amp; captions
              </p>
            </div>
            <span className="text-zinc-400"><SearchIcon /></span>
          </a>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900 text-white font-body text-xs px-4 py-2 rounded-xl border border-zinc-800 z-40 shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}
