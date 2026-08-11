'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import ReportModal from './ReportModal';
import { LoadingSpinner } from './LoadingScreen';

const EMOJIS = ['😀', '😂', '❤️', '🔥', '👍', '🙏', '😍', '😅', '🎉', '👏', '😢', '😮'];

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

function AttachIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.4 11.2-8.5 8.5a5 5 0 0 1-7.1-7.1l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.6 8.5a2 2 0 1 1-2.8-2.8l7.9-7.8" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 11.5 20.5 3l-6 17.5-4-7.5-7.5-1.5Z" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}
function CallIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L7.9 9.9a16 16 0 0 0 6.2 6.2l1.4-1.4a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

export default function ChatHub({ initialUserId }) {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(initialUserId || null);
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [onlineIds, setOnlineIds] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [myVideos, setMyVideos] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeCandidates, setComposeCandidates] = useState(null);
  const [toast, setToast] = useState(null);
  const bottomRef = useRef(null);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  // Auth + initial data
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

  // Live delivery — push instead of tight polling
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onNewMessage(msg) {
      setConversations((prev) => {
        const otherId = msg.senderId === me?.id ? msg.receiverId : msg.senderId;
        const rest = prev.filter((c) => c.user.id !== otherId);
        const existing = prev.find((c) => c.user.id === otherId);
        return [
          {
            user: existing?.user || msg.sender || { id: otherId },
            lastMessage: msg.content,
            lastMessageAt: msg.createdAt,
            unreadCount: otherId === selectedId ? 0 : (existing?.unreadCount || 0) + 1,
          },
          ...rest,
        ];
      });

      if (msg.senderId === selectedId) {
        setMessages((prev) => [...prev, msg]);
        api.getThread(selectedId).catch(() => {}); // silently marks it read server-side
      }
    }

    function onRead({ byUserId }) {
      if (byUserId === selectedId) {
        setMessages((prev) => prev.map((m) => (m.senderId === me?.id ? { ...m, read: true } : m)));
      }
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:read', onRead);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:read', onRead);
    };
  }, [selectedId, me?.id]);

  // Load the selected thread
  useEffect(() => {
    if (!selectedId) {
      setOtherUser(null);
      setMessages([]);
      return;
    }
    setLoadingThread(true);
    setError(null);
    setMenuOpen(false);
    api.getUser(selectedId).then(setOtherUser).catch(() => {});
    api
      .getThread(selectedId)
      .then(setMessages)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingThread(false));
    api.getOnlineStatus([selectedId]).then((r) => setOnlineIds(new Set(r.onlineIds))).catch(() => {});
    setConversations((prev) => prev.map((c) => (c.user.id === selectedId ? { ...c, unreadCount: 0 } : c)));
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredConvos = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => c.user.username?.toLowerCase().includes(q));
  }, [conversations, search]);

  function selectThread(userId) {
    setSelectedId(userId);
    setComposeOpen(false);
    router.replace(`/messages/${userId}`);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || !selectedId) return;
    setSending(true);
    setError(null);
    try {
      const message = await api.sendMessage(selectedId, text.trim());
      setMessages((prev) => [...prev, message]);
      setConversations((prev) => {
        const rest = prev.filter((c) => c.user.id !== selectedId);
        return [{ user: otherUser, lastMessage: message.content, lastMessageAt: message.createdAt, unreadCount: 0 }, ...rest];
      });
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function openSharePicker() {
    setSharePickerOpen(true);
    if (myVideos === null && me) {
      api.getUserVideos(me.id).then(setMyVideos).catch(() => setMyVideos([]));
    }
  }

  function shareVideo(video) {
    setSharePickerOpen(false);
    setText(`Check out my video: ${window.location.origin}/?video=${video.id}`);
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

  async function toggleBlock() {
    try {
      if (otherUser?.blockedByMe) {
        await api.unblockUser(selectedId);
        setOtherUser((prev) => ({ ...prev, blockedByMe: false }));
        flashToast('Unblocked');
      } else {
        await api.blockUser(selectedId);
        setOtherUser((prev) => ({ ...prev, blockedByMe: true }));
        setConfirmBlock(false);
        flashToast('Blocked');
      }
    } catch (err) {
      flashToast(err.message);
    }
  }

  return (
    <main className="px-2 md:px-6 py-4">
      <div className="max-w-7xl mx-auto h-[85vh] bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden backdrop-blur-md shadow-2xl my-4 grid grid-cols-12">
        {/* ── Left: conversations sidebar ── */}
        <div className={`col-span-12 md:col-span-4 border-r border-zinc-800 flex flex-col relative ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <a href="/" className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest hover:text-zinc-300">
                ← Feed
              </a>
              <button
                onClick={openCompose}
                aria-label="New message"
                className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 flex items-center justify-center border border-zinc-700"
              >
                ✎
              </button>
            </div>
            <p className="font-display text-xl text-white tracking-wide">Messages</p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl text-xs px-3 py-2 outline-none focus:border-amber-500/50"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loadingConvos && <LoadingSpinner label="Loading…" />}
            {!loadingConvos && filteredConvos.length === 0 && (
              <p className="font-body text-zinc-500 text-xs p-3">
                {search ? 'No matches.' : "No conversations yet — tap ✎ to start one."}
              </p>
            )}
            {filteredConvos.map((c) => (
              <button
                key={c.user.id}
                onClick={() => selectThread(c.user.id)}
                className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer hover:bg-zinc-800/60 flex items-center gap-3 relative ${
                  selectedId === c.user.id ? 'bg-zinc-800 border-l-4 border-amber-500' : ''
                }`}
              >
                <span className="relative shrink-0">
                  <Avatar user={c.user} />
                  {onlineIds.has(c.user.id) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-900" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-body text-sm font-semibold text-white truncate">@{c.user.username}</p>
                  <p className="font-body text-xs text-zinc-500 truncate">{c.lastMessage}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-mono text-[10px] text-zinc-500">{timeAgo(c.lastMessageAt)}</span>
                  {c.unreadCount > 0 && (
                    <span className="font-mono text-[10px] bg-amber-500 text-black rounded-full min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center font-bold">
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

        {/* ── Right: active thread ── */}
        <div className={`col-span-12 md:col-span-8 flex flex-col relative ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {!selectedId && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <p className="text-4xl mb-4">💬</p>
              <p className="font-body text-zinc-300 text-sm mb-1">Select a message or start a new conversation</p>
              <p className="font-body text-zinc-600 text-xs mb-5">Chat with people you follow, or who follow you.</p>
              <button
                onClick={openCompose}
                className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-4 py-2 rounded-xl text-sm"
              >
                Message a friend
              </button>
            </div>
          )}

          {selectedId && (
            <>
              <div className="h-16 border-b border-zinc-800/80 p-4 flex items-center justify-between bg-zinc-950/40 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={() => setSelectedId(null)} className="md:hidden text-zinc-400 mr-1">←</button>
                  <Avatar user={otherUser} />
                  <div className="min-w-0">
                    <a href={`/profile/${selectedId}`} className="font-body text-sm font-semibold text-white truncate block hover:underline">
                      @{otherUser?.username || '…'}
                    </a>
                    {onlineIds.has(selectedId) && (
                      <p className="font-mono text-[10px] text-emerald-400 uppercase tracking-widest">Active now</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 relative">
                  <button
                    onClick={() => flashToast("Voice/video calls aren't available yet")}
                    aria-label="Call"
                    className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
                  >
                    <CallIcon />
                  </button>
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Options"
                    className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
                  >
                    <MoreIcon />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-10 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-30">
                      <a href={`/profile/${selectedId}`} className="block px-4 py-2.5 font-body text-sm text-zinc-300 hover:bg-zinc-800">
                        View profile
                      </a>
                      {!otherUser?.blockedByMe && (
                        <button
                          onClick={() => { setMenuOpen(false); setShowReport(true); }}
                          className="w-full text-left px-4 py-2.5 font-body text-sm text-zinc-300 hover:bg-zinc-800"
                        >
                          Report
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          otherUser?.blockedByMe ? toggleBlock() : setConfirmBlock(true);
                        }}
                        className="w-full text-left px-4 py-2.5 font-body text-sm text-red-400 hover:bg-zinc-800"
                      >
                        {otherUser?.blockedByMe ? 'Unblock' : 'Block'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingThread && <LoadingSpinner label="Loading…" />}
                {!loadingThread && messages.length === 0 && (
                  <p className="font-body text-zinc-500 text-sm">Say hello 👋</p>
                )}
                {messages.map((m) => {
                  const mine = m.senderId === me?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[70%]">
                        <div
                          className={
                            mine
                              ? 'bg-amber-500 text-black font-medium rounded-2xl rounded-tr-sm p-3.5 text-sm shadow-md'
                              : 'bg-zinc-800 text-zinc-100 rounded-2xl rounded-tl-sm p-3.5 text-sm shadow-md'
                          }
                        >
                          {m.content}
                        </div>
                        <p className={`font-mono text-[10px] text-zinc-500 mt-1 ${mine ? 'text-right' : ''}`}>
                          {formatClock(m.createdAt)}
                          {mine && <span className={m.read ? 'text-amber-400 ml-1' : 'ml-1'}>{m.read ? '✓✓' : '✓'}</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {error && <p className="font-body text-xs text-red-400 px-4">{error}</p>}

              {sharePickerOpen && (
                <div className="absolute bottom-20 left-4 right-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-2xl max-h-56 overflow-y-auto z-20">
                  <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2 px-1">Share one of your videos</p>
                  {myVideos === null && <LoadingSpinner label="Loading…" />}
                  {myVideos?.length === 0 && <p className="font-body text-zinc-500 text-xs px-1">You haven't posted anything yet.</p>}
                  <div className="grid grid-cols-4 gap-2">
                    {myVideos?.map((v) => (
                      <button key={v.id} onClick={() => shareVideo(v)} className="aspect-[9/16] rounded-lg overflow-hidden bg-zinc-800">
                        {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {emojiOpen && (
                <div className="absolute bottom-20 left-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 shadow-2xl grid grid-cols-6 gap-1 z-20">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { setText((t) => t + e); setEmojiOpen(false); }}
                      className="text-xl w-8 h-8 hover:bg-zinc-800 rounded-lg"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSend} className="p-4 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={openSharePicker}
                  aria-label="Share a video"
                  className="text-zinc-400 hover:text-white shrink-0"
                >
                  <AttachIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  aria-label="Emoji"
                  className="text-zinc-400 hover:text-white shrink-0 text-lg"
                >
                  🙂
                </button>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Message…"
                  disabled={otherUser?.blockedByMe}
                  className="bg-zinc-800/80 border border-zinc-700/80 text-white placeholder-zinc-400 rounded-2xl px-4 py-2.5 flex-1 focus:ring-2 focus:ring-amber-500/50 outline-none text-sm disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim() || otherUser?.blockedByMe}
                  aria-label="Send"
                  className="bg-amber-500 hover:bg-amber-400 text-black p-2.5 rounded-xl transition-all font-bold disabled:opacity-40 shrink-0"
                >
                  <SendIcon />
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {showReport && (
        <ReportModal targetType="user" targetId={selectedId} onClose={() => setShowReport(false)} />
      )}

      {confirmBlock && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-6">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 max-w-sm w-full">
            <p className="font-body text-white text-base mb-1">Block @{otherUser?.username}?</p>
            <p className="font-body text-zinc-400 text-sm mb-6">
              They won't be able to message you or find your profile. They won't be notified.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBlock(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-xl text-sm">
                Cancel
              </button>
              <button onClick={toggleBlock} className="flex-1 bg-red-500/90 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                Block
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white font-body text-xs px-4 py-2 rounded-xl border border-zinc-800 z-50 shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}
