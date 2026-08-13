'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSocketContext } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ConfirmModal';

const IMAGE_TEXT_DURATION_MS = 5000;
const DEFAULT_VIDEO_DURATION_MS = 15000;

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function HeartIcon({ filled }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-6.7-4.35-9.3-8.1C.9 10.1 1.4 6.6 4.3 5 6.5 3.8 9 4.5 12 7.5 15 4.5 17.5 3.8 19.7 5c2.9 1.6 3.4 5.1 1.6 7.9C18.7 16.65 12 21 12 21Z" />
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
function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}
function MuteIcon({ muted }) {
  return muted ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m23 9-6 6M17 9l6 6" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

// Full-screen, one story-author "run" at a time. `groups` is the array of
// { user, stories } the tray is currently showing (already in the order
// the tray displays them) — advancing past the last story of one author
// rolls into the next author's group automatically, same as
// Instagram/Snapchat, rather than closing.
export default function StoryViewer({ groups, initialGroupIndex, currentUserId, onClose, onStoryUpdate, onDeleted }) {
  const { socket } = useSocketContext();
  const toast = useToast();

  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const wasHoldRef = useRef(false);
  const typingStopTimer = useRef(null);

  const group = groups[groupIndex];
  const story = group?.stories?.[storyIndex];
  const isOwner = group?.user?.id === currentUserId;

  const durationMs =
    story?.mediaType === 'video' ? (story.durationSeconds ? story.durationSeconds * 1000 : DEFAULT_VIDEO_DURATION_MS) : IMAGE_TEXT_DURATION_MS;

  // Mark viewed the moment a story becomes active — covers both landing
  // here on mount and navigating with goPrev/goNext, in one place instead
  // of duplicating the call at every call site that changes the index.
  useEffect(() => {
    if (!story || isOwner) return;
    api.viewStory(story.id).catch(() => {});
    if (!story.viewed) onStoryUpdate?.(story.id, { viewed: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  useEffect(() => {
    setPaused(false);
    wasHoldRef.current = false;
  }, [groupIndex, storyIndex]);

  useEffect(() => () => clearTimeout(holdTimerRef.current), []);
  useEffect(() => () => clearTimeout(typingStopTimer.current), []);

  function goNext() {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex((i) => i + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((i) => i + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  }

  function goPrev() {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
    } else if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex((i) => i - 1);
      setStoryIndex(prevGroup.stories.length - 1);
    }
  }

  function handlePointerDown() {
    wasHoldRef.current = false;
    holdTimerRef.current = setTimeout(() => {
      wasHoldRef.current = true;
      setPaused(true);
      videoRef.current?.pause();
    }, 180);
  }

  function handlePointerUp(e) {
    clearTimeout(holdTimerRef.current);
    if (wasHoldRef.current) {
      setPaused(false);
      videoRef.current?.play().catch(() => {});
      return;
    }
    const x = e.clientX ?? e.changedTouches?.[0]?.clientX ?? window.innerWidth;
    if (x < window.innerWidth * 0.3) goPrev();
    else goNext();
  }

  async function handleLikeToggle() {
    if (!story) return;
    try {
      const { liked, likeCount } = story.likedByMe ? await api.unlikeStory(story.id) : await api.likeStory(story.id);
      onStoryUpdate?.(story.id, { likedByMe: liked, likeCount });
    } catch {
      toast.error("Couldn't update that");
    }
  }

  async function handlePollVote(optionId) {
    if (!story || story.myPollVote) return; // one vote, matches backend's upsert-once-then-locked UX
    try {
      const { myPollVote, pollOptions } = await api.voteStoryPoll(story.id, optionId);
      onStoryUpdate?.(story.id, { myPollVote, pollOptions });
    } catch (err) {
      toast.error(err.message || "Couldn't cast that vote");
    }
  }

  function handleReplyChange(e) {
    setReplyText(e.target.value);
    if (!socket || !group) return;
    socket.emit('typing:start', { toUserId: group.user.id });
    clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => socket.emit('typing:stop', { toUserId: group.user.id }), 2000);
  }

  async function handleReplySubmit(e) {
    e.preventDefault();
    if (!replyText.trim() || !group || sendingReply) return;
    setSendingReply(true);
    try {
      await api.sendMessage(group.user.id, replyText.trim());
      toast.success(`Sent to @${group.user.username}`);
      setReplyText('');
      clearTimeout(typingStopTimer.current);
      socket?.emit('typing:stop', { toUserId: group.user.id });
    } catch (err) {
      toast.error(err.message || "Couldn't send that");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleQaSubmit(e) {
    e.preventDefault();
    const answer = replyText.trim();
    if (!answer || !story) return;
    setSendingReply(true);
    try {
      await api.answerStoryQuestion(story.id, answer);
      toast.success('Answer sent');
      setReplyText('');
    } catch (err) {
      toast.error(err.message || "Couldn't send that");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleDelete() {
    if (!story) return;
    try {
      await api.deleteStory(story.id);
      setConfirmDelete(false);
      onDeleted?.(story.id);
      // Only step forward if we just deleted the *last* story in this
      // group. Otherwise, staying at the same storyIndex is correct on its
      // own: once the parent's `groups` prop actually updates (removal is
      // async, in a different component's state), the story that used to
      // sit one slot later has shifted down into this exact index —
      // incrementing here would skip past it or run off the end.
      const wasLastInGroup = storyIndex >= group.stories.length - 1;
      if (wasLastInGroup) {
        if (groupIndex < groups.length - 1) {
          setGroupIndex((i) => i + 1);
          setStoryIndex(0);
        } else {
          onClose();
        }
      }
    } catch (err) {
      toast.error(err.message || "Couldn't delete that story");
      setConfirmDelete(false);
    }
  }

  if (!group || !story) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl text-white select-none">
      {/* Media layer — the only thing that responds to tap/hold. */}
      <div
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => clearTimeout(holdTimerRef.current)}
      >
        {story.mediaType === 'image' && <img src={story.mediaUrl} alt="" className="w-full h-full object-cover" />}
        {story.mediaType === 'video' && (
          <video
            key={story.id}
            ref={videoRef}
            src={story.mediaUrl}
            autoPlay
            muted={muted}
            playsInline
            className="w-full h-full object-cover"
            onEnded={goNext}
          />
        )}
        {story.mediaType === 'text' && (
          <div
            className="w-full h-full flex items-center justify-center px-10"
            style={{ background: story.backgroundColor || 'linear-gradient(135deg,#1f2937,#111827)' }}
          >
            <p className="text-white text-2xl font-display text-center whitespace-pre-wrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {story.textContent}
            </p>
          </div>
        )}
      </div>

      {/* Chrome layer — pointer-events-none on empty space so taps there
          still reach the media layer for navigation; each real control
          re-enables pointer-events on itself. */}
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        <div className="pointer-events-auto px-3 pt-[max(0.75rem,env(safe-area-inset-top))] shrink-0">
          <div className="flex gap-1">
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full bg-white/90 origin-left rounded-full"
                  style={
                    i < storyIndex
                      ? { transform: 'scaleX(1)' }
                      : i > storyIndex
                      ? { transform: 'scaleX(0)' }
                      : {
                          animation: `story-progress ${durationMs}ms linear forwards`,
                          animationPlayState: paused ? 'paused' : 'running',
                        }
                  }
                  onAnimationEnd={i === storyIndex && story.mediaType !== 'video' ? goNext : undefined}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2.5 mt-3">
            <span className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 shrink-0 flex items-center justify-center font-display text-amber-400 text-sm">
              {group.user.avatarUrl ? (
                <img src={group.user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                group.user.username?.[0]?.toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-body text-sm font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] truncate">@{group.user.username}</p>
              <p className="font-mono text-[10px] text-white/70 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                {timeAgo(story.createdAt)}
                {isOwner && story.viewCount != null ? ` · ${story.viewCount} view${story.viewCount === 1 ? '' : 's'}` : ''}
              </p>
            </div>
            {story.mediaType === 'video' && (
              <button onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} className="text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                <MuteIcon muted={muted} />
              </button>
            )}
            {isOwner && (
              <button onClick={() => setConfirmDelete(true)} aria-label="Delete story" className="text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                <TrashIcon />
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="flex-1" />

        {story.linkUrl && (
          <div className="pointer-events-auto flex justify-center pb-3">
            <a
              href={story.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/95 text-black font-body text-xs font-bold px-4 py-2 rounded-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            >
              🔗 {story.linkLabel || 'Visit link'}
            </a>
          </div>
        )}

        {story.pollQuestion && story.pollOptions && (
          <div className="pointer-events-auto mx-6 mb-4 bg-black/40 backdrop-blur-md rounded-2xl p-3">
            <p className="font-body text-sm font-semibold text-center mb-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{story.pollQuestion}</p>
            <div className="flex gap-2">
              {story.pollOptions.map((opt) => {
                const total = story.pollOptions.reduce((sum, o) => sum + (o.votes || 0), 0);
                const pct = total ? Math.round(((opt.votes || 0) / total) * 100) : 0;
                const mine = story.myPollVote === opt.id;
                const voted = !!story.myPollVote;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handlePollVote(opt.id)}
                    disabled={voted}
                    className={`relative flex-1 overflow-hidden rounded-full border px-3 py-2 font-body text-xs font-semibold text-center ${
                      mine ? 'border-white' : 'border-white/40'
                    }`}
                  >
                    {voted && <span className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${pct}%` }} />}
                    <span className="relative">
                      {opt.label}
                      {voted ? ` · ${pct}%` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {story.qaQuestion && !isOwner && (
          <form onSubmit={handleQaSubmit} className="pointer-events-auto mx-6 mb-4 bg-black/40 backdrop-blur-md rounded-2xl p-3 flex flex-col gap-2">
            <p className="font-body text-sm font-semibold text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{story.qaQuestion}</p>
            <div className="flex items-center gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your answer…"
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm placeholder-white/50 outline-none"
              />
              <button type="submit" disabled={!replyText.trim() || sendingReply} className="bg-white text-black p-2 rounded-xl disabled:opacity-40">
                <SendIcon />
              </button>
            </div>
          </form>
        )}
        {story.qaQuestion && isOwner && (
          <div className="pointer-events-auto mx-6 mb-4 bg-black/40 backdrop-blur-md rounded-2xl p-3">
            <p className="font-body text-xs text-center text-white/70 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              Your question: “{story.qaQuestion}”
            </p>
          </div>
        )}

        {!isOwner && (
          <form
            onSubmit={handleReplySubmit}
            className="pointer-events-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 flex items-center gap-2.5"
          >
            <input
              value={replyText}
              onChange={handleReplyChange}
              placeholder={`Reply to @${group.user.username}…`}
              className="flex-1 bg-white/10 border border-white/25 rounded-full px-4 py-2.5 text-sm placeholder-white/60 outline-none"
            />
            <button type="submit" disabled={!replyText.trim() || sendingReply} aria-label="Send reply" className="text-white disabled:opacity-30 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              <SendIcon />
            </button>
            <button type="button" onClick={handleLikeToggle} aria-label="Like story" className={`drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${story.likedByMe ? 'text-rose-500' : 'text-white'}`}>
              <HeartIcon filled={story.likedByMe} />
            </button>
          </form>
        )}
        {isOwner && story.likeCount > 0 && (
          <div className="pointer-events-none px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
            <p className="font-body text-xs text-white/70 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              ❤️ {story.likeCount} like{story.likeCount === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete this story?"
          message="This can't be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
