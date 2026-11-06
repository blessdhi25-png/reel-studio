'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

const CAPTION_MAX = 2200;
// Uuid-ish ids (letters, digits, dashes). Anything starting with http is treated as a URL instead.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Bottom-sheet composer for posting into a community. A post is a caption plus one
// media source: the ID of one of your own published videos, or a direct https link
// to a video file. (For a brand-new recording, the upload flow links out below.)
export default function CommunityPostModal({ communityId, communityName, onClose, onPosted }) {
  const toast = useToast();
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const captionRef = useRef(null);

  useEffect(() => {
    captionRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    const value = media.trim();
    const isUrl = /^https?:\/\//i.test(value);
    if (!value) return setError('Attach a video ID or a media URL.');
    if (isUrl && !/^https:\/\//i.test(value)) return setError('Media links must use https.');
    if (!isUrl && !VIDEO_ID_RE.test(value)) return setError("That doesn't look like a video ID or a link.");

    setBusy(true);
    setError(null);
    try {
      const post = await api.createCommunityPost(communityId, {
        caption: caption.trim(),
        ...(isUrl ? { mediaUrl: value } : { videoId: value }),
      });
      toast.success('Posted to ' + communityName);
      onPosted?.(post);
      onClose();
    } catch (err) {
      setError(err.message || "Couldn't publish your post. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center font-sans">
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onClose()} aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={`Create a post in ${communityName}`}
        className="relative w-full max-w-md bg-neutral-900 border-t border-neutral-800 rounded-t-3xl p-5 shadow-2xl max-h-[90dvh] overflow-y-auto"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="w-10 h-1 rounded-full bg-neutral-700 mx-auto mb-4" aria-hidden="true" />
        <h2 className="font-bold text-lg text-white">Create post</h2>
        <p className="font-medium text-xs text-neutral-400 mt-0.5 mb-4 truncate">in {communityName}</p>

        <label htmlFor="cp-caption" className="block text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
          Caption
        </label>
        <textarea
          id="cp-caption"
          ref={captionRef}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={CAPTION_MAX}
          rows={4}
          placeholder="Say something about this post…"
          className="w-full bg-neutral-800/80 border border-neutral-700 text-white placeholder-neutral-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/60 resize-none"
        />

        <label htmlFor="cp-media" className="block text-[11px] font-bold uppercase tracking-wider text-neutral-400 mt-4 mb-1.5">
          Video ID or media URL
        </label>
        <input
          id="cp-media"
          value={media}
          onChange={(e) => {
            setMedia(e.target.value);
            setError(null);
          }}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Your video's ID, or https://…/clip.mp4"
          className="w-full bg-neutral-800/80 border border-neutral-700 text-white placeholder-neutral-500 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-amber-500/60"
        />
        <p className="font-medium text-[11px] text-neutral-500 mt-1.5">
          Use the ID of one of your published videos, or a direct https link to a .mp4, .webm, .mov or .m3u8 file.{' '}
          <Link
            href={`/upload?community=${communityId}`}
            onClick={onClose}
            className="text-amber-500 font-bold hover:text-amber-400"
          >
            Upload a new video instead
          </Link>
        </p>

        {error && (
          <p role="alert" className="font-bold text-xs text-rose-400 mt-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-5 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !media.trim()}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}
