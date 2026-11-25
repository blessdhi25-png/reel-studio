'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { LoadingSpinner } from './LoadingScreen';
import { useContentTranslation } from '../hooks/useContentTranslation';
import TranslationToggle from './TranslationToggle';
import { ArrowUpDown, AtSign, ChevronDown, Heart, Smile, X } from 'lucide-react';

// Matches M:SS or MM:SS timestamps like "0:14" or "1:25" written in a
// comment. Capped at 59 seconds in the SS group so we don't match things
// like "12:99" or phone-number-shaped text.
const TIMESTAMP_RE = /\b(\d{1,2}):([0-5]\d)\b/g;

function parseTimestamps(content = '') {
  const matches = [];
  let m;
  TIMESTAMP_RE.lastIndex = 0;
  while ((m = TIMESTAMP_RE.exec(content))) {
    matches.push({
      text: m[0],
      seconds: Number(m[1]) * 60 + Number(m[2]),
      index: m.index,
    });
  }
  return matches;
}

// Splits comment text into plain-text and timestamp segments so we can
// render the timestamps as clickable badges inline, in place.
function splitContent(content = '') {
  const timestamps = parseTimestamps(content);
  if (timestamps.length === 0) return [{ type: 'text', value: content }];

  const parts = [];
  let cursor = 0;
  for (const ts of timestamps) {
    if (ts.index > cursor) parts.push({ type: 'text', value: content.slice(cursor, ts.index) });
    parts.push({ type: 'timestamp', value: ts.text, seconds: ts.seconds });
    cursor = ts.index + ts.text.length;
  }
  if (cursor < content.length) parts.push({ type: 'text', value: content.slice(cursor) });
  return parts;
}

// variant="overlay" (default) — the mobile bottom-sheet modal, unchanged.
// variant="inline"  — fills its parent with no backdrop/close button, so it
//   can sit permanently in the desktop rail without ever covering the video.
//
// currentTime (seconds, optional) — the main video's live playback position.
//   When provided, the comment holding the closest timestamp at or before
//   currentTime is highlighted as the "active chapter."
// onSeek (fn(seconds), optional) — called when a timestamp badge is clicked.
//   The caller is responsible for actually seeking the video player.
// One comment's text, with optional machine translation (automatic when "Always translate" is on).
// Timestamp chips are re-parsed from whichever text is shown so they keep working after translation.
function timeAgo(iso) {
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function CommentText({ comment, onSeek, light }) {
  const tr = useContentTranslation(comment.content, { active: !comment.pending });
  const parts = splitContent(tr.text);
  return (
    <>
      {light && (
        <p className="font-bold text-[13px] text-zinc-900 leading-tight">{comment.user?.displayName || comment.user?.username}</p>
      )}
      <p className={light ? 'font-normal text-sm text-zinc-700 leading-snug break-words' : 'font-semibold text-sm text-neutral-100 leading-snug tracking-tight break-words'}>
        {!light && <span className="font-extrabold text-reel">@{comment.user?.username} </span>}
        {parts.map((p, i) =>
          p.type === 'timestamp' ? (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeek(p.seconds);
              }}
              className={`inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-sprocket font-bold text-xs align-middle ${light ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200' : 'bg-reel/20 text-reel hover:bg-reel/30 active:bg-reel/40'}`}
              title={`Jump to ${p.value}`}
            >
              ▶ {p.value}
            </button>
          ) : (
            <span key={i}>{p.value}</span>
          )
        )}
      </p>
      {!comment.pending && <TranslationToggle tr={tr} className={`mt-0.5 ${light ? 'text-zinc-500' : 'text-neutral-300'}`} />}
    </>
  );
}

