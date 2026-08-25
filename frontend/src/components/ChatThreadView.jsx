'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Phone, Video, MoreVertical, Paperclip, Smile, Send, X } from 'lucide-react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useSocketContext } from '../context/SocketContext';
import ReportModal from './ReportModal';
import { LoadingSpinner } from './LoadingScreen';

const EMOJIS = ['😀', '😂', '❤️', '🔥', '👍', '🙏', '😍', '😅', '🎉', '👏', '😢', '😮'];

function formatClock(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Avatar({ user, size = 10 }) {
  const px = { 8: 'w-8 h-8', 10: 'w-10 h-10', 14: 'w-14 h-14' }[size] || 'w-10 h-10';
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

// Redesigned, dedicated full-screen "DM screen" — replaces the old
// side-by-side list+thread layout that used to live inside
// components/MessagesPage.jsx (that component is now list-only; see
// app/messages/[userId]/page.jsx for where this mounts instead). All the
// real-time/API logic below (socket listeners, send, block/report, share)
// is the same logic that used to live there, carried over as-is —
// only the layout and visual design changed.
export default function ChatThreadView({ otherUserId }) {
  const router = useRouter();
  const { onlineUsers, subscribePresence, unsubscribePresence } = useSocketContext();

  const [me, setMe] = useState(null);
  const [otherUser, setOtherUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [myVideos, setMyVideos] = useState(null);
  const [attachedVideo, setAttachedVideo] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [toast, setToast] = useState(null);
  const bottomRef = useRef(null);

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    setMe(JSON.parse(stored));
  }, [router]);

  useEffect(() => {
    if (!otherUserId) return;
    setLoadingThread(true);
    setError(null);
    setMenuOpen(false);
    api.getUser(otherUserId).then(setOtherUser).catch(() => {});
    api
      .getThread(otherUserId)
      .then(setMessages)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingThread(false));

    subscribePresence(otherUserId);
    return () => unsubscribePresence(otherUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onNewMessage(msg) {
      if (msg.senderId === otherUserId) {
        setMessages((prev) => [...prev, msg]);
        api.getThread(otherUserId).catch(() => {}); // silently marks it read server-side
      }
    }
    function onRead({ byUserId }) {
      if (byUserId === otherUserId) {
        setMessages((prev) => prev.map((m) => (m.senderId === me?.id ? { ...m, read: true } : m)));
      }
    }

    socket.on('message:new', onNewMessage);
    socket.on('message:read', onRead);
    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('message:read', onRead);
    };
  }, [otherUserId, me?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isOnline = useMemo(() => onlineUsers?.has?.(otherUserId), [onlineUsers, otherUserId]);

  async function handleSend(e) {
    e.preventDefault();
    // Attaching a clip doesn't change how it's actually sent — the Message
    // model is text-only (no dedicated video-message type on the backend),
    // so this still sends the same shareable link as before, just with a
    // proper "attached" preview step first instead of dropping straight
    // into the text field.
    const content = attachedVideo
      ? `${text.trim() ? `${text.trim()} ` : ''}${window.location.origin}/?video=${attachedVideo.id}`
      : text.trim();
    if (!content || !otherUserId) return;

    setSending(true);
    setError(null);
    try {
      const message = await api.sendMessage(otherUserId, content);
      setMessages((prev) => [...prev, message]);
      setText('');
      setAttachedVideo(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function openSharePicker() {
    setSharePickerOpen((v) => !v);
    if (myVideos === null && me) {
      api.getUserVideos(me.id).then(setMyVideos).catch(() => setMyVideos([]));
    }
  }

  async function toggleBlock() {
    try {
      if (otherUser?.blockedByMe) {
        await api.unblockUser(otherUserId);
        setOtherUser((prev) => ({ ...prev, blockedByMe: false }));
        flashToast('Unblocked');
      } else {
        await api.blockUser(otherUserId);
        setOtherUser((prev) => ({ ...prev, blockedByMe: true }));
        setConfirmBlock(false);
        flashToast('Blocked');
      }
    } catch (err) {
      flashToast(err.message);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-black text-white relative">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push('/messages')} aria-label="Back" className="text-zinc-300 hover:text-white shrink-0">
            <ChevronLeft size={22} />
          </button>
          <span className="relative shrink-0">
            <Avatar user={otherUser} />
            {isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-black" />}
          </span>
          <div className="min-w-0">
            <a href={`/profile/${otherUserId}`} className="font-body text-sm font-semibold text-white truncate block hover:underline">
              @{otherUser?.username || '…'}
            </a>
            {isOnline && <p className="font-mono text-[10px] text-emerald-400 uppercase tracking-widest">Active now</p>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 relative">
          <button
            onClick={() => flashToast("Voice calls aren't available yet")}
            aria-label="Audio call"
            className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
          >
            <Phone size={18} />
          </button>
          <button
            onClick={() => flashToast("Video calls aren't available yet")}
            aria-label="Video call"
            className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
          >
            <Video size={18} />
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More options"
            className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-30">
              <a href={`/profile/${otherUserId}`} className="block px-4 py-2.5 font-body text-sm text-zinc-300 hover:bg-zinc-800">
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
                onClick={() => { setMenuOpen(false); otherUser?.blockedByMe ? toggleBlock() : setConfirmBlock(true); }}
                className="w-full text-left px-4 py-2.5 font-body text-sm text-red-400 hover:bg-zinc-800"
              >
                {otherUser?.blockedByMe ? 'Unblock' : 'Block'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingThread && <LoadingSpinner label="Loading…" />}
        {!loadingThread && messages.length === 0 && <p className="font-body text-zinc-500 text-sm">Say hello 👋</p>}
        {messages.map((m) => {
          const mine = m.senderId === me?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[75%]">
                <div
                  className={
                    mine
                      ? 'bg-amber-500 text-black rounded-2xl rounded-tr-none px-4 py-2 font-medium max-w-[75%]'
                      : 'bg-zinc-800 text-white rounded-2xl rounded-tl-none px-4 py-2 max-w-[75%]'
                  }
                >
                  {m.content}
                </div>
                <p className={`text-[10px] text-zinc-400 mt-1 flex items-center gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {formatClock(m.createdAt)}
                  {mine && <span className={m.read ? 'text-amber-400' : ''}>{m.read ? '✓✓' : '✓'}</span>}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="font-body text-xs text-red-400 px-4 pb-1">{error}</p>}

      {emojiOpen && (
        <div className="mx-3 mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 grid grid-cols-6 gap-1 shrink-0">
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

      {/* "Share one of your videos" carousel — pinned right above the input dock */}
      {sharePickerOpen && (
        <div className="px-3 pb-2 shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Share one of your videos</p>
              <button onClick={() => setSharePickerOpen(false)} className="text-zinc-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            {myVideos === null && <LoadingSpinner label="Loading…" />}
            {myVideos?.length === 0 && (
              <p className="font-body text-zinc-500 text-xs px-0.5">You haven't posted anything yet.</p>
            )}
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {myVideos?.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setAttachedVideo(v);
                    setSharePickerOpen(false);
                  }}
                  className="shrink-0 w-16 aspect-[9/16] rounded-lg overflow-hidden bg-zinc-800 border-2 border-transparent hover:border-amber-500/60"
                >
                  {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attached video preview chip — set the instant a clip is tapped above */}
      {attachedVideo && (
        <div className="px-3 pb-2 shrink-0">
          <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 pr-3">
            <span className="w-9 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
              {attachedVideo.thumbnailUrl && (
                <img src={attachedVideo.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              )}
            </span>
            <span className="font-body text-xs text-zinc-300">Video attached</span>
            <button onClick={() => setAttachedVideo(null)} className="text-zinc-500 hover:text-white ml-1">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom input dock */}
      <form onSubmit={handleSend} className="p-3 bg-zinc-950 border-t border-zinc-800 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={openSharePicker}
          aria-label="Share a video"
          className="text-zinc-400 hover:text-white shrink-0"
        >
          <Paperclip size={20} />
        </button>
        <button
          type="button"
          onClick={() => setEmojiOpen((v) => !v)}
          aria-label="Emoji"
          className="text-zinc-400 hover:text-white shrink-0"
        >
          <Smile size={20} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          disabled={otherUser?.blockedByMe}
          className="bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2 text-sm flex-1 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || (!text.trim() && !attachedVideo) || otherUser?.blockedByMe}
          aria-label="Send"
          className="bg-amber-500 hover:bg-amber-400 text-black p-2.5 rounded-full transition-colors disabled:opacity-40 shrink-0"
        >
          <Send size={18} />
        </button>
      </form>

      {showReport && <ReportModal targetType="user" targetId={otherUserId} onClose={() => setShowReport(false)} />}

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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900 text-white font-body text-xs px-4 py-2 rounded-xl border border-zinc-800 z-50 shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
