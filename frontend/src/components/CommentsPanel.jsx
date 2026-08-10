'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

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
const CommentsPanel = forwardRef(function CommentsPanel(
  { videoId, onClose, onCountChange, variant = 'overlay', currentTime = null, onSeek },
  ref
) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
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
      user: { id: user?.id, username: user?.username, avatarUrl: user?.avatarUrl },
      pending: true,
    };
    setComments((prev) => [optimisticComment, ...prev]);
    setText('');
    onCountChange?.((c) => c + 1);

    setPosting(true);
    try {
      const saved = await api.postComment(videoId, content);
      // Swap the optimistic placeholder for the real server record (real
      // id, server-assigned createdAt, etc.) rather than leaving the fake
      // one in place — later features keying off comment.id (replies,
      // deletion) need the real id.
      setComments((prev) => prev.map((c) => (c.id === tempId ? saved : c)));
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

  const body = (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading && <p className="font-body text-smoke text-sm">Loading…</p>}
        {!loading && comments.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 gap-2">
            <span className="text-4xl text-zinc-400">💬</span>
            <p className="font-body text-zinc-400 text-sm">No comments yet</p>
            <p className="font-body text-zinc-400/70 text-xs">Be the first to say something.</p>
          </div>
        )}
        {comments.map((c) => {
          const parts = splitContent(c.content);
          const isActive =
            activeTimestampSeconds != null &&
            parts.some((p) => p.type === 'timestamp' && p.seconds === activeTimestampSeconds);

          return (
            <div
              key={c.id}
              ref={isActive ? activeCommentRef : null}
              className={`flex gap-3 -mx-2 px-2 py-1.5 rounded-sprocket transition-colors ${
                isActive ? 'bg-reel/10 ring-1 ring-reel/40' : ''
              } ${c.pending ? 'opacity-60' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-reel/20 flex items-center justify-center font-mono text-xs text-reel shrink-0">
                {c.user?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="font-body text-sm text-bone">
                  <span className="text-reel">@{c.user?.username}</span>{' '}
                  {parts.map((p, i) =>
                    p.type === 'timestamp' ? (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSeek(p.seconds);
                        }}
                        className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-sprocket bg-reel/20 text-reel font-mono text-xs align-middle hover:bg-reel/30 active:bg-reel/40"
                        title={`Jump to ${p.value}`}
                      >
                        ▶ {p.value}
                      </button>
                    ) : (
                      <span key={i}>{p.value}</span>
                    )
                  )}
                </p>
                <p className="font-mono text-[10px] text-smoke mt-1">
                  {c.pending ? 'Posting…' : new Date(c.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handlePost} className="flex flex-col gap-1.5 p-4 border-t border-smoke/10">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment… try a timestamp like 0:14"
            className="flex-1 bg-zinc-800/80 border border-zinc-700 text-white font-body text-sm rounded-sprocket px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-amber-500"
          >
            Post
          </button>
        </div>
        <p className="font-mono text-[10px] text-smoke/60 px-1">
          Timestamps like 0:14 or 1:25 become clickable chapter markers.
        </p>
      </form>
    </>
  );

  if (variant === 'inline') {
    return <div className="h-full flex flex-col">{body}</div>;
  }

  return (
    <div className="absolute inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-ink/70" onClick={onClose} />
      <div className="relative w-full max-h-[70%] bg-ink2 rounded-t-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-smoke/10">
          <p className="font-display text-xl text-bone tracking-wide">Comments</p>
          <button onClick={onClose} className="text-smoke text-sm font-body">
            Close
          </button>
        </div>
        {body}
      </div>
    </div>
  );
});

export default CommentsPanel;