const CommentsPanel = forwardRef(function CommentsPanel(
  { videoId, onClose, onCountChange, variant = 'overlay', currentTime = null, onSeek },
  ref
) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [sort, setSort] = useState('top'); // 'top' | 'new'
  const [showSort, setShowSort] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { id: top-level comment id, username }
  const [openThreads, setOpenThreads] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const inputRef = useRef(null);
  const activeCommentRef = useRef(null);
  const { user } = useAuth();
  const toast = useToast();
  // Plain incrementing counter for temp-comment ids — Date.now() would
  // collide if handlePost fired twice within the same millisecond (e.g. a
  // very fast double-submit before `posting` disables the button).
  const tempIdRef = useRef(0);

  useImperativeHandle(ref, () => ({
    focusInput: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    setLoading(true);
    api
      .getComments(videoId)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [videoId]);

  async function handlePost(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }

    // Optimistic append: show it in the list immediately using what we
    // already know locally (the signed-in user's own identity, from
    // AuthContext — no need to wait on the server to tell us our own
    // username/avatar), then reconcile once the real request resolves.
    const tempId = `temp-${tempIdRef.current++}`;
    const optimisticComment = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      user: { id: user?.id, username: user?.username, displayName: user?.displayName, avatarUrl: user?.avatarUrl },
      parentCommentId: replyTo?.id || null,
      likeCount: 0,
      liked: false,
      pending: true,
    };
    setComments((prev) => [optimisticComment, ...prev]);
    const parentId = replyTo?.id || null;
    setText('');
    setReplyTo(null);
    setShowEmoji(false);
    onCountChange?.((c) => c + 1);

    setPosting(true);
    try {
      const saved = await api.postComment(videoId, content, parentId);
      // Swap the optimistic placeholder for the real server record (real
      // id, server-assigned createdAt, etc.) rather than leaving the fake
      // one in place — later features keying off comment.id (replies,
      // deletion) need the real id.
      setComments((prev) => prev.map((c) => (c.id === tempId ? { ...optimisticComment, ...saved, pending: false } : c)));
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      onCountChange?.((c) => Math.max(0, c - 1));
      toast.error("Couldn't post your comment — try again.");
    } finally {
      setPosting(false);
    }
  }

  // The "current chapter": the largest timestamp, across all comments, that
  // is still <= currentTime. Whichever comment(s) contain that exact
  // timestamp get highlighted — same idea as a chapter list following along
  // with a scrubber.
  const activeTimestampSeconds = useMemo(() => {
    if (currentTime == null) return null;
    let best = null;
    for (const c of comments) {
      for (const ts of parseTimestamps(c.content)) {
        if (ts.seconds <= currentTime && (best === null || ts.seconds > best)) {
          best = ts.seconds;
        }
      }
    }
    return best;
  }, [comments, currentTime]);

  // Keep the active chapter comment in view as playback advances, without
  // yanking scroll position around when there's no active timestamp yet.
  useEffect(() => {
    if (activeTimestampSeconds != null) {
      activeCommentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTimestampSeconds]);

  function handleSeek(seconds) {
    onSeek?.(seconds);
  }

  const light = variant !== 'inline';

  // Optimistic like toggle; rolled back if the request fails. Temp (pending) comments can't be liked yet.
  async function handleLike(c) {
    if (c.pending) return;
    if (!localStorage.getItem('token')) {
      window.location.href = '/login';
      return;
    }
    const apply = (liked, likeCount) =>
      setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, liked, likeCount } : x)));
    const wasLiked = !!c.liked;
    const was = c.likeCount || 0;
    apply(!wasLiked, Math.max(0, was + (wasLiked ? -1 : 1)));
    try {
      const r = await api.likeComment(c.id);
      apply(!!r.liked, r.likeCount ?? 0);
    } catch {
      apply(wasLiked, was);
      toast.error('Something went wrong. Please try again.');
    }
  }

  // Replies are one level deep: replying to a reply attaches to the same top-level comment (as on TikTok).
  function handleReply(c) {
    const handle = c.user?.username ? `@${c.user.username} ` : '';
    const topId = c.parentCommentId || c.id;
    setReplyTo({ id: topId, username: c.user?.username || '' });
    setText(handle);
    setOpenThreads((s) => new Set(s).add(topId));
    inputRef.current?.focus();
  }

  function toggleThread(id) {
    setOpenThreads((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // Top-level comments (sorted) with their replies (oldest first). The earliest top-level comment gets the
  // "First comment" badge.
  const { threads, firstId } = useMemo(() => {
    const byParent = new Map();
    const tops = [];
    for (const c of comments) {
      if (c.parentCommentId && comments.some((x) => x.id === c.parentCommentId)) {
        if (!byParent.has(c.parentCommentId)) byParent.set(c.parentCommentId, []);
        byParent.get(c.parentCommentId).push(c);
      } else tops.push(c);
    }
    const time = (c) => new Date(c.createdAt).getTime();
    const oldest = tops.filter((c) => !c.pending).reduce((m, c) => (!m || time(c) < time(m) ? c : m), null);
    tops.sort((a, b) => (sort === 'top' ? (b.likeCount || 0) - (a.likeCount || 0) || time(b) - time(a) : time(b) - time(a)));
    return {
      threads: tops.map((c) => ({ c, replies: (byParent.get(c.id) || []).sort((a, b) => time(a) - time(b)) })),
      firstId: oldest?.id ?? null,
    };
  }, [comments, sort]);

  function renderRow(c, isReply) {
    const parts = splitContent(c.content);
    const isActive =
      activeTimestampSeconds != null &&
      parts.some((p) => p.type === 'timestamp' && p.seconds === activeTimestampSeconds);
    const avatar = isReply ? 'w-7 h-7' : 'w-9 h-9';
    return (
      <div
        key={c.id}
        ref={isActive ? activeCommentRef : null}
        className={`flex gap-3 -mx-2 px-2 py-1.5 rounded-sprocket transition-colors ${
          isActive ? (light ? 'bg-zinc-50 ring-1 ring-zinc-200' : 'bg-reel/10 ring-1 ring-reel/40') : ''
        } ${c.pending ? 'opacity-60' : ''}`}
      >
        {c.user?.avatarUrl ? (
          <img src={c.user.avatarUrl} alt="" className={`${avatar} rounded-full object-cover shrink-0 bg-zinc-200`} />
        ) : (
          <div className={`${avatar} rounded-full flex items-center justify-center font-extrabold text-xs shrink-0 ${light ? 'bg-zinc-200 text-zinc-600' : 'bg-reel/20 text-reel'}`}>
            {c.user?.username?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <CommentText comment={c} onSeek={handleSeek} light={light} />
          {light && !isReply && c.id === firstId && (
            <span className="inline-block mt-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-500 text-xs font-semibold">First comment</span>
          )}
          <p className={`text-xs mt-1 flex items-center gap-4 ${light ? 'text-zinc-400 font-medium' : 'font-bold text-[11px] text-neutral-400'}`}>
            <span>{c.pending ? 'Posting…' : timeAgo(c.createdAt)}</span>
            {light && !c.pending && (
              <button type="button" onClick={() => handleReply(c)} className="font-semibold text-zinc-500 active:opacity-60">
                Reply
              </button>
            )}
          </p>
        </div>
        {light && !c.pending && (
          <button
            type="button"
            onClick={() => handleLike(c)}
            aria-label={c.liked ? 'Unlike comment' : 'Like comment'}
            aria-pressed={!!c.liked}
            className="shrink-0 flex flex-col items-center gap-0.5 pt-1 px-1 active:scale-90 transition-transform"
          >
            <Heart size={18} className={c.liked ? 'text-[#fe2c55]' : 'text-zinc-400'} fill={c.liked ? 'currentColor' : 'none'} />
            <span className="text-[11px] text-zinc-400 font-medium tabular-nums">{c.likeCount || 0}</span>
          </button>
        )}
      </div>
    );
  }

  const body = (
    <>
      <div className={`flex-1 overflow-y-auto px-4 py-4 space-y-4 ${light ? 'bg-white' : ''}`}>
        {loading && <LoadingSpinner label="Loading…" />}
        {!loading && comments.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 gap-2">
            <span className="text-4xl text-zinc-400">💬</span>
            <p className={`font-bold tracking-tight text-sm ${light ? 'text-zinc-700' : 'text-neutral-300'}`}>No comments yet</p>
            <p className={`font-semibold text-xs ${light ? 'text-zinc-400' : 'text-neutral-400'}`}>Be the first to say something.</p>
          </div>
        )}
        {threads.map(({ c, replies }) => (
          <div key={c.id}>
            {renderRow(c, false)}
            {replies.length > 0 && (
              <div className="ml-12">
                <button
                  type="button"
                  onClick={() => toggleThread(c.id)}
                  className={`flex items-center gap-2 py-1.5 text-xs font-semibold ${light ? 'text-zinc-500' : 'text-neutral-400'}`}
                  aria-expanded={openThreads.has(c.id)}
                >
                  <span className={`w-6 h-px ${light ? 'bg-zinc-300' : 'bg-neutral-600'}`} aria-hidden="true" />
                  {openThreads.has(c.id) ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                  <ChevronDown size={14} className={openThreads.has(c.id) ? 'rotate-180' : ''} />
                </button>
                {openThreads.has(c.id) && <div className="space-y-3 mt-1">{replies.map((r) => renderRow(r, true))}</div>}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={handlePost}
        // In the mobile overlay the fixed BottomNav (z-40, ~64px tall) sits
        // over the bottom of the sheet, so the input row needs extra bottom
        // padding to land fully above the nav icons. The inline (desktop
        // rail) variant has no BottomNav, so it keeps the normal padding.
        className={`relative z-30 flex flex-col gap-1.5 p-4 border-t ${
          light ? 'border-zinc-100 bg-white' : 'border-smoke/10 bg-ink2'
        } ${variant === 'inline' ? '' : 'pb-[calc(5rem+env(safe-area-inset-bottom))]'}`}
      >
        {light && replyTo && (
          <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
            <span>Replying to <b className="text-zinc-700">@{replyTo.username}</b></span>
            <button type="button" onClick={() => { setReplyTo(null); setText(''); }} aria-label="Cancel reply" className="p-1"><X size={14} /></button>
          </div>
        )}
        <div className="flex gap-2 items-center">
          {light && (
            user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 bg-zinc-200" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-zinc-200 text-zinc-600 flex items-center justify-center text-xs font-extrabold shrink-0">
                {user?.username?.[0]?.toUpperCase() || '?'}
              </div>
            )
          )}
          <div className={`flex-1 min-w-0 flex items-center ${light ? 'bg-zinc-100 rounded-full pr-2' : ''}`}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={light ? 'Add comment…' : 'Add a comment… try a timestamp like 0:14'}
              className={`flex-1 text-sm min-w-0 outline-none ${
                light
                  ? 'bg-transparent text-zinc-900 placeholder:text-zinc-400 px-4 py-2.5'
                  : 'bg-zinc-800/80 border border-zinc-700 text-white placeholder:text-neutral-400 placeholder:font-bold font-bold text-xs rounded-sprocket px-3 py-2 focus:ring-2 focus:ring-amber-500/50'
              }`}
            />
            {light && (
              <>
                <button type="button" onClick={() => setShowEmoji((v) => !v)} aria-label="Emoji" className="p-1.5 text-zinc-700 active:opacity-60">
                  <Smile size={22} />
                </button>
                <button
                  type="button"
                  onClick={() => { setText((t) => `${t}@`); inputRef.current?.focus(); }}
                  aria-label="Mention someone"
                  className="p-1.5 text-zinc-700 active:opacity-60"
                >
                  <AtSign size={22} />
                </button>
              </>
            )}
          </div>
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className={`font-bold text-xs px-4 py-2 rounded-full transition-all disabled:opacity-100 ${
              light
                ? 'bg-[#fe2c55] text-white disabled:bg-zinc-100 disabled:text-zinc-400'
                : 'bg-amber-500 hover:bg-amber-400 text-black rounded-xl disabled:opacity-50 disabled:hover:bg-amber-500'
            }`}
          >
            Post
          </button>
        </div>
        {light && showEmoji && (
          <div className="flex flex-wrap gap-1 px-1 pt-1">
            {['😂', '😍', '🥰', '🔥', '👏', '🙌', '😭', '💯', '❤️', '🙏', '😮', '👍'].map((e) => (
              <button key={e} type="button" onClick={() => { setText((t) => t + e); inputRef.current?.focus(); }} className="text-2xl p-1 active:scale-90 transition-transform">
                {e}
              </button>
            ))}
          </div>
        )}
        {!light && (
          <p className="font-semibold text-[11px] text-neutral-400 px-1 leading-snug">
            Timestamps like 0:14 or 1:25 become clickable chapter markers.
          </p>
        )}
      </form>
    </>
  );

  if (variant === 'inline') {
    return <div className="h-full flex flex-col">{body}</div>;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-end" data-no-swipe>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-h-[70%] min-h-[45%] bg-white rounded-t-2xl flex flex-col font-sans text-zinc-900">
        <div className="pt-2 pb-3 px-4 relative">
          <div className="mx-auto w-10 h-1 rounded-full bg-zinc-300" aria-hidden="true" />
          <div className="mt-3 relative flex items-center justify-center gap-2">
            <p className="font-bold text-sm text-zinc-900">
              {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </p>
            <button type="button" onClick={() => setShowSort((v) => !v)} aria-label="Sort comments" aria-expanded={showSort} className="p-1 text-zinc-700 active:opacity-60">
              <ArrowUpDown size={16} />
            </button>
            {showSort && (
              <div className="absolute top-full mt-1 z-10 bg-white border border-zinc-200 shadow-xl rounded-xl overflow-hidden text-sm">
                {[['top', 'Top comments'], ['new', 'Newest first']].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setSort(k); setShowSort(false); }}
                    className={`block w-full text-left px-4 py-2.5 hover:bg-zinc-50 ${sort === k ? 'font-bold text-zinc-900' : 'text-zinc-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close comments" className="absolute right-3 top-5 p-1 text-zinc-500">
            <X size={20} />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
});

export default CommentsPanel;
