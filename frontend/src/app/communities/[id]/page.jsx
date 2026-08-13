'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useToast } from '../../../context/ToastContext';
import { LoadingSpinner } from '../../../components/LoadingScreen';
import VideoCard from '../../../components/VideoCard';
import { COMMUNITY_CATEGORIES } from '../../../components/CreateCommunityModal';

const TABS = [
  { value: 'feed', label: 'Feed' },
  { value: 'members', label: 'Members' },
  { value: 'about', label: 'About & Rules' },
];

const ROLE_META = {
  admin: { label: 'ADMIN', cls: 'bg-amber-500 text-black' },
  moderator: { label: 'MODERATOR', cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/40' },
  member: { label: 'MEMBER', cls: 'bg-zinc-800 text-zinc-400' },
};

function RoleBadge({ role }) {
  if (!role) return null;
  const meta = ROLE_META[role] || ROLE_META.member;
  return (
    <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full font-bold shrink-0 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export default function CommunityDetailPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const toast = useToast();

  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState('feed');
  const [joinBusy, setJoinBusy] = useState(false);

  const [posts, setPosts] = useState([]);
  const [postsCursor, setPostsCursor] = useState(null);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editRules, setEditRules] = useState('');
  const [editPrivacy, setEditPrivacy] = useState('public');
  const [editAnnouncement, setEditAnnouncement] = useState('');

  const [memberBusyIds, setMemberBusyIds] = useState(new Set());
  const [openMenuUserId, setOpenMenuUserId] = useState(null);

  function loadCommunity() {
    return api
      .getCommunity(id)
      .then((c) => {
        setCommunity(c);
        setEditName(c.name);
        setEditDescription(c.description || '');
        setEditCategory(c.category || COMMUNITY_CATEGORIES[0]);
        setEditBannerUrl(c.bannerUrl || '');
        setEditRules(c.rules || '');
        setEditPrivacy(c.privacy);
        setEditAnnouncement(c.pinnedAnnouncement || '');
      })
      .catch(() => setNotFound(true));
  }

  useEffect(() => {
    loadCommunity().finally(() => setLoading(false));
    api
      .getCommunityPosts(id)
      .then((res) => {
        setPosts(res.videos);
        setPostsCursor(res.nextCursor);
      })
      .catch(() => setPosts([]))
      .finally(() => setPostsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadMorePosts() {
    if (!postsCursor || postsLoadingMore) return;
    setPostsLoadingMore(true);
    try {
      const res = await api.getCommunityPosts(id, postsCursor);
      setPosts((prev) => [...prev, ...res.videos]);
      setPostsCursor(res.nextCursor);
    } finally {
      setPostsLoadingMore(false);
    }
  }

  async function handleToggleJoin() {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    setJoinBusy(true);
    try {
      const res = await api.toggleCommunityJoin(id);
      setCommunity((prev) => ({
        ...prev,
        isJoined: res.joined,
        myRole: res.joined ? 'member' : null,
        memberCount: prev.memberCount + (res.joined ? 1 : -1),
      }));
      toast.success(res.joined ? `Joined ${community.name}` : `Left ${community.name}`);
    } catch (err) {
      toast.error(err.message || 'Could not update membership');
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editName.trim() || editBusy) return;
    setEditBusy(true);
    try {
      const payload = {
        name: editName.trim(),
        description: editDescription.trim(),
        category: editCategory,
        bannerUrl: editBannerUrl.trim(),
        rules: editRules.trim(),
        pinnedAnnouncement: editAnnouncement.trim(),
      };
      if (community.myRole === 'admin') payload.privacy = editPrivacy;
      const updated = await api.updateCommunity(id, payload);
      setCommunity((prev) => ({ ...prev, ...updated }));
      setEditing(false);
      toast.success('Community updated');
    } catch (err) {
      toast.error(err.message || 'Could not update community');
    } finally {
      setEditBusy(false);
    }
  }

  async function handleSetRole(userId, role) {
    setMemberBusyIds((prev) => new Set(prev).add(userId));
    setOpenMenuUserId(null);
    try {
      await api.setCommunityMemberRole(id, userId, role);
      setCommunity((prev) => ({
        ...prev,
        members: prev.members.map((m) => (m.id === userId ? { ...m, role } : m)),
      }));
      toast.success('Role updated');
    } catch (err) {
      toast.error(err.message || 'Could not update role');
    } finally {
      setMemberBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function handleRemoveMember(userId) {
    setMemberBusyIds((prev) => new Set(prev).add(userId));
    setOpenMenuUserId(null);
    try {
      await api.removeCommunityMember(id, userId);
      setCommunity((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.id !== userId),
        memberCount: prev.memberCount - 1,
      }));
      toast.success('Member removed');
    } catch (err) {
      toast.error(err.message || 'Could not remove member');
    } finally {
      setMemberBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </main>
    );
  }

  if (notFound || !community) {
    return (
      <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 text-center">
        <p className="font-body text-zinc-300 text-sm mb-1">Community not found</p>
        <p className="font-body text-zinc-600 text-xs mb-5">It may be private, or no longer exists.</p>
        <a href="/communities" className="text-amber-400 text-sm font-semibold hover:text-amber-300">
          ← Back to Communities
        </a>
      </main>
    );
  }

  const canModerate = community.myRole === 'admin' || community.myRole === 'moderator';
  const isAdmin = community.myRole === 'admin';

  return (
    <main className="min-h-screen bg-zinc-950 pb-10">
      {/* Banner header */}
      <div className="relative w-full h-40 sm:h-56">
        {community.bannerUrl ? (
          <img src={community.bannerUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-black/20 to-transparent" />
        <a
          href="/communities"
          className="absolute top-4 left-4 font-mono text-[10px] uppercase tracking-widest text-white/90 bg-black/40 px-2.5 py-1.5 rounded-full"
        >
          ← Communities
        </a>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8 relative">
        <div className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center text-lg font-black text-black shrink-0">
                {community.name?.[0]?.toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-xl text-white tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] truncate">
                    {community.name}
                  </h1>
                  <RoleBadge role={community.myRole} />
                </div>
                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                  {community.memberCount} {community.memberCount === 1 ? 'member' : 'members'} ·{' '}
                  {community.privacy === 'private' ? '🔒 Private' : '🌐 Public'}
                  {community.category ? ` · ${community.category}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleJoin}
              disabled={joinBusy}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 ${
                community.isJoined ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-amber-500 text-black hover:bg-amber-400'
              }`}
            >
              {community.isJoined ? 'Joined' : 'Join'}
            </button>
          </div>

          {community.description && (
            <p className="font-body text-sm text-zinc-400 mt-3">{community.description}</p>
          )}

          <p className="font-body text-xs text-zinc-500 mt-3">
            Created by{' '}
            <a href={`/profile/${community.createdBy.id}`} className="text-zinc-200 hover:underline">
              @{community.createdBy.username}
            </a>{' '}
            · {timeAgo(community.createdAt)}
          </p>

          {canModerate && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white"
            >
              {editing ? 'Cancel editing' : 'Edit Community'}
            </button>
          )}

          {editing && (
            <form onSubmit={handleSaveEdit} className="mt-3 space-y-3 border-t border-zinc-800 pt-4">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={60}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={280}
                rows={2}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50 resize-none"
              />
              <div className="flex flex-wrap gap-2">
                {COMMUNITY_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditCategory(c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                      editCategory === c ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                value={editBannerUrl}
                onChange={(e) => setEditBannerUrl(e.target.value)}
                placeholder="Banner image URL"
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50"
              />
              <textarea
                value={editRules}
                onChange={(e) => setEditRules(e.target.value)}
                placeholder="Rules"
                maxLength={2000}
                rows={3}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50 resize-none"
              />
              <textarea
                value={editAnnouncement}
                onChange={(e) => setEditAnnouncement(e.target.value)}
                placeholder="Pinned announcement (leave blank to remove)"
                maxLength={500}
                rows={2}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/50 resize-none"
              />
              {isAdmin && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPrivacy('public')}
                    className={`p-2 rounded-xl border text-xs font-semibold ${
                      editPrivacy === 'public' ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    🌐 Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPrivacy('private')}
                    className={`p-2 rounded-xl border text-xs font-semibold ${
                      editPrivacy === 'private' ? 'bg-amber-500/15 border-amber-500/50 text-amber-300' : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    🔒 Private
                  </button>
                </div>
              )}
              <button
                type="submit"
                disabled={editBusy}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-black text-sm font-bold disabled:opacity-50"
              >
                {editBusy ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-5 mb-5">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeTab === tab.value
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Feed tab */}
        {activeTab === 'feed' && (
          <div>
            {community.pinnedAnnouncement && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-2xl p-4 mb-4">
                <p className="font-mono text-[9px] uppercase tracking-widest text-amber-400 mb-1">
                  📌 Pinned Announcement
                </p>
                <p className="font-body text-sm whitespace-pre-wrap">{community.pinnedAnnouncement}</p>
              </div>
            )}

            {postsLoading && <LoadingSpinner label="Loading posts…" />}

            {!postsLoading && posts.length === 0 && (
              <div className="text-center py-16">
                <p className="text-zinc-500 text-sm">No posts in this community yet.</p>
              </div>
            )}

            {!postsLoading && posts.length > 0 && (
              <>
                <div className="rounded-2xl overflow-hidden border border-zinc-800 divide-y divide-zinc-800">
                  {posts.map((video) => (
                    <div key={video.id} className="relative h-[80vh] bg-black">
                      <VideoCard
                        video={video}
                        onDeleted={(deletedId) => setPosts((prev) => prev.filter((v) => v.id !== deletedId))}
                      />
                    </div>
                  ))}
                </div>
                {postsCursor && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={loadMorePosts}
                      disabled={postsLoadingMore}
                      className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {postsLoadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800">
            {community.members.map((m) => {
              const canManage =
                (isAdmin && m.role !== 'admin') ||
                (community.myRole === 'moderator' && m.role === 'member');
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 relative">
                  <span className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      m.username?.[0]?.toUpperCase()
                    )}
                  </span>
                  <a href={`/profile/${m.id}`} className="font-body text-sm text-white flex-1 hover:underline truncate">
                    @{m.username}
                  </a>
                  <RoleBadge role={m.role} />
                  {canManage && (
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuUserId(openMenuUserId === m.id ? null : m.id)}
                        disabled={memberBusyIds.has(m.id)}
                        className="text-zinc-500 hover:text-white px-2 disabled:opacity-50"
                      >
                        ⋯
                      </button>
                      {openMenuUserId === m.id && (
                        <div className="absolute right-0 top-8 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-10 w-44">
                          {isAdmin && m.role !== 'moderator' && (
                            <button
                              onClick={() => handleSetRole(m.id, 'moderator')}
                              className="w-full text-left px-3.5 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                            >
                              Make Moderator
                            </button>
                          )}
                          {isAdmin && m.role !== 'member' && (
                            <button
                              onClick={() => handleSetRole(m.id, 'member')}
                              className="w-full text-left px-3.5 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                            >
                              Set as Member
                            </button>
                          )}
                          {isAdmin && m.role !== 'admin' && (
                            <button
                              onClick={() => handleSetRole(m.id, 'admin')}
                              className="w-full text-left px-3.5 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                            >
                              Make Admin
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="w-full text-left px-3.5 py-2 text-xs text-rose-400 hover:bg-zinc-700"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* About tab */}
        {activeTab === 'about' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">About</p>
              <p className="font-body text-sm text-zinc-300">
                {community.description || 'No description yet.'}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Rules</p>
              <p className="font-body text-sm text-zinc-300 whitespace-pre-wrap">
                {community.rules || 'No rules have been posted for this community.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 pt-2 border-t border-zinc-800">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Category</p>
                <p className="font-body text-xs text-zinc-300 mt-0.5">{community.category || '—'}</p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Privacy</p>
                <p className="font-body text-xs text-zinc-300 mt-0.5">
                  {community.privacy === 'private' ? 'Private / Invite-only' : 'Public'}
                </p>
              </div>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Created</p>
                <p className="font-body text-xs text-zinc-300 mt-0.5">
                  {new Date(community.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
