'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import ReportModal from '../../../components/ReportModal';

function StudioIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V9l8-5 8 5v10a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.5 15.4 6.5M8.6 13.5 15.4 17.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function abbreviate(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export default function ProfilePage({ params }) {
  const { id } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logout: authLogout } = useAuth();
  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [likedVideos, setLikedVideos] = useState([]);
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return t === 'saved' || t === 'liked' ? t : 'videos';
  });
  const [isSelf, setIsSelf] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [toast, setToast] = useState(null);
  const [privateLocked, setPrivateLocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  function logout() {
    authLogout();
    router.push('/login');
  }

  function copyProfileLink() {
    const url = `${window.location.origin}/profile/${id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => flashToast('Profile link copied'))
      .catch(() => flashToast('Could not copy link'));
  }

  function flashToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem('user');
    const localUser = stored ? JSON.parse(stored) : null;
    const self = !!localUser && localUser.id === id;
    setIsSelf(self);

    async function load() {
      setLoading(true);
      setLoadError(null);
      setUsingLocalFallback(false);
      setPrivateLocked(false);

      try {
        const u = await api.getUser(id);
        if (cancelled) return;
        setUser(u);
        setBlocked(!!u.blockedByMe);

        // A broken /videos request shouldn't take down the rest of the
        // profile — the header, follow button, etc. should still render
        // even if the grid can't load.
        try {
          const v = await api.getUserVideos(id);
          if (!cancelled) setVideos(v);
        } catch (err) {
          if (err.message === 'This account is private') {
            if (!cancelled) setPrivateLocked(true);
          }
          // Any other failure here just leaves the grid empty — not fatal.
        }
      } catch (err) {
        if (cancelled) return;
        // Own profile, but the network/backend hiccupped: fall back to
        // whatever's cached in localStorage from login rather than showing
        // a dead end. It's stale/partial (no counts, no bio), but it's
        // enough to keep the page usable instead of stuck or blank.
        if (self && localUser) {
          setUser({
            id: localUser.id,
            username: localUser.username,
            displayName: localUser.displayName || localUser.username,
            avatarUrl: localUser.avatarUrl || null,
            bio: null,
            _count: { followers: 0, following: 0, videos: 0 },
          });
          setUsingLocalFallback(true);
        } else {
          setUser(null);
        }
        setLoadError(err.message || 'Could not load this profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    if (self) {
      api.getBookmarks().then((b) => !cancelled && setBookmarks(b)).catch(() => {});
      api.getLikedVideos().then((l) => !cancelled && setLikedVideos(l)).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [id, retryTick]);

  async function toggleFollow() {
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    setFollowing((prev) => !prev);
    try {
      following ? await api.unfollowUser(id) : await api.followUser(id);
    } catch {
      setFollowing((prev) => !prev);
    }
  }

  async function toggleBlock() {
    setBlockBusy(true);
    try {
      if (blocked) {
        await api.unblockUser(id);
        setBlocked(false);
        flashToast('Unblocked');
      } else {
        await api.blockUser(id);
        setBlocked(true);
        setFollowing(false);
        setConfirmBlock(false);
        flashToast('Blocked');
      }
    } catch (err) {
      flashToast(err.message);
    } finally {
      setBlockBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 animate-pulse">
        <div className="h-40 md:h-52 w-full bg-zinc-900 rounded-b-3xl" />
        <div className="max-w-3xl mx-auto px-6">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-zinc-800 border-4 border-zinc-950 -mt-12 md:-mt-16 ml-0" />
          <div className="mt-4 space-y-2">
            <div className="h-6 w-40 rounded bg-zinc-800" />
            <div className="h-4 w-24 rounded bg-zinc-800" />
          </div>
          <div className="h-16 w-64 rounded-2xl bg-zinc-900 mt-4" />
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 px-6">
        <div className="text-center">
          <p className="font-body text-zinc-400 mb-4">
            {loadError || 'User not found.'}
          </p>
          {loadError && (
            <button
              onClick={() => setRetryTick((t) => t + 1)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-xl text-sm font-medium"
            >
              Retry
            </button>
          )}
        </div>
      </main>
    );
  }

  const stats = [
    { label: 'Following', value: user._count?.following ?? 0 },
    { label: 'Followers', value: user._count?.followers ?? 0 },
    { label: 'Videos', value: user._count?.videos ?? videos.length },
    { label: 'Likes', value: user.totalLikes ?? 0 },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 pb-28">
      {usingLocalFallback && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-3">
          <p className="font-body text-xs text-amber-400">
            Showing cached profile info — couldn't reach the server for the latest data.
          </p>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="font-mono text-[10px] uppercase tracking-widest text-amber-300 hover:text-amber-200 shrink-0"
          >
            Retry
          </button>
        </div>
      )}      {/* Cover banner */}
      <div className="h-40 md:h-52 w-full bg-gradient-to-r from-amber-500/20 via-zinc-900 to-zinc-900 rounded-b-3xl border-b border-zinc-800 relative">
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <a href="/" className="font-mono text-xs text-zinc-300 uppercase tracking-widest bg-black/30 backdrop-blur px-2.5 py-1 rounded-lg">
            ← Feed
          </a>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More"
              className="text-zinc-200 bg-black/30 backdrop-blur p-1.5 rounded-lg"
            >
              <MoreIcon />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-30">
                {isSelf && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmLogout(true);
                    }}
                    className="w-full text-left px-4 py-2.5 font-body text-sm text-red-400 hover:bg-zinc-800"
                  >
                    Log out
                  </button>
                )}
                {!isSelf && !blocked && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowReport(true);
                    }}
                    className="w-full text-left px-4 py-2.5 font-body text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Report
                  </button>
                )}
                {!isSelf && !blocked && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmBlock(true);
                    }}
                    className="w-full text-left px-4 py-2.5 font-body text-sm text-red-400 hover:bg-zinc-800"
                  >
                    Block
                  </button>
                )}
                {!isSelf && blocked && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      toggleBlock();
                    }}
                    disabled={blockBusy}
                    className="w-full text-left px-4 py-2.5 font-body text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Unblock
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6">
        {/* Avatar overlapping the banner */}
        <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-zinc-950 shadow-2xl relative -mt-12 md:-mt-16 ml-0 bg-zinc-800 flex items-center justify-center font-display text-3xl text-amber-400 overflow-hidden">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
          ) : (
            user.username?.[0]?.toUpperCase()
          )}
        </div>

        {/* Name + badges + handle */}
        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl md:text-3xl text-white tracking-wide">
              {user.displayName || user.username}
            </h1>
            {user.creatorStatus && (
              <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
                Creator
              </span>
            )}
          </div>
          <p className="text-zinc-400 text-sm font-medium mt-0.5">@{user.username}</p>
        </div>

        {user.bio && <p className="font-body text-zinc-200 text-sm mt-3 max-w-md">{user.bio}</p>}

        {/* Stats bar */}
        <div className="flex gap-6 my-4 p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl w-fit">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-bold text-white leading-tight">{abbreviate(s.value)}</p>
              <p className="text-xs text-zinc-400 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Action toolbar */}
        {isSelf ? (
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <a
              href="/profile/edit"
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-xl transition-all shadow-md text-sm"
            >
              Edit Profile
            </a>
            <a
              href="/studio"
              className="bg-zinc-800/80 hover:bg-zinc-700 text-amber-400 border border-zinc-700 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
            >
              <StudioIcon />
              Studio
            </a>
            <button
              onClick={copyProfileLink}
              aria-label="Share profile"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-2.5 rounded-xl border border-zinc-700"
            >
              <ShareIcon />
            </button>
          </div>
        ) : (
          !blocked && (
            <div className="flex flex-wrap items-center gap-3 mb-8">
              <button
                onClick={toggleFollow}
                className={
                  following
                    ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-xl text-sm font-medium'
                    : 'bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-xl transition-all shadow-md text-sm'
                }
              >
                {following ? 'Following' : 'Follow'}
              </button>
              <a
                href={`/messages/${user.id}`}
                className="bg-zinc-800/80 hover:bg-zinc-700 text-amber-400 border border-zinc-700 px-4 py-2 rounded-xl text-sm font-medium"
              >
                Message
              </a>
              <button
                onClick={copyProfileLink}
                aria-label="Share profile"
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-2.5 rounded-xl border border-zinc-700"
              >
                <ShareIcon />
              </button>
            </div>
          )
        )}

        {blocked && (
          <div className="mb-8">
            <p className="font-body text-sm text-zinc-500 mb-3">You've blocked this account.</p>
            <button
              onClick={toggleBlock}
              disabled={blockBusy}
              className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              Unblock
            </button>
          </div>
        )}

        {showReport && (
          <ReportModal targetType="user" targetId={user.id} onClose={() => setShowReport(false)} />
        )}

        {confirmLogout && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-6">
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 max-w-sm w-full">
              <p className="font-body text-white text-base mb-1">Log out?</p>
              <p className="font-body text-zinc-400 text-sm mb-6">
                You'll need to sign back in to see your feed and profile.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmLogout(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={logout}
                  className="flex-1 bg-red-500/90 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-sm"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmBlock && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-6">
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 max-w-sm w-full">
              <p className="font-body text-white text-base mb-1">Block @{user.username}?</p>
              <p className="font-body text-zinc-400 text-sm mb-6">
                They won't be able to follow you, message you, or comment on your videos, and won't be
                able to find your profile. They won't be notified.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmBlock(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={toggleBlock}
                  disabled={blockBusy}
                  className="flex-1 bg-red-500/90 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
                >
                  Block
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900 text-white font-body text-xs px-4 py-2 rounded-xl border border-zinc-800 z-40 shadow-xl">
            {toast}
          </div>
        )}

        {privateLocked && !isSelf && (
          <p className="font-body text-zinc-500 text-sm mb-6">This account is private.</p>
        )}

        {/* Content tabs */}
        {(isSelf || !privateLocked) && (
          <>
            {isSelf && (
              <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-2xl max-w-xs mx-auto my-6 flex justify-between">
                <TabButton active={tab === 'videos'} onClick={() => setTab('videos')} label="Videos" />
                <TabButton active={tab === 'saved'} onClick={() => setTab('saved')} label="Saved" />
                <TabButton active={tab === 'liked'} onClick={() => setTab('liked')} label="Liked" />
              </div>
            )}

            <VideoGrid
              videos={tab === 'saved' ? bookmarks : tab === 'liked' ? likedVideos : videos}
              emptyLabel={
                tab === 'saved'
                  ? 'No saved videos yet.'
                  : tab === 'liked'
                  ? 'No liked videos yet.'
                  : 'No videos posted yet.'
              }
            />
          </>
        )}
      </div>
    </main>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 font-mono text-[11px] uppercase tracking-widest py-2 rounded-xl transition-colors ${
        active ? 'bg-amber-500 text-black font-bold' : 'text-zinc-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4.5v15l13-7.5-13-7.5Z" />
    </svg>
  );
}

function VideoGrid({ videos, emptyLabel }) {
  if (videos.length === 0) {
    return <p className="font-body text-zinc-500 text-sm text-center py-8">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {videos.map((v) => (
        <a
          key={v.id}
          href={`/?video=${v.id}`}
          className="aspect-[9/16] bg-zinc-900 rounded-2xl overflow-hidden relative group border border-zinc-800/80 hover:border-amber-500/50 transition-all"
        >
          {v.thumbnailUrl ? (
            <img src={v.thumbnailUrl} alt={v.caption} className="w-full h-full object-cover" />
          ) : v.videoUrl ? (
            // No generated thumbnail yet — fall back to the video's own first
            // frame instead of a text placeholder.
            <video
              src={v.videoUrl}
              muted
              playsInline
              preload="metadata"
              className="w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-mono text-[10px] text-zinc-500">
              {v.status === 'processing' ? 'Processing…' : 'No preview'}
            </div>
          )}

          <span className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-black/50 text-amber-400">
            {v.videoType === 'long' ? 'Feature' : 'Short'}
          </span>

          {/* Bottom gradient + view count — shows on hover */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
            <PlayIcon />
            {abbreviate(Number(v.viewCount) || 0)}
          </div>
        </a>
      ))}
    </div>
  );
}
