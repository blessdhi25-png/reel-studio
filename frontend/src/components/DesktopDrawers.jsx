'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  X, Maximize2, Search, Settings, Languages, Moon, SunMedium, Monitor,
  LayoutDashboard, TrendingUp, Radio, Wallet, ChevronRight, LogOut, Bell,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';

// Slide-out panels that open beside the collapsed/expanded sidebar (lg+ only).
// Panel left edge tracks the sidebar width: left-20 (icon rail) / xl:left-64 (full).
const PANEL =
  'fixed top-0 left-20 xl:left-64 w-80 h-screen bg-black border-r border-neutral-800 text-white p-4 z-50 overflow-y-auto transition-all duration-300 ease-out';

function timeAgo(dateStr) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : new Date(dateStr).toLocaleDateString();
}

function Avatar({ user, size = 'w-12 h-12' }) {
  return (
    <span className={`${size} rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center font-extrabold text-amber-400`}>
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" /> : (user?.username?.[0] || '?').toUpperCase()}
    </span>
  );
}

function Header({ title, onClose, children }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
      <div className="flex items-center gap-2">
        {children}
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center">
          <X className="w-4 h-4" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-sm font-bold text-neutral-500 text-center py-10">{children}</p>;
}

// ---------------------------------------------------------------- Messages
function MessagesDrawer({ onClose }) {
  const router = useRouter();
  const [threads, setThreads] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getConversations()
      .then((c) => !cancelled && setThreads(Array.isArray(c) ? c : []))
      .catch((e) => !cancelled && setError(e?.message || "Couldn't load messages"));
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (!threads) return [];
    const term = q.trim().toLowerCase();
    return term ? threads.filter((c) => c.user?.username?.toLowerCase().includes(term)) : threads;
  }, [threads, q]);

  return (
    <>
      <Header title="Messages" onClose={onClose}>
        <button type="button" onClick={() => { onClose(); router.push('/messages'); }} aria-label="Open full messages" className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center">
          <Maximize2 className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </Header>
      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" strokeWidth={2.5} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search messages"
          aria-label="Search messages"
          className="w-full h-10 pl-10 pr-3 rounded-full bg-neutral-900 text-sm font-bold placeholder-neutral-500 outline-none focus:ring-2 focus:ring-amber-500/60"
        />
      </div>
      {error && <p className="text-sm font-bold text-red-400" role="alert">{error}</p>}
      {!threads && !error && <Empty>Loading…</Empty>}
      {threads && shown.length === 0 && <Empty>{q ? 'No matching chats.' : 'No messages yet.'}</Empty>}
      <ul>
        {shown.map((c) => (
          <li key={c.user.id}>
            <Link
              href={`/messages/${c.user.id}`}
              onClick={onClose}
              className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-neutral-900 transition-colors"
            >
              <Avatar user={c.user} />
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold tracking-tight truncate">{c.user.username}</span>
                <span className="flex gap-2 text-sm font-bold text-neutral-400">
                  <span className="truncate">{c.lastMessage}</span>
                  <span className="shrink-0">{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}</span>
                </span>
              </span>
              {!!c.unreadCount && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-black text-[11px] font-extrabold flex items-center justify-center">
                  {c.unreadCount > 9 ? '9+' : c.unreadCount}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- Activity
const ACTIVITY_FILTERS = [
  { id: 'all', label: 'All activity', match: () => true },
  { id: 'likes', label: 'Likes', match: (n) => n.type === 'like' },
  { id: 'comments', label: 'Comments', match: (n) => n.type === 'comment' },
  { id: 'followers', label: 'Followers', match: (n) => n.type === 'follow' },
];

function ActivityDrawer({ onClose }) {
  const { markAllNotificationsRead } = useSocketContext();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getNotifications()
      .then((n) => {
        if (cancelled) return;
        // Snapshot "New" vs "Previous" before opening the drawer marks everything read.
        setItems(Array.isArray(n) ? n : []);
        markAllNotificationsRead();
      })
      .catch((e) => !cancelled && setError(e?.message || "Couldn't load activity"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function followBack(actorId) {
    setBusy(actorId);
    setItems((prev) => prev.map((n) => (n.actor?.id === actorId ? { ...n, actor: { ...n.actor, isFollowing: true } } : n)));
    try {
      await api.followUser(actorId);
    } catch {
      setItems((prev) => prev.map((n) => (n.actor?.id === actorId ? { ...n, actor: { ...n.actor, isFollowing: false } } : n)));
    } finally {
      setBusy(null);
    }
  }

  const active = ACTIVITY_FILTERS.find((f) => f.id === filter);
  const list = (items || []).filter(active.match);
  const fresh = list.filter((n) => !n.read);
  const previous = list.filter((n) => n.read);

  const Row = ({ n }) => {
    const href =
      n.targetType === 'video' && n.targetId ? `/?video=${n.targetId}`
      : n.targetType === 'user' && n.targetId ? `/profile/${n.targetId}`
      : n.targetType === 'live' && n.targetId ? `/live/${n.targetId}` : n.actor?.id ? `/profile/${n.actor.id}` : null;
    const body = (
      <div className="flex items-center gap-3 px-1 py-2.5">
        {n.actor ? <Avatar user={n.actor} size="w-11 h-11" /> : (
          <span className="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center shrink-0"><Bell className="w-5 h-5 text-neutral-400" /></span>
        )}
        <span className="min-w-0 flex-1 text-sm">
          {n.actor?.username && <span className="block font-extrabold tracking-tight truncate">{n.actor.username}</span>}
          <span className="block font-bold text-neutral-400 truncate">
            {n.content} · {timeAgo(n.createdAt)}
          </span>
        </span>
        {n.type === 'follow' && n.actor && !n.actor.isFollowing && (
          <button
            type="button"
            disabled={busy === n.actor.id}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); followBack(n.actor.id); }}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-extrabold shrink-0 disabled:opacity-50"
          >
            Follow back
          </button>
        )}
        {n.type !== 'follow' && n.videoThumbnailUrl && (
          <img src={n.videoThumbnailUrl} alt="" className="w-10 h-12 rounded-md object-cover shrink-0" />
        )}
      </div>
    );
    return href ? (
      <Link href={href} onClick={onClose} className="block rounded-xl hover:bg-neutral-900 transition-colors">{body}</Link>
    ) : body;
  };

  return (
    <>
      <Header title="Activity" onClose={onClose} />
      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Activity filter">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-extrabold tracking-tight transition-colors ${
              filter === f.id ? 'bg-white text-black' : 'bg-neutral-800 text-white hover:bg-neutral-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm font-bold text-red-400" role="alert">{error}</p>}
      {!items && !error && <Empty>Loading…</Empty>}
      {items && list.length === 0 && <Empty>Nothing here yet.</Empty>}
      {fresh.length > 0 && (
        <>
          <h3 className="text-sm font-extrabold tracking-tight text-neutral-400 mb-1">New</h3>
          {fresh.map((n) => <Row key={n.id} n={n} />)}
        </>
      )}
      {previous.length > 0 && (
        <>
          <h3 className="text-sm font-extrabold tracking-tight text-neutral-400 mt-3 mb-1">Previous</h3>
          {previous.map((n) => <Row key={n.id} n={n} />)}
        </>
      )}
    </>
  );
}

// -------------------------------------------------------------------- More
function MoreRow({ href, icon: Icon, children, onClose, trailing }) {
  return (
    <Link href={href} onClick={onClose} className="flex items-center gap-3 px-3 py-3 rounded-xl text-base font-extrabold tracking-tight hover:bg-neutral-900 transition-colors">
      <Icon className="w-5 h-5 shrink-0" strokeWidth={2.5} />
      <span className="flex-1">{children}</span>
      {trailing}
    </Link>
  );
}

function MoreDrawer({ onClose }) {
  const { theme, setTheme } = useTheme();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const modes = [
    { id: 'system', label: 'System', Icon: Monitor },
    { id: 'dark', label: 'Dark', Icon: Moon },
    { id: 'light', label: 'Light', Icon: SunMedium },
  ];
  const label = 'px-3 mt-4 mb-1 text-sm font-extrabold tracking-tight text-neutral-500';

  return (
    <>
      <Header title="More" onClose={onClose} />
      <p className={label}>Settings</p>
      <MoreRow href="/settings" icon={Settings} onClose={onClose}>General</MoreRow>
      <div className="flex items-center gap-3 px-3 py-3 text-base font-extrabold tracking-tight">
        <Languages className="w-5 h-5 shrink-0" strokeWidth={2.5} />
        <span className="flex-1">Language</span>
        <span className="text-sm font-bold text-neutral-400">English (US)</span>
      </div>
      <div className="flex items-center gap-3 px-3 py-3 text-base font-extrabold tracking-tight">
        <Moon className="w-5 h-5 shrink-0" strokeWidth={2.5} />
        <span className="flex-1">Dark mode</span>
        <div role="radiogroup" aria-label="Theme" className="flex rounded-full bg-neutral-900 p-1">
          {modes.map(({ id, label: l, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mounted && theme === id}
              aria-label={l}
              title={l}
              onClick={() => setTheme(id)}
              className={`w-8 h-7 rounded-full flex items-center justify-center transition-colors ${
                mounted && theme === id ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2.5} />
            </button>
          ))}
        </div>
      </div>

      <p className={label}>Tools</p>
      <MoreRow href="/studio" icon={LayoutDashboard} onClose={onClose}>ClipPulse Studio</MoreRow>
      <MoreRow href="/promote" icon={TrendingUp} onClose={onClose}>Promote post</MoreRow>
      <MoreRow href="/live" icon={Radio} onClose={onClose} trailing={<ChevronRight className="w-4 h-4 text-neutral-500" />}>LIVE tools</MoreRow>
      <MoreRow href="/earnings" icon={Wallet} onClose={onClose}>Earnings</MoreRow>

      {isAuthenticated && (
        <button
          type="button"
          onClick={() => { onClose(); logout?.(); router.push('/login'); }}
          className="w-full flex items-center gap-3 px-3 py-3 mt-2 rounded-xl text-base font-extrabold tracking-tight text-red-400 hover:bg-neutral-900 transition-colors"
        >
          <LogOut className="w-5 h-5 shrink-0" strokeWidth={2.5} /> Log out
        </button>
      )}

      <div className="mt-6 pt-4 border-t border-neutral-800 text-xs font-bold text-neutral-500 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/legal/terms" onClick={onClose} className="hover:text-white">Terms</Link>
        <Link href="/legal/privacy" onClick={onClose} className="hover:text-white">Privacy</Link>
        <span>© {new Date().getFullYear()} ClipPulse</span>
      </div>
    </>
  );
}

// -------------------------------------------------------------------- Shell
export default function DesktopDrawer({ which, onClose }) {
  const [shown, setShown] = useState(false);

  // Fresh slide-in whenever a different drawer opens.
  useEffect(() => {
    setShown(false);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(raf);
  }, [which]);

  useEffect(() => {
    if (!which) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [which, onClose]);

  if (!which) return null;
  const title = { messages: 'Messages', activity: 'Activity', more: 'More' }[which];

  return (
    <>
      {/* Transparent click-catcher to the right of the sidebar so clicking the page closes the drawer. */}
      <div className="fixed inset-y-0 right-0 left-20 xl:left-64 z-[45] hidden lg:block" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label={title}
        className={`${PANEL} hidden lg:block ${shown ? 'translate-x-0 opacity-100' : '-translate-x-6 opacity-0'}`}
      >
        {which === 'messages' && <MessagesDrawer onClose={onClose} />}
        {which === 'activity' && <ActivityDrawer onClose={onClose} />}
        {which === 'more' && <MoreDrawer onClose={onClose} />}
      </aside>
    </>
  );
}
