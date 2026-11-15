'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useSocketContext } from '../context/SocketContext';
import { LoadingSpinner } from './LoadingScreen';
import CallsList from './CallsList';
import { useLiveAlerts } from '../context/LiveAlertsContext';

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function Avatar({ user, size = 11 }) {
  const px = { 9: 'w-9 h-9', 11: 'w-11 h-11', 14: 'w-14 h-14' }[size] || 'w-11 h-11';
  return (
    <span className={`${px} rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center font-display text-amber-400 shrink-0`}>
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        user?.username?.[0]?.toUpperCase()
      )}
    </span>
  );
}

// The active-thread half of this page moved out to
// components/ChatThreadView.jsx (a dedicated, full h-screen "DM screen" —
// see app/messages/[userId]/page.jsx), so this component is purely the
// conversation list/inbox now — no more selectedId/thread state, no more
// grid-cols-12 split, no md: breakpoint juggling between the two.
export default function MessagesPage() {
  const router = useRouter();
  const { onlineUsers, subscribePresence, unsubscribePresence } = useSocketContext();
  const [me, setMe] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeCandidates, setComposeCandidates] = useState(null);
  const [tab, setTab] = useState('messages'); // 'messages' | 'calls'
  const [calls, setCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [missedCount, setMissedCount] = useState(0);
  const tabRef = useRef('messages');
  const { liveNow } = useLiveAlerts();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    setMe(JSON.parse(stored));

    function loadConvos() {
      api.getConversations().then(setConversations).finally(() => setLoadingConvos(false));
    }
    loadConvos();
    const poll = setInterval(loadConvos, 10000); // safety net alongside the socket push below
    return () => clearInterval(poll);
  }, [router]);

  // Live delivery — bumps a conversation to the top / updates its preview
  // and unread count the moment a message arrives, instead of waiting up
  // to 10s for the polling safety net above.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !me) return;

    function onNewMessage(msg) {
      setConversations((prev) => {
        const otherId = msg.senderId === me.id ? msg.receiverId : msg.senderId;
        const rest = prev.filter((c) => c.user.id !== otherId);
        const existing = prev.find((c) => c.user.id === otherId);
        return [
          {
            user: existing?.user || msg.sender || { id: otherId },
            lastMessage: msg.content,
            lastMessageAt: msg.createdAt,
            unreadCount: msg.senderId === me.id ? 0 : (existing?.unreadCount || 0) + 1,
          },
          ...rest,
        ];
      });
    }

    socket.on('message:new', onNewMessage);
    return () => socket.off('message:new', onNewMessage);
  }, [me]);

  // Call history + unread missed-call badge.
  useEffect(() => {
    if (!me) return;
    api
      .getCalls()
      .then(({ calls: rows, missedCount: n }) => {
        setCalls(rows);
        setMissedCount(n);
      })
      .catch(() => {})
      .finally(() => setLoadingCalls(false));

    const socket = getSocket();
    if (!socket) return undefined;
    function onCallLogged(log) {
      setCalls((prev) => (prev.some((c) => c.id === log.id) ? prev : [log, ...prev]));
      const missedForMe = log.direction === 'incoming' && (log.status === 'MISSED' || log.status === 'NO_ANSWER');
      if (!missedForMe) return;
      if (tabRef.current === 'calls') api.markCallsSeen().catch(() => {}); // already looking at it
      else setMissedCount((n) => n + 1);
    }
    socket.on('call:logged', onCallLogged);
    return () => socket.off('call:logged', onCallLogged);
  }, [me]);

  function switchTab(next) {
    setTab(next);
    tabRef.current = next;
    setSearch('');
    if (next === 'calls' && missedCount > 0) {
      setMissedCount(0);
      api.markCallsSeen().catch(() => {});
    }
  }

  // Presence for every visible conversation partner — subscribePresence is
  // ref-counted (see context/SocketContext.jsx), so re-subscribing on every
  // conversations change is cheap and correctly cleans up on unmount.
  useEffect(() => {
    const ids = conversations.map((c) => c.user.id);
    if (ids.length === 0) return;
    subscribePresence(ids);
    return () => unsubscribePresence(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.map((c) => c.user.id).join(',')]);

  const filteredConvos = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => c.user.username?.toLowerCase().includes(q));
  }, [conversations, search]);

  function selectThread(userId) {
    setComposeOpen(false);
    router.push(`/messages/${userId}`);
  }

  async function openCompose() {
    setComposeOpen(true);
    if (composeCandidates === null && me) {
      Promise.all([api.getFollowing(me.id).catch(() => []), api.getFollowers(me.id).catch(() => [])]).then(
        ([following, followers]) => {
          const byId = new Map();
          [...following, ...followers].forEach((u) => byId.set(u.id, u));
          byId.delete(me.id);
          setComposeCandidates([...byId.values()]);
        }
      );
    }
  }

  return (
    <main className="px-2 md:px-6 py-4">
      <div className="max-w-2xl mx-auto h-[85vh] bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden backdrop-blur-md shadow-2xl my-4 flex flex-col relative">
        <div className="px-4 pt-5 pb-4 border-b border-zinc-800/80 space-y-4 shrink-0">
          <div className="flex items-center justify-between gap-3 pt-1">
            <h1 className="font-extrabold text-2xl tracking-tight text-white leading-none">Inbox</h1>
            <button
              onClick={openCompose}
              aria-label="New message"
              className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-amber-400 flex items-center justify-center border border-zinc-700 transition active:scale-95"
            >
              ✎
            </button>
          </div>
          <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-800/80 border border-zinc-700/60">
            {[
              { id: 'messages', label: 'Messages' },
              { id: 'calls', label: 'Calls' },
            ].map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={`relative py-2 rounded-lg font-bold text-sm transition ${
                  tab === t.id ? 'bg-amber-500 text-black shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
                {t.id === 'calls' && missedCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold align-middle">
                    {missedCount > 99 ? '99+' : missedCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'calls' ? 'Search calls…' : 'Search conversations…'}
            className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl text-xs px-3 py-2 outline-none focus:border-amber-500/50"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {tab === 'messages' && liveNow.length > 0 && (
            <div className="px-1.5 pt-1 pb-3 mb-1 border-b border-zinc-800/80">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live now
              </p>
              <div className="flex gap-4 overflow-x-auto no-scrollbar">
                {liveNow.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/live/${s.id}`)}
                    className="flex flex-col items-center gap-1.5 shrink-0 w-16"
                    aria-label={`${s.host?.username} is live. Tap to join`}
                  >
                    <span className="relative">
                      <span className="w-14 h-14 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center text-amber-400 font-bold ring-2 ring-red-500 ring-offset-2 ring-offset-zinc-900">
                        {s.host?.avatarUrl ? (
                          <img src={s.host.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          s.host?.username?.[0]?.toUpperCase()
                        )}
                      </span>
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[9px] font-extrabold px-1.5 rounded-full leading-4">
                        LIVE
                      </span>
                    </span>
                    <span className="w-full truncate text-center text-[11px] font-semibold text-zinc-300">@{s.host?.username}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab === 'calls' && <CallsList calls={calls} loading={loadingCalls} search={search} />}
          {tab === 'messages' && loadingConvos && <LoadingSpinner label="Loading…" />}
          {tab === 'messages' && !loadingConvos && filteredConvos.length === 0 && (
            <p className="font-body text-zinc-500 text-xs p-3">
              {search ? 'No matches.' : "No conversations yet — tap ✎ to start one."}
            </p>
          )}
          {tab === 'messages' && filteredConvos.map((c) => (
            <button
              key={c.user.id}
              onClick={() => selectThread(c.user.id)}
              className="w-full text-left flex items-center gap-3.5 p-3 rounded-2xl hover:bg-neutral-800/50 transition cursor-pointer"
            >
              <span className="relative w-12 h-12 rounded-full shrink-0">
                {c.user.avatarUrl ? (
                  <img src={c.user.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <span className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center font-display text-amber-400">
                    {c.user.username?.[0]?.toUpperCase()}
                  </span>
                )}
                {onlineUsers?.has?.(c.user.id) && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-900" />
                )}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <p className="font-bold text-sm text-white truncate">@{c.user.username}</p>
                <p className={`text-xs font-medium truncate ${c.unreadCount > 0 ? 'text-neutral-200' : 'text-neutral-400'}`}>
                  {c.lastMessage}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0 pr-1">
                <span className="text-xs font-semibold text-neutral-400">{timeAgo(c.lastMessageAt)}</span>
                {c.unreadCount > 0 && (
                  <span className="text-[10px] bg-amber-500 text-black rounded-full min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center font-extrabold">
                    {c.unreadCount}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {composeOpen && (
          <div className="absolute inset-0 z-30 bg-zinc-950/95 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <p className="font-display text-lg text-white">New message</p>
              <button onClick={() => setComposeOpen(false)} className="text-zinc-400 text-sm">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {composeCandidates === null && <LoadingSpinner label="Loading…" />}
              {composeCandidates?.length === 0 && (
                <p className="font-body text-zinc-500 text-xs p-3">
                  Follow people (or have followers) to message them.
                </p>
              )}
              {composeCandidates?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => selectThread(u.id)}
                  className="w-full text-left p-3 rounded-2xl hover:bg-zinc-800/60 flex items-center gap-3"
                >
                  <Avatar user={u} />
                  <p className="font-body text-sm text-white">@{u.username}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
