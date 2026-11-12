'use client';

import BackButton from '@/components/BackButton';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MoreHorizontal, Menu as MenuIcon, Share2, Lock, Pencil, UserPlus, ChevronDown, Sparkles, Grid3x3, Repeat2, Bookmark, Heart, Plus } from 'lucide-react';
import { api, getStoredUser } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import ReportModal from '@/components/ReportModal';
import ConfirmModal from '@/components/ConfirmModal';
import ProfileDrawer from '@/components/ProfileDrawer';
import AccountSwitcherModal from '@/components/AccountSwitcherModal';
import { LoadingSpinner } from '@/components/LoadingScreen';

export default function ProfilePage({ params }) {
  const { id } = params;
  const router = useRouter();
  const toast = useToast();

  const [user, setUser] = useState(null);
  const [videos, setVideos] = useState([]);
  const [savedVideos, setSavedVideos] = useState([]);
  const [repostVideos, setRepostVideos] = useState([]);
  const [showSwitcher, setShowSwitcher] = useState(false);
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
  const closeDrawer = useCallback(() => setIsMenuOpen(false), []); // stable: the drawer's effects depend on it

  // Close the ⋯ dropdown on an outside click, not just its own options.
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
      api.getMyReposts().then((r) => setRepostVideos(Array.isArray(r) ? r : [])).catch(() => {});
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

  const activeVideos =
    activeTab === 'videos' ? videos : activeTab === 'saved' ? savedVideos : activeTab === 'liked' ? likedVideos : activeTab === 'reposts' ? repostVideos : [];

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

  const TABS = [
    { id: 'videos', label: 'Posts', Icon: Grid3x3 },
    { id: 'private', label: 'Private', Icon: Lock },
    { id: 'reposts', label: 'Reposts', Icon: Repeat2 },
    { id: 'saved', label: 'Saved', Icon: Bookmark },
    { id: 'liked', label: 'Liked', Icon: Heart },
  ];
  const visibleTabs = isSelf ? TABS : TABS.slice(0, 1);
  const statNum = 'font-extrabold text-base text-black dark:text-white';
  const statLbl = 'text-xs font-medium text-neutral-500';

  return (
    <div className="relative min-h-screen bg-white dark:bg-neutral-950 text-black dark:text-white pb-36 font-sans max-w-md mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-950">
        {isSelf ? (
          <Link href="/settings/account" aria-label="Edit profile" className="p-1 -ml-1 text-black dark:text-white">
            <Pencil className="w-5 h-5 stroke-[2.2]" />
          </Link>
        ) : (
          <BackButton href="/" label="Back to feed" />
        )}

        <div className="flex items-center gap-4 relative" ref={menuRef}>
          {isSelf ? (
            <>
              <Link href="/friends" aria-label="Find friends" className="p-1 text-black dark:text-white">
                <UserPlus className="w-6 h-6 stroke-[2.2]" />
              </Link>
              <button
                type="button"
                onClick={() => openDrawer('menu')}
                aria-label="Open menu"
                aria-haspopup="dialog"
                className="p-1 -mr-1 text-black dark:text-white"
              >
                <MenuIcon className="w-6 h-6 stroke-[2.2]" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowMenu((v) => !v)}
                aria-label="More options"
                aria-haspopup="menu"
                aria-expanded={showMenu}
                className="p-1 -mr-1 text-black dark:text-white"
              >
                <MoreHorizontal className="w-6 h-6" />
              </button>
              {showMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-10 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl p-2 z-50"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowMenu(false);
                      setShowReport(true);
                    }}
                    className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold text-black dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Report
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Asymmetrical header */}
      <div className="flex items-start justify-between px-4 pt-2">
        <div className="min-w-0 pr-3">
          <h1 className="font-extrabold text-2xl tracking-tight text-black dark:text-white flex items-center gap-1">
            <span className="truncate">{user.displayName || user.username}</span>
            {isSelf && (
              <button
                type="button"
                onClick={() => setShowSwitcher(true)}
                aria-label="Switch account"
                aria-haspopup="dialog"
                className="shrink-0"
              >
                <ChevronDown className="w-5 h-5 stroke-[3]" />
              </button>
            )}
          </h1>
          <p className="text-sm font-semibold text-neutral-500 mt-0.5">@{user.username}</p>

          <div className="flex items-center gap-6 mt-4">
            <div>
              <p className={statNum}>{user._count?.following ?? 0}</p>
              <p className={statLbl}>Following</p>
            </div>
            <div>
              <p className={statNum}>{user._count?.followers ?? 0}</p>
              <p className={statLbl}>Followers</p>
            </div>
            <div>
              <p className={statNum}>{user.totalLikes ?? 0}</p>
              <p className={statLbl}>Likes</p>
            </div>
          </div>
        </div>

        <div className="relative w-24 h-24 shrink-0 mt-3">
          {isSelf && (
            <Link
              href="/settings/account"
              className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-white shadow-md border border-neutral-100 rounded-2xl px-2.5 py-1 text-[11px] font-semibold text-neutral-600 whitespace-nowrap"
            >
              Add a note
            </Link>
          )}
          <div className="w-24 h-24 rounded-full border border-neutral-200 bg-neutral-100 dark:bg-neutral-900 overflow-hidden flex items-center justify-center">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-amber-600 font-black text-3xl">
                {(user.displayName || user.username)?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
          {isSelf && (
            <Link
              href="/upload"
              aria-label="Add to your story"
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center text-black font-bold"
            >
              <Plus className="w-4 h-4 stroke-[3.5]" />
            </Link>
          )}
        </div>
      </div>

      {/* Bio, links, Studio pill, other-user actions */}
      <div className="px-4 mt-3">
        {user.bio && (
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 leading-snug">{user.bio}</p>
        )}
        {(user.whatsapp || (Array.isArray(user.externalLinks) && user.externalLinks.length > 0)) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs font-extrabold">
            {user.whatsapp && (
              <a
                href={/^https?:\/\//i.test(user.whatsapp) ? user.whatsapp : `https://wa.me/${user.whatsapp.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 dark:text-green-400 hover:underline"
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
                className="text-amber-700 dark:text-amber-400 hover:underline"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}

        {isSelf ? (
          <Link
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-xs font-extrabold text-black dark:text-white transition-colors"
            href="/studio"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            ClipPulse Studio
          </Link>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              onClick={toggleFollow}
              className={`py-2.5 rounded-xl text-xs font-extrabold tracking-wide transition-all ${
                following
                  ? 'bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-black dark:text-white'
                  : 'bg-amber-500 text-black hover:bg-amber-400'
              }`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
            <button
              onClick={() => router.push(`/messages/${user.id}`)}
              className="py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-black dark:text-white text-xs font-extrabold hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              Message
            </button>
            <button
              onClick={() => navigator.share?.({ url: window.location.href }).catch(() => {})}
              aria-label="Share profile"
              className="flex items-center justify-center py-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-black dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <Share2 size={16} />
            </button>
          </div>
        )}
      </div>

      {privateLocked && !isSelf ? (
        <div className="py-16 px-4 text-center">
          <Lock size={28} className="mx-auto text-neutral-400 mb-3" />
          <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400">This account is private.</p>
          <p className="text-xs font-medium text-neutral-500 mt-1">Follow to see their videos.</p>
        </div>
      ) : (
        <>
          {/* Icon tabs */}
          <div role="tablist" className="mt-5 border-b border-neutral-200 dark:border-neutral-800 flex">
            {visibleTabs.map(({ id: tabId, label, Icon }) => {
              const active = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  role="tab"
                  aria-selected={active}
                  aria-label={label}
                  onClick={() => setActiveTab(tabId)}
                  className={`flex-1 flex justify-center py-3 -mb-px border-b-2 transition-colors ${
                    active
                      ? 'border-black dark:border-white text-black dark:text-white'
                      : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                  }`}
                >
                  <Icon className="w-6 h-6 stroke-[2.2]" />
                </button>
              );
            })}
          </div>

          {activeTab === 'private' ? (
            <div className="py-14 px-6 text-center">
              <Lock className="w-7 h-7 mx-auto text-neutral-400 mb-3" />
              <p className="text-sm font-extrabold text-black dark:text-white">Only you can see this tab</p>
              <p className="text-xs font-medium text-neutral-500 mt-1 leading-snug">
                Per-post privacy isn't available yet. To hide your account from non-followers, use
                Privacy settings.
              </p>
              <Link href="/settings/privacy" className="inline-block mt-3 text-xs font-extrabold text-amber-700 dark:text-amber-400 hover:underline">
                Open Privacy settings
              </Link>
            </div>
          ) : activeVideos.length === 0 ? (
            <div className="py-12 text-center text-xs font-bold text-neutral-500">
              {activeTab === 'videos' && 'No posts yet.'}
              {activeTab === 'reposts' && 'No reposts yet.'}
              {activeTab === 'saved' && 'Nothing saved yet.'}
              {activeTab === 'liked' && 'Nothing liked yet.'}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 mt-0.5">
              {activeVideos.map((v) => (
                <div key={v.id} className="relative aspect-[9/16] bg-neutral-100 dark:bg-neutral-900 overflow-hidden group">
                  <a href={`/?video=${v.id}`} className="block w-full h-full">
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-neutral-400">
                        {v.status === 'processing' ? 'Processing…' : 'No thumbnail'}
                      </div>
                    )}
                  </a>
                  {isSelf && activeTab === 'videos' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteTarget(v);
                      }}
                      aria-label="Delete post"
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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

      {isSelf && <ProfileDrawer open={isMenuOpen} onClose={closeDrawer} user={user} initialView={drawerView} />}
      {isSelf && <AccountSwitcherModal open={showSwitcher} onClose={() => setShowSwitcher(false)} />}
    </div>
  );
}
