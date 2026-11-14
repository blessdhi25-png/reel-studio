'use client';

import BackButton from '@/components/BackButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Video, MoreVertical, Paperclip, Smile, Send, X, Film, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useSocketContext } from '../context/SocketContext';
import ReportModal from './ReportModal';
import { useCall } from '../context/CallContext';
import { LoadingSpinner } from './LoadingScreen';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';

function fileKind(file) {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const fileInputRef = useRef(null);
  const { startCall: beginCall, inCall } = useCall();
  const [attachedFile, setAttachedFile] = useState(null); // { file, previewUrl, kind }

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

  // Object URLs hold the file in memory until revoked.
  useEffect(() => {
    return () => {
      if (attachedFile?.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl);
    };
  }, [attachedFile]);

  function startCall(type) {
    if (!otherUser?.id) return;
    if (otherUser?.blockedByMe) {
      flashToast("Unblock this person to call them");
      return;
    }
    if (inCall) {
      flashToast("You're already in a call");
      return;
    }
    beginCall(otherUser, type);
  }

  function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after removing it
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('That file is too large — the limit is 25 MB.');
      return;
    }
    setError(null);
    setAttachedFile({ file, previewUrl: URL.createObjectURL(file), kind: fileKind(file) });
  }

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
    if ((!content && !attachedFile) || !otherUserId) return;

    setSending(true);
    setError(null);
    try {
      const message = await api.sendMessage(otherUserId, content, attachedFile?.file);
      setMessages((prev) => [...prev, message]);
      setText('');
      setAttachedVideo(null);
      setAttachedFile(null);
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
          <BackButton href="/messages" label="Back to messages" className="shrink-0" />
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
            onClick={() => startCall('voice')}
            aria-label="Audio call"
            className="w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
          >
            <Phone size={18} />
          </button>
          <button
            onClick={() => startCall('video')}
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
                  {m.attachmentUrl && <Attachment message={m} mine={mine} />}
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

      {/* Local file attachment preview */}
      {attachedFile && (
        <div className="px-3 pb-2 shrink-0">
          <div className="inline-flex items-center gap-2.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 pr-2 max-w-full">
            <span className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-400">
              {attachedFile.kind === 'image' ? (
                <img src={attachedFile.previewUrl} alt="" className="w-full h-full object-cover" />
              ) : attachedFile.kind === 'video' ? (
                <video src={attachedFile.previewUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" />
              ) : (
                <FileText size={20} />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-body text-xs font-semibold text-zinc-200 truncate max-w-[200px]">{attachedFile.file.name}</span>
              <span className="block font-mono text-[10px] text-zinc-500">{formatBytes(attachedFile.file.size)}</span>
            </span>
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              aria-label="Remove attachment"
              className="w-7 h-7 shrink-0 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom input dock */}
      <form onSubmit={handleSend} className="p-3 bg-zinc-950 border-t border-zinc-800 flex items-center gap-2 shrink-0">
        <input ref={fileInputRef} type="file" accept={ACCEPT} onChange={handleFilePicked} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a file"
          disabled={otherUser?.blockedByMe}
          className="text-zinc-400 hover:text-white shrink-0 disabled:opacity-40"
        >
          <Paperclip size={20} />
        </button>
        <button
          type="button"
          onClick={openSharePicker}
          aria-label="Share one of your videos"
          className="text-zinc-400 hover:text-white shrink-0"
        >
          <Film size={20} />
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
          disabled={sending || (!text.trim() && !attachedVideo && !attachedFile) || otherUser?.blockedByMe}
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

function Attachment({ message, mine }) {
  const { attachmentUrl: url, attachmentType: type, attachmentName: name, attachmentSize: size } = message;
  const hasText = !!message.content;
  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`block ${hasText ? 'mb-2' : ''} -mx-2 -mt-1`}>
        <img src={url} alt={name || ''} className="rounded-xl max-h-64 w-full object-cover" />
      </a>
    );
  }
  if (type === 'video') {
    return <video src={url} controls playsInline preload="metadata" className={`rounded-xl max-h-64 w-full ${hasText ? 'mb-2' : ''} -mx-2 -mt-1`} />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={name || true}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 ${hasText ? 'mb-2' : ''} ${mine ? 'bg-black/10' : 'bg-white/10'}`}
    >
      <FileText size={18} className="shrink-0" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold truncate">{name || 'Attachment'}</span>
        {size ? <span className="block text-[10px] opacity-70">{formatBytes(size)}</span> : null}
      </span>
    </a>
  );
}
