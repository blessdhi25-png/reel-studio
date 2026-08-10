'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MoreHorizontal, Settings, Menu as MenuIcon, Share2, Home, Lock } from 'lucide-react';
import { api, getStoredUser } from '../../../lib/api';
import ReportModal from '../../../components/ReportModal';

export default function ProfilePage({ params }) {
  const { id } = params;
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [savedVideos, setSavedVideos] = useState([]);
  const [likedVideos, setLikedVideos] = useState([]);
  const [isSelf, setIsSelf] = useState(false);
  const [following, setFollowing] = useState(false);
  const [privateLocked, setPrivateLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('videos');
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const storedUser = getStoredUser();
    const self = !!(storedUser && storedUser.id === id);
    setIsSelf(self);

    api
      .getUser(id)
      .then((u) => {
        setUser(u);
        setFollowing(!!u.isFollowing);
        return api.getUserVideos(id).catch((err) => {
          if (err.message === 'This account is private') {
            setPrivateLocked(true);
            return [];
          }
          return [];
        });
      })
      .then((v) => setVideos(v))
      .catch(() => {})
      .finally(() => setLoading(false));

    if (self) {
      api.getBookmarks().then(setSavedVideos).catch(() => {});
      api.getLikedVideos().then(setLikedVideos).catch(() => {});
    }
  }, [id]);

  async function toggleFollow() {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    const next = !following;
    setFollowing(next);
    try {
      next ? await api.followUser(id) : await api.unfollowUser(id);
    } catch {
      setFollowing(!next);
    }
  }

  function handleLogout() {
    if (!confirm('Are you sure you want to log out?')) return;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  const activeVideos = activeTab === 'videos' ? videos : activeTab === 'saved' ? savedVideos : likedVideos;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a090e] text-white flex items-center justify-center">
        <p className="text-xs text-zinc-500 font-mono">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a090e] text-white flex items-center justify-center">
        <p className="text-xs text-zinc-500 font-mono">User not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a090e] text-white pb-24 font-sans max-w-md mx-auto">
      {/* Banner */}
      <div className="h-32 w-full bg-zinc-900 relative overflow-hidden">
        {user.bannerUrl && (
          <img src={user.bannerUrl} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-x-0 top-0 px-4 pt-3 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-1 text-[11px] font-mono tracking-widest text-emerald-400 hover:text-emerald-300 uppercase bg-black/40 rounded-lg px-2 py-1"
          >
            <ArrowLeft size={12} />
            <span>Feed</span>
          </Link>

          <div className="flex items-center gap-2 relative">
            {isSelf ? (
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 rounded-xl border border-zinc-800 bg-black/40 text-rose-400 text-xs hover:bg-zinc-800 transition-colors"
              >
                Log out
              </button>
            ) : null}
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-1 text-zinc-200 hover:text-white bg-black/40 rounded-lg"
            >
              <MoreHorizontal size={20} />
            </button>
            {showMenu && !isSelf && (
              <div className="absolute right-0 top-9 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden z-10 w-40">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowReport(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  Report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-2">
        {/* User Identity */}
        <div className="flex items-center gap-4 mb-3 -mt-10">
          <div className="w-20 h-20 rounded-full border-2 border-[#0a090e] bg-zinc-900 flex items-center justify-center shrink-0 overflow-hidden">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-amber-500 font-black text-2xl">
                {(user.displayName || user.username)?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="mb-4">
          <h1 className="text-xl font-black tracking-wider text-white uppercase">
            {user.displayName || user.username}
          </h1>
          <p className="text-xs text-zinc-500 font-mono">@{user.username}</p>
          {user.bio && <p className="text-sm text-zinc-300 mt-2">{user.bio}</p>}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-3 text-center mb-4">
          <div>
            <p className="text-base font-bold text-white">{user._count?.following ?? 0}</p>
            <p className="text-[10px] text-zinc-400 font-medium">Following</p>
          </div>
          <div>
            <p className="text-base font-bold text-white">{user._count?.followers ?? 0}</p>
            <p className="text-[10px] text-zinc-400 font-medium">Followers</p>
          </div>
          <div>
            <p className="text-base font-bold text-white">{user._count?.videos ?? 0}</p>
            <p className="text-[10px] text-zinc-400 font-medium">Videos</p>
          </div>
          <div>
            <p className="text-base font-bold text-white">{user.totalLikes ?? 0}</p>
            <p className="text-[10px] text-zinc-400 font-medium">Likes</p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        {isSelf ? (
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Link
              href="/profile/edit"
              className="flex items-center justify-center py-2.5 rounded-xl bg-amber-500 text-black text-xs font-extrabold tracking-wide hover:bg-amber-400 transition-all"
            >
              Edit Profile
            </Link>
            <Link
              href="/studio"
              className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-amber-500 text-xs font-bold hover:bg-zinc-800 transition-all"
            >
              <Home size={14} />
              <span>Studio</span>
            </Link>
            <button
              onClick={() => navigator.share?.({ url: window.location.href }).catch(() => {})}
              className="flex items-center justify-center py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-all"
            >
              <Share2 size={16} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-2">
            <button
              onClick={toggleFollow}
              className={`py-2.5 rounded-xl text-xs font-extrabold tracking-wide transition-all ${
                following
                  ? 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                  : 'bg-amber-500 text-black hover:bg-amber-400'
              }`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
            <button
              onClick={() => router.push(`/messages/${user.id}`)}
              className="py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-amber-500 text-xs font-bold hover:bg-zinc-800 transition-all"
            >
              Message
            </button>
            <button
              onClick={() => navigator.share?.({ url: window.location.href }).catch(() => {})}
              className="flex items-center justify-center py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-all"
            >
              <Share2 size={16} />
            </button>
          </div>
        )}

        {/* Secondary Action Row: Settings & Menu (self only) */}
        {isSelf && (
          <div className="grid grid-cols-2 gap-2 mb-5">
            <Link
              href="/settings"
              className="flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
            >
              <Settings size={14} className="text-amber-500" />
              <span>Settings</span>
            </Link>
            <Link
              href="/menu"
              className="flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-800 transition-all"
            >
              <MenuIcon size={14} className="text-amber-500" />
              <span>Menu</span>
            </Link>
          </div>
        )}

        {privateLocked && !isSelf ? (
          <div className="py-16 text-center">
            <Lock size={28} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-400">This account is private.</p>
            <p className="text-xs text-zinc-600 mt-1">Follow to see their videos.</p>
          </div>
        ) : (
          <>
            {/* Content Tabs */}
            <div
              className={`grid ${isSelf ? 'grid-cols-3' : 'grid-cols-1'} bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-1 mb-6`}
            >
              <button
                onClick={() => setActiveTab('videos')}
                className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'videos' ? 'bg-amber-500 text-black shadow-md' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Videos
              </button>
              {isSelf && (
                <>
                  <button
                    onClick={() => setActiveTab('saved')}
                    className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      activeTab === 'saved' ? 'bg-amber-500 text-black shadow-md' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Saved
                  </button>
                  <button
                    onClick={() => setActiveTab('liked')}
                    className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      activeTab === 'liked' ? 'bg-amber-500 text-black shadow-md' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Liked
                  </button>
                </>
              )}
            </div>

            {/* Tab Content area */}
            {activeVideos.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500 font-mono">
                {activeTab === 'videos' && 'No videos posted yet.'}
                {activeTab === 'saved' && 'Nothing saved yet.'}
                {activeTab === 'liked' && 'Nothing liked yet.'}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {activeVideos.map((v) => (
                  <a
                    key={v.id}
                    href={`/?video=${v.id}`}
                    className="aspect-[9/16] bg-zinc-900 rounded-lg overflow-hidden relative"
                  >
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600 font-mono">
                        {v.status === 'processing' ? 'Processing…' : 'No thumbnail'}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showReport && (
        <ReportModal targetType="user" targetId={user.id} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}
