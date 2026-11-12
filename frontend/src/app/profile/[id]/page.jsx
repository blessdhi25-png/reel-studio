'use client';

import BackButton from '@/components/BackButton';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MoreHorizontal, Menu as MenuIcon, Share2, Lock, LayoutDashboard, Settings as SettingsIcon, PanelRight } from 'lucide-react';
import { api, getStoredUser } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import ReportModal from '@/components/ReportModal';
import ConfirmModal from '@/components/ConfirmModal';
import ProfileDrawer from '@/components/ProfileDrawer';
import { LoadingSpinner } from '@/components/LoadingScreen';

export default function ProfilePage({ params }) {
  const { id } = params;
  const router = useRouter();
  const toast = useToast();

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
  const [isMenuOpen, setIsMenuOpen] = useState(false); // right-side slide-over (own profile)
  const [drawerView, setDrawerView] = useState('menu'); // 'menu' | 'share' | 'settings'
  const openDrawer = (view) => {
    setShowMenu(false);
    setDrawerView(view);
    setIsMenuOpen(true);
  };
  const [deleteTarget, setDeleteTarget] = useState(null); // video object pending delete confirmation, or null
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef(null);
  const dropdownRef = useRef(null);
  const closeDrawer = useCallback(() => setIsMenuOpen(false), []); // stable: the drawer's effects depend on it

  // Close the ⋯ dropdown on an outside click, not just its own options.
  useEffect(() => {
    if (!showMenu) return;
    function onClickOutside(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        !(dropdownRef.current && dropdownRef.current.contains(e.target))
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showMenu]);

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

  // The main feed (app/page.jsx) already has a complete delete flow via
  // VideoCard's own DeleteConfirmModal — this profile grid was a plain
  // thumbnail link with no delete affordance of its own at all, which was
  // the actual gap: deleting only worked if you happened to open the video
  // from the main feed first.
  async function confirmDeleteVideo() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteVideo(deleteTarget.id);
      setVideos((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Post deleted');
    } catch (err) {
      toast.error(err.message || "Couldn't delete this post — try again.");
    } finally {
      setDeleting(false);
    }
  }

  const activeVideos = activeTab === 'videos' ? videos : activeTab === 'saved' ? savedVideos : likedVideos;

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a090e] text-slate-900 dark:text-white flex items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a090e] text-slate-900 dark:text-white flex items-center justify-center">
        <p className="text-xs text-slate-500 dark:text-zinc-500 font-mono">User not found.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0a090e] text-slate-900 dark:text-white pb-36 font-sans max-w-md mx-auto">
      {/* Banner */}
      <div className="h-32 w-full bg-slate-50 dark:bg-zinc-900 relative overflow-hidden">
        {user.bannerUrl && (
          <img src={user.bannerUrl} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-x-0 top-0 px-4 pt-3 flex items-center justify-between">
          <BackButton href="/" label="Back to feed" />

          <div className="flex items-center gap-2 relative" ref={menuRef}>
            {isSelf ? (
              // Own profile: one ≡ button → dropdown with Studio, Share, Settings
              // and Menu. Share / Settings / Menu open the right-side slide-over.
              <>
                <button
                  type="button"
                  onClick={() => setShowMenu((v) => !v)}
                  aria-label="Profile options"
                  aria-haspopup="menu"
                  aria-expanded={showMenu}
                  className="p-1.5 text-white bg-black/50 rounded-lg backdrop-blur-sm"
                >
                  <MenuIcon size={20} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowMenu((v) => !v)}
                  aria-label="More options"
                  className="p-1 text-zinc-200 hover:text-white bg-black/40 rounded-lg"
                >
                  <MoreHorizontal size={20} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-9 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden z-10 w-40">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowReport(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
                    >
                      Report
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-2">
        {/* User Identity — the avatar wrapper is a sibling of (not nested
            inside) the banner div above, with its own relative + negative
            top margin, so it stacks above the banner regardless of the
            banner's own overflow-hidden. z-10 keeps it above the banner's
            image layer; border-4 in the page background color is what
            visually separates the circle from the banner photo behind it. */}
        <div className="relative z-10 -mt-12 mb-3 inline-block">
          <div className="w-20 h-20 rounded-full border-4 border-[#0a090e] bg-slate-50 dark:bg-zinc-900 flex items-center justify-center shrink-0 overflow-hidden">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-amber-600 dark:text-amber-500 font-black text-2xl">
                {(user.displayName || user.username)?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="mb-4">
          <h1 className="text-xl font-black tracking-wider text-slate-900 dark:text-white uppercase">
            {user.displayName || user.username}
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-500 font-mono">@{user.username}</p>
          {user.bio && <p className="text-sm text-slate-700 dark:text-zinc-300 mt-2">{user.bio}</p>}
          {(user.whatsapp || (Array.isArray(user.externalLinks) && user.externalLinks.length > 0)) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {user.whatsapp && (
                <a
                  href={/^https?:\/\//i.test(user.whatsapp) ? user.whatsapp : `https://wa.me/${user.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-full bg-green-500/15 text-green-400 text-xs font-extrabold tracking-tight"
                >
                  WhatsApp
                </a>
              )}
              {(user.externalLinks || []).map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-amber-600 dark:text-amber-400 text-xs font-extrabold tracking-tight"
                >
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1 bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-3 text-center mb-4">
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-white">{user._count?.following ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Following</p>
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-white">{user._count?.followers ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Followers</p>
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-white">{user._count?.videos ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Videos</p>
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 dark:text-white">{user.totalLikes ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Likes</p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        {isSelf ? (
          <Link
            href="/profile/edit"
            className="flex items-center justify-center w-full py-3 mb-5 rounded-xl bg-amber-500 text-black text-sm font-extrabold tracking-tight hover:bg-amber-400 transition-all"
          >
            Edit Profile
          </Link>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-2">
            <button
              onClick={toggleFollow}
              className={`py-2.5 rounded-xl text-xs font-extrabold tracking-wide transition-all ${
                following
                  ? 'bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                  : 'bg-amber-500 text-black hover:bg-amber-400'
              }`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
            <button
              onClick={() => router.push(`/messages/${user.id}`)}
              className="py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-amber-600 dark:text-amber-500 text-xs font-bold hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
            >
              Message
            </button>
            <button
              onClick={() => navigator.share?.({ url: window.location.href }).catch(() => {})}
              className="flex items-center justify-center py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all"
            >
              <Share2 size={16} />
            </button>
          </div>
        )}

        {privateLocked && !isSelf ? (
          <div className="py-16 text-center">
            <Lock size={28} className="mx-auto text-slate-400 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-slate-500 dark:text-zinc-400">This account is private.</p>
            <p className="text-xs text-slate-400 dark:text-zinc-600 mt-1">Follow to see their videos.</p>
          </div>
        ) : (
          <>
            {/* Content Tabs */}
            <div
              className={`grid ${isSelf ? 'grid-cols-3' : 'grid-cols-1'} bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-1 mb-6`}
            >
              <button
                onClick={() => setActiveTab('videos')}
                className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'videos' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Videos
              </button>
              {isSelf && (
                <>
                  <button
                    onClick={() => setActiveTab('saved')}
                    className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      activeTab === 'saved' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Saved
                  </button>
                  <button
                    onClick={() => setActiveTab('liked')}
                    className={`py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                      activeTab === 'liked' ? 'bg-amber-500 text-black shadow-md' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Liked
                  </button>
                </>
              )}
            </div>

            {/* Tab Content area */}
            {activeVideos.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-zinc-500 font-mono">
                {activeTab === 'videos' && 'No videos posted yet.'}
                {activeTab === 'saved' && 'Nothing saved yet.'}
                {activeTab === 'liked' && 'Nothing liked yet.'}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {activeVideos.map((v) => (
                  <div key={v.id} className="relative aspect-[9/16] bg-slate-50 dark:bg-zinc-900 rounded-lg overflow-hidden group">
                    <a href={`/?video=${v.id}`} className="block w-full h-full">
                      {v.thumbnailUrl ? (
                        <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 dark:text-zinc-600 font-mono">
                          {v.status === 'processing' ? 'Processing…' : 'No thumbnail'}
                        </div>
                      )}
                    </a>
                    {/* Own posts only — this profile's "saved"/"liked" tabs
                        show other people's videos, where deleting isn't a
                        meaningful action for this account to take. */}
                    {isSelf && activeTab === 'videos' && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setDeleteTarget(v);
                        }}
                        aria-label="Delete post"
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete this post?"
          message="This can't be undone."
          confirmLabel={deleting ? 'Deleting…' : 'Delete'}
          onConfirm={confirmDeleteVideo}
          onCancel={() => (deleting ? null : setDeleteTarget(null))}
        />
      )}

      {showReport && (
        <ReportModal targetType="user" targetId={user.id} onClose={() => setShowReport(false)} />
      )}

      {isSelf && showMenu && (
        <div
          ref={dropdownRef}
          role="menu"
          className="absolute right-4 top-16 w-56 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1"
        >
<Link
                      href="/studio"
                      role="menuitem"
                      onClick={() => setShowMenu(false)}
                      className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-bold text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <LayoutDashboard size={16} className="text-amber-600 dark:text-amber-500" /> Studio
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openDrawer('share')}
                      className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-bold text-left text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <Share2 size={16} className="text-amber-600 dark:text-amber-500" /> Share
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openDrawer('settings')}
                      className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-bold text-left text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <SettingsIcon size={16} className="text-amber-600 dark:text-amber-500" /> Settings
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openDrawer('menu')}
                      className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-bold text-left text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <PanelRight size={16} className="text-amber-600 dark:text-amber-500" /> Menu
                    </button>
        </div>
      )}
      {isSelf && <ProfileDrawer open={isMenuOpen} onClose={closeDrawer} user={user} initialView={drawerView} />}
    </div>
  );
}
