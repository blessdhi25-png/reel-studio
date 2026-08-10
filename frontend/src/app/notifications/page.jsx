'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'all', label: 'All Activity' },
  { id: 'messages', label: 'Direct Messages' },
  { id: 'followers', label: 'Followers' },
  { id: 'activity', label: 'Likes & Comments' },
  { id: 'system', label: 'System Alert' },
];

const FOLLOWER_TYPES = ['follow'];
const LIKE_COMMENT_TYPES = ['like', 'comment', 'tip'];
const SYSTEM_TYPES = ['moderation', 'live_started', 'system'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function targetHref(n) {
  if (n.targetType === 'video' && n.targetId) return `/?video=${n.targetId}`;
  if (n.targetType === 'user' && n.targetId) return `/profile/${n.targetId}`;
  if (n.targetType === 'live' && n.targetId) return `/live/${n.targetId}`;
  return null;
}

// Buckets a list of notifications into Today / This Week / Earlier, preserving
// the incoming (already newest-first) order within each bucket.
function groupByTimeframe(list) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const buckets = { Today: [], 'This Week': [], Earlier: [] };
  for (const n of list) {
    const created = new Date(n.createdAt);
    if (created >= startOfToday) buckets.Today.push(n);
    else if (created >= startOfWeek) buckets['This Week'].push(n);
    else buckets.Earlier.push(n);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — no extra dependency)
// ---------------------------------------------------------------------------

function Icon({ children, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}
const HeartIcon = (p) => <Icon {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" /></Icon>;
const CommentIcon = (p) => <Icon {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Icon>;
const FollowIcon = (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></Icon>;
const TipIcon = (p) => <Icon {...p}><path d="M12 1v22M17 5.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5 2.2 3 5 3.5 5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" /></Icon>;
const AlertIcon = (p) => <Icon {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></Icon>;
const BellIcon = (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Icon>;
const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></Icon>;

function iconFor(type) {
  switch (type) {
    case 'follow':
      return { Cmp: FollowIcon, bg: 'bg-blue-500/15', ring: 'ring-blue-500/30', color: 'text-blue-400' };
    case 'like':
      return { Cmp: HeartIcon, bg: 'bg-red-500/15', ring: 'ring-red-500/30', color: 'text-red-400' };
    case 'comment':
      return { Cmp: CommentIcon, bg: 'bg-emerald-500/15', ring: 'ring-emerald-500/30', color: 'text-emerald-400' };
    case 'tip':
      return { Cmp: TipIcon, bg: 'bg-amber-500/15', ring: 'ring-amber-500/30', color: 'text-amber-400' };
    case 'moderation':
      return { Cmp: AlertIcon, bg: 'bg-red-500/15', ring: 'ring-red-500/30', color: 'text-red-400' };
    default:
      return { Cmp: BellIcon, bg: 'bg-zinc-500/15', ring: 'ring-zinc-500/30', color: 'text-zinc-400' };
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InboxPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [dmQuery, setDmQuery] = useState('');
  const [followBusy, setFollowBusy] = useState(null); // actorId currently being toggled

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    Promise.all([api.getNotifications(), api.getConversations(), api.getUnreadCount()])
      .then(([n, c, u]) => {
        setNotifications(n);
        setConversations(c);
        setUnreadCount(u.count);

        // Auto-mark-as-read on visiting the Inbox, not just via the manual
        // button below — the person is looking at these right now, so
        // there's no reason to still count them as unread the next time
        // they check the bottom nav badge. The manual button stays too,
        // since re-marking after new items arrive mid-visit (via the
        // socket listener below) is still useful without leaving the page.
        if (u.count > 0) {
          api.markAllNotificationsRead().catch(() => {});
          window.dispatchEvent(new Event('notifications:read'));
        }
      })
      .finally(() => setLoading(false));

    const socket = getSocket();
    if (!socket) return;
    const onNew = (n) => {
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((c) => c + 1);
    };
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, [router]);

  const handleMarkAllRead = () => {
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    api.markAllNotificationsRead().catch(() => {});
    // BottomNav keeps its own independent unreadCount (fetched on its own
    // mount + incremented via its own socket listener) — it has no way to
    // know this page just zeroed things out server-side without being told
    // directly. A plain window CustomEvent is a lightweight way to notify
    // it without introducing a shared notifications context just for this
    // one signal.
    window.dispatchEvent(new Event('notifications:read'));
  };

  const handleFollowToggle = async (actorId, isFollowing) => {
    setFollowBusy(actorId);
    setNotifications((prev) =>
      prev.map((n) =>
        n.actor?.id === actorId ? { ...n, actor: { ...n.actor, isFollowing: !isFollowing } } : n
      )
    );
    try {
      if (isFollowing) await api.unfollowUser(actorId);
      else await api.followUser(actorId);
    } catch {
      // roll back on failure
      setNotifications((prev) =>
        prev.map((n) =>
          n.actor?.id === actorId ? { ...n, actor: { ...n.actor, isFollowing } } : n
        )
      );
    } finally {
      setFollowBusy(null);
    }
  };

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'followers') return notifications.filter((n) => FOLLOWER_TYPES.includes(n.type));
    if (activeTab === 'activity') return notifications.filter((n) => LIKE_COMMENT_TYPES.includes(n.type));
    if (activeTab === 'system') return notifications.filter((n) => SYSTEM_TYPES.includes(n.type));
    if (activeTab === 'messages') return [];
    return notifications;
  }, [notifications, activeTab]);

  const grouped = useMemo(() => groupByTimeframe(filteredNotifications), [filteredNotifications]);

  const filteredConversations = useMemo(() => {
    const q = dmQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.user.username?.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q)
    );
  }, [conversations, dmQuery]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-4xl mx-auto p-6 md:p-8 bg-zinc-900/70 border border-zinc-800 rounded-3xl backdrop-blur-md shadow-2xl my-8">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Inbox &amp; Activity</h1>
            {unreadCount > 0 && (
              <span className="bg-amber-500 text-black font-bold text-xs rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
          >
            Mark all as read
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-zinc-500 text-sm py-8 text-center">Loading…</p>}

        {!loading && activeTab === 'messages' && (
          <MessagesSection
            conversations={filteredConversations}
            query={dmQuery}
            onQueryChange={setDmQuery}
            totalCount={conversations.length}
          />
        )}

        {!loading && activeTab !== 'messages' && (
          <ActivityFeed
            grouped={grouped}
            onFollowToggle={handleFollowToggle}
            followBusy={followBusy}
          />
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Activity feed (notifications grouped by timeframe)
// ---------------------------------------------------------------------------

function ActivityFeed({ grouped, onFollowToggle, followBusy }) {
  const sections = ['Today', 'This Week', 'Earlier'].filter((k) => grouped[k].length > 0);

  if (sections.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-500 text-sm">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div>
      {sections.map((section) => (
        <div key={section} className="mb-6 last:mb-0">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3 px-1">
            {section}
          </h2>
          {grouped[section].map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onFollowToggle={onFollowToggle}
              followBusy={followBusy}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function NotificationRow({ n, onFollowToggle, followBusy }) {
  const { Cmp, bg, ring, color } = iconFor(n.type);
  const href = targetHref(n);
  const isFollow = n.type === 'follow' && n.actor;
  const showThumb = LIKE_COMMENT_TYPES.includes(n.type) && n.videoThumbnailUrl;

  const content = (
    <div
      className={`flex items-center justify-between p-4 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800/60 rounded-2xl transition-all cursor-pointer mb-3 ${
        !n.read ? 'ring-1 ring-amber-500/20' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-10 h-10 rounded-full ${bg} ring-1 ${ring} flex items-center justify-center shrink-0`}
        >
          <Cmp className={`w-5 h-5 ${color}`} />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-white truncate">
            {n.actor?.username && <span className="font-bold">@{n.actor.username}</span>}
            {n.actor?.username ? ' ' : ''}
            <span className="text-zinc-300">{n.content}</span>
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{timeAgo(n.createdAt)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-3">
        {isFollow && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFollowToggle(n.actor.id, n.actor.isFollowing);
            }}
            disabled={followBusy === n.actor.id}
            className={
              n.actor.isFollowing
                ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-semibold text-xs px-3 py-1.5 rounded-xl transition-colors disabled:opacity-60'
                : 'bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs px-3 py-1.5 rounded-xl transition-colors disabled:opacity-60'
            }
          >
            {n.actor.isFollowing ? 'Following' : 'Follow Back'}
          </button>
        )}
        {showThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={n.videoThumbnailUrl}
            alt=""
            className="w-10 h-14 object-cover rounded-lg border border-zinc-700"
          />
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// Direct Messages section
// ---------------------------------------------------------------------------

function MessagesSection({ conversations, query, onQueryChange, totalCount }) {
  return (
    <div>
      <div className="relative mb-4">
        <SearchIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search conversations"
          className="w-full bg-zinc-800/60 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        />
      </div>

      {totalCount === 0 && (
        <div className="text-center py-16">
          <p className="text-zinc-500 text-sm">No conversations yet.</p>
        </div>
      )}

      {totalCount > 0 && conversations.length === 0 && (
        <div className="text-center py-16">
          <p className="text-zinc-500 text-sm">No conversations match your search.</p>
        </div>
      )}

      {conversations.map((c) => (
        <DMRow key={c.user.id} conversation={c} />
      ))}
    </div>
  );
}

function DMRow({ conversation }) {
  const { user, lastMessage, lastMessageAt, unreadCount } = conversation;
  return (
    <a
      href={`/messages/${user.id}`}
      className="group flex items-center justify-between p-4 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800/60 rounded-2xl transition-all cursor-pointer mb-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative shrink-0">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
              {user.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          {/* Online presence indicator — shown when the backend reports live
              presence for this user; hidden otherwise rather than faked. */}
          {user.online && (
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-zinc-900" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">@{user.username}</p>
          <p className="text-xs text-zinc-500 truncate max-w-[220px]">{lastMessage}</p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
        <span className="text-[11px] text-zinc-500 whitespace-nowrap">{timeAgo(lastMessageAt)}</span>
        {unreadCount > 0 ? (
          <span className="bg-amber-500 text-black font-bold text-xs rounded-full px-2 py-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : (
          <span className="text-[11px] text-amber-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
            Open Chat →
          </span>
        )}
      </div>
    </a>
  );
}
