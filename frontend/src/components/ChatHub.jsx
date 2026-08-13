'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';

// Hidden anywhere a fuller, dedicated equivalent of this widget already
// exists (auth pages have nothing to show yet either way) — a floating
// bubble duplicating the exact page it's floating over would just be
// confusing chrome-on-chrome. /messages and /notifications keep their full
// feature set (compose, block, report, follow-back, etc); this widget is
// the quick-glance/quick-reply surface everywhere else, with a link out to
// each full page for anything beyond that.
const HIDDEN_PREFIXES = ['/admin', '/messages', '/notifications', '/login', '/signup', '/verify-email', '/upload'];

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatClock(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function targetHref(n) {
  if (n.targetType === 'video' && n.targetId) return `/?video=${n.targetId}`;
  if (n.targetType === 'user' && n.targetId) return `/profile/${n.targetId}`;
  if (n.targetType === 'live' && n.targetId) return `/live/${n.targetId}`;
  return null;
}

function Avatar({ user, size = 10, online }) {
  const px = { 8: 'w-8 h-8', 10: 'w-10 h-10', 12: 'w-12 h-12' }[size] || 'w-10 h-10';
  return (
    <span className="relative shrink-0">
      <span className={`${px} rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center font-display text-amber-400`}>
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          user?.username?.[0]?.toUpperCase() || '?'
        )}
      </span>
      {online && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-zinc-900" />
      )}
    </span>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 11.5 20.5 3l-6 17.5-4-7.5-7.5-1.5Z" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export default function ChatHub() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const {
    socket,
    onlineUsers,
    subscribePresence,
    unsubscribePresence,
    unreadCount: notifUnread,
    markAllNotificationsRead,
    setActiveThreadId,
  } = useSocketContext();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('messages'); // 'messages' | 'notifications'
  const [conversations, setConversations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [typingFromOther, setTypingFromOther] = useState(false);
  const bottomRef = useRef(null);
  const typingStopTimer = useRef(null);

  const dmUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [conversations]
  );
  const totalBadge = dmUnread + notifUnread;

  // Base data, fetched once signed in regardless of whether the drawer's
  // ever been opened — the FAB badge needs an accurate count from the
  // start, not just from whenever the person first clicks it.
  useEffect(() => {
    if (!user) return;
    api.getConversations().then(setConversations).catch(() => {});
    api.getNotifications().then(setNotifications).catch(() => {});
  }, [user]);

  // Presence for everyone with a visible conversation — re-subscribes
  // automatically if the conversation list changes (new thread appears).
  const partnerIdsKey = useMemo(() => conversations.map((c) => c.user.id).join(','), [conversations]);
  useEffect(() => {
    const ids = partnerIdsKey ? partnerIdsKey.split(',') : [];
    if (!ids.length) return;
    subscribePresence(ids);
    return () => unsubscribePresence(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerIdsKey]);

  // Live message/read/typing delivery.
  useEffect(() => {
    if (!socket) return;

    function onNewMessage(msg) {
      const otherId = msg.senderId === user?.id ? msg.receiverId : msg.senderId;
      const viewingThisThread = open && tab === 'messages' && selectedId === otherId;
      setConversations((prev) => {
        const existing = prev.find((c) => c.user.id === otherId);
        const rest = prev.filter((c) => c.user.id !== otherId);
        return [
          {
            user: existing?.user || msg.sender || { id: otherId },
            lastMessage: msg.content,
            lastMessageAt: msg.createdAt,
            unreadCount: viewingThisThread ? 0 : (existing?.unreadCount || 0) + (msg.senderId === user?.id ? 0 : 1),
          },
          ...rest,
        ];
      });
      if (msg.senderId === selectedId) {
        setMessages((prev) => [...prev, msg]);
        setTypingFromOther(false);
      }
    }

    function onRead({ byUserId }) {
      if (byUserId === selectedId) {
        setMessages((prev) => prev.map((m) => (m.senderId === user?.id ? { ...m, read: true } : m)));
      }
    }

    function onTyping({ userId, typing }) {
      if (userId === selectedId) setTypingFromOther(typing);
    }

    function onNotification(n) {
      setNotifications((prev) => [n, ...prev]);
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:read', onRead);
    socket.on('user_typing', onTyping);
    socket.on('notification:new', onNotification);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:read', onRead);
      socket.off('user_typing', onTyping);
      socket.off('notification:new', onNotification);
    };
  }, [socket, selectedId, user?.id, open, tab]);

  // Load the selected thread.
  useEffect(() => {
    if (!selectedId) {
      setOtherUser(null);
      setMessages([]);
      return;
    }
    setLoadingThread(true);
    api.getUser(selectedId).then(setOtherUser).catch(() => {});
    api
      .getThread(selectedId)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoadingThread(false));
    setConversations((prev) => prev.map((c) => (c.user.id === selectedId ? { ...c, unreadCount: 0 } : c)));
  }, [selectedId]);

  // Tells SocketContext which thread (if any) is actively being looked at,
  // so it skips the toast for messages arriving in it.
  useEffect(() => {
    const active = open && tab === 'messages' && selectedId ? selectedId : null;
    setActiveThreadId(active);
    return () => setActiveThreadId(null);
  }, [open, tab, selectedId, setActiveThreadId]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => () => clearTimeout(typingStopTimer.current), []);

  function openThread(userId) {
    setSelectedId(userId);
    setTypingFromOther(false);
  }

  function handleTextChange(e) {
    setText(e.target.value);
    if (!socket || !selectedId) return;
    socket.emit('typing:start', { toUserId: selectedId });
    clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      socket.emit('typing:stop', { toUserId: selectedId });
    }, 2000);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const message = await api.sendMessage(selectedId, text.trim());
      setMessages((prev) => [...prev, message]);
      setConversations((prev) => {
        const rest = prev.filter((c) => c.user.id !== selectedId);
        return [{ user: otherUser, lastMessage: message.content, lastMessageAt: message.createdAt, unreadCount: 0 }, ...rest];
      });
      setText('');
      clearTimeout(typingStopTimer.current);
      socket?.emit('typing:stop', { toUserId: selectedId });
    } catch (err) {
      toast.error(err.message || "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  function handleNotifClick(n) {
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.markNotificationRead(n.id).catch(() => {});
    }
    const href = targetHref(n);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markAllNotificationsRead();
  }

  function goToFullPage(path) {
    setOpen(false);
    router.push(path);
  }

  const hiddenRoute = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isAuthenticated || hiddenRoute) return null;

  // Excludes type:'message' — those already have a dedicated tab (Messages)
  // and would otherwise show up twice for the same event (see
  // backend/src/routes/messages.js, which fires both a socket message and a
  // notification row for every DM).
  const visibleNotifications = notifications.filter((n) => n.type !== 'message');

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat and notifications' : 'Open chat and notifications'}
        className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-amber-400 shadow-2xl flex items-center justify-center hover:border-amber-500/50 transition-colors"
      >
        <ChatBubbleIcon />
        {!open && totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center border-2 border-zinc-950">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </button>

      <div
        className={`fixed z-40 right-4 bottom-40 w-[92vw] max-w-sm h-[70vh] max-h-[560px] bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-3xl shadow-2xl flex flex-col overflow-hidden origin-bottom-right transition-all duration-250 ease-out ${
          open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-1 bg-zinc-800/60 rounded-xl p-1">
            <button
              onClick={() => setTab('messages')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                tab === 'messages' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Messages
              {dmUnread > 0 && (
                <span className="bg-amber-500 text-black rounded-full text-[9px] font-bold min-w-[15px] h-[15px] px-1 flex items-center justify-center">
                  {dmUnread > 9 ? '9+' : dmUnread}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('notifications')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                tab === 'notifications' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BellIcon />
              {notifUnread > 0 && (
                <span className="bg-amber-500 text-black rounded-full text-[9px] font-bold min-w-[15px] h-[15px] px-1 flex items-center justify-center">
                  {notifUnread > 9 ? '9+' : notifUnread}
                </span>
              )}
            </button>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close" className="text-zinc-400 hover:text-white text-base leading-none px-1">
            ✕
          </button>
        </div>

        {tab === 'messages' && !selectedId && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Conversations</p>
              <button onClick={() => goToFullPage('/messages')} className="font-body text-[11px] text-amber-400 hover:text-amber-300">
                Open full inbox ↗
              </button>
            </div>
            {conversations.length === 0 && (
              <p className="font-body text-zinc-500 text-xs px-4 py-6 text-center">
                No conversations yet.
              </p>
            )}
            <div className="px-2 pb-2">
              {conversations.map((c) => (
                <button
                  key={c.user.id}
                  onClick={() => openThread(c.user.id)}
                  className="w-full text-left p-2.5 rounded-2xl hover:bg-zinc-800/60 flex items-center gap-2.5"
                >
                  <Avatar user={c.user} online={onlineUsers.has(c.user.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-sm font-semibold text-white truncate">@{c.user.username}</p>
                    <p className="font-body text-xs text-zinc-500 truncate">{c.lastMessage}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-mono text-[9px] text-zinc-500">{timeAgo(c.lastMessageAt)}</span>
                    {c.unreadCount > 0 && (
                      <span className="font-mono text-[9px] bg-amber-500 text-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'messages' && selectedId && (
          <>
            <div className="px-3 py-2.5 border-b border-zinc-800/80 flex items-center gap-2 shrink-0">
              <button onClick={() => setSelectedId(null)} aria-label="Back to conversations" className="text-zinc-400 hover:text-white">
                <BackIcon />
              </button>
              <Avatar user={otherUser} size={8} online={onlineUsers.has(selectedId)} />
              <div className="min-w-0 flex-1">
                <p className="font-body text-sm font-semibold text-white truncate">@{otherUser?.username || '…'}</p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  {typingFromOther ? <span className="text-amber-400">typing…</span> : onlineUsers.has(selectedId) ? 'Active now' : ''}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
              {loadingThread && <p className="font-body text-zinc-500 text-xs text-center py-4">Loading…</p>}
              {!loadingThread && messages.length === 0 && (
                <p className="font-body text-zinc-500 text-xs text-center py-4">Say hello 👋</p>
              )}
              {messages.map((m) => {
                const mine = m.senderId === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[78%]">
                      <div
                        className={
                          mine
                            ? 'bg-amber-500 text-black font-medium rounded-2xl rounded-tr-sm px-3 py-2 text-sm'
                            : 'bg-zinc-800 text-zinc-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm'
                        }
                      >
                        {m.content}
                      </div>
                      <p className={`font-mono text-[9px] text-zinc-500 mt-0.5 ${mine ? 'text-right' : ''}`}>
                        {formatClock(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="p-2.5 border-t border-zinc-800/80 flex items-center gap-2 shrink-0">
              <input
                value={text}
                onChange={handleTextChange}
                placeholder="Message…"
                className="bg-zinc-800/80 border border-zinc-700/80 text-white placeholder-zinc-500 rounded-xl px-3 py-2 flex-1 outline-none focus:ring-2 focus:ring-amber-500/50 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                aria-label="Send"
                className="bg-amber-500 hover:bg-amber-400 text-black p-2 rounded-xl font-bold disabled:opacity-40 shrink-0"
              >
                <SendIcon />
              </button>
            </form>
          </>
        )}

        {tab === 'notifications' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Notifications</p>
              <div className="flex items-center gap-3">
                {notifUnread > 0 && (
                  <button onClick={handleMarkAllRead} className="font-body text-[11px] text-amber-400 hover:text-amber-300">
                    Mark all read
                  </button>
                )}
                <button onClick={() => goToFullPage('/notifications')} className="font-body text-[11px] text-amber-400 hover:text-amber-300">
                  Open full inbox ↗
                </button>
              </div>
            </div>
            {visibleNotifications.length === 0 && (
              <p className="font-body text-zinc-500 text-xs px-4 py-6 text-center">Nothing here yet.</p>
            )}
            <div className="px-2 pb-2">
              {visibleNotifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`w-full text-left p-2.5 rounded-2xl hover:bg-zinc-800/60 flex items-center gap-2.5 ${
                    !n.read ? 'bg-zinc-800/40' : ''
                  }`}
                >
                  <Avatar user={n.actor} size={8} />
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-xs text-zinc-200 truncate">
                      {n.actor?.username && <span className="font-semibold text-white">@{n.actor.username} </span>}
                      {n.content}
                    </p>
                    <p className="font-mono text-[9px] text-zinc-500 mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  {n.videoThumbnailUrl && (
                    <img src={n.videoThumbnailUrl} alt="" className="w-8 h-11 object-cover rounded-lg shrink-0" />
                  )}
                  {!n.read && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
