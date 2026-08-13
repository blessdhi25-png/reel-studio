'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, API_BASE } from '../../lib/api';
import { ALLOWED_CIRCLES } from '../../lib/circles';
import CameraRecorder from '../../components/CameraRecorder';
import AICoPilotDrawer from '../../components/AICoPilotDrawer';

const CAPTION_MAX = 2200;

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public (Everyone)' },
  { value: 'friends', label: 'Friends Only' },
  { value: 'private', label: 'Private (Only Me)' },
];

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function UploadCloudIcon(props) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.98" />
      <path d="M12 12v9" />
      <path d="m8 16 4-4 4 4" />
    </svg>
  );
}

function CameraVideoIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m22 8-6 4 6 4V8Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function HashIcon(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

function SmileIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function SpinnerIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function XIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

const EMOJI_QUICKSET = ['🔥', '😂', '❤️', '🎬', '✨', '🎉', '👀', '🙌'];

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function UploadPage() {
  // useSearchParams() (added for the ?trackId= preselect handoff below)
  // requires a Suspense boundary around any usage or `next build` fails
  // with "missing-suspense-with-csr-bailout" — the actual page body moved
  // into UploadPageInner so this wrapper can provide that boundary.
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  );
}

function UploadPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef(null);
  const captionRef = useRef(null);
  const xhrRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const [videoType, setVideoType] = useState('short');
  const [caption, setCaption] = useState('');
  const [circle, setCircle] = useState(null);

  // Sound picker — searches tracks distributed by registered artists
  // (Artist Hub) so any creator can attach an official track to their post.
  const [trackQuery, setTrackQuery] = useState('');
  const [trackResults, setTrackResults] = useState([]);
  const [trackSearching, setTrackSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);

  // Publishing privileges. The backend's Video model currently only
  // persists caption/videoType/circle (see backend/src/routes/videos.js),
  // so visibility + interaction toggles are fully interactive here and
  // sent along in the upload payload, but the server will silently
  // ignore anything it doesn't recognize until those columns exist.
  const [visibility, setVisibility] = useState('public');
  const [allowComments, setAllowComments] = useState(true);
  const [allowDuets, setAllowDuets] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(true);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState(null); // null | uploading | done | error
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) router.push('/login');
  }, [router]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!trackQuery.trim()) {
      setTrackResults([]);
      return;
    }
    setTrackSearching(true);
    const handle = setTimeout(() => {
      api
        .searchTracks(trackQuery.trim())
        .then(setTrackResults)
        .catch(() => setTrackResults([]))
        .finally(() => setTrackSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [trackQuery]);

  // Preselects a sound handed off from a reel's vinyl badge / SoundPicker
  // ("Use This Sound" -> /upload?trackId=...). Only resolves the id once,
  // on mount — a straggler request finishing after the person has already
  // picked or cleared a different sound by hand shouldn't clobber it, and
  // a bad/deleted trackId just silently leaves the picker empty instead of
  // erroring the page.
  useEffect(() => {
    const trackId = searchParams.get('trackId');
    if (!trackId) return;
    let cancelled = false;
    api
      .getTrack(trackId)
      .then((track) => {
        if (!cancelled) setSelectedTrack(track);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickFile(selected) {
    if (!selected) return;
    if (!selected.type.startsWith('video/')) {
      setErrorMsg('Please choose a video file.');
      return;
    }
    setErrorMsg(null);
    setFile(selected);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  function handleCaptured(capturedFile) {
    setFile(capturedFile);
    setShowCamera(false);
  }

  function insertHashtag() {
    const textarea = captionRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart ?? caption.length;
    const before = caption.slice(0, pos);
    const after = caption.slice(pos);
    const needsSpace = before.length && !/\s$/.test(before);
    const insert = `${needsSpace ? ' ' : ''}#`;
    const next = `${before}${insert}${after}`.slice(0, CAPTION_MAX);
    setCaption(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = (before + insert).length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function insertEmoji(emoji) {
    setCaption((prev) => (prev + emoji).slice(0, CAPTION_MAX));
    setShowEmoji(false);
  }

  // AICoPilotDrawer's onInsert contract is deliberately just (text: string)
  // => void — it never touches caller state directly (see the doc comment
  // on the component itself), so it's up to this page to decide what
  // "insert" means: replace an empty draft outright, or append with a
  // separating space onto an existing one. Not cursor-aware like
  // insertHashtag() above — AI output is either a full caption or a block
  // of hashtags, not a single character being dropped at wherever the
  // cursor happens to be.
  function handleAiInsert(text) {
    setCaption((prev) => {
      if (!prev.trim()) return text.slice(0, CAPTION_MAX);
      const needsSpace = !/\s$/.test(prev);
      return `${prev}${needsSpace ? ' ' : ''}${text}`.slice(0, CAPTION_MAX);
    });
  }

  function handleCancel() {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setFile(null);
    setCaption('');
    setCircle(null);
    setStatus(null);
    setUploadProgress(0);
    setErrorMsg(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || status === 'uploading') return;

    setStatus('uploading');
    setErrorMsg(null);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('caption', caption);
    formData.append('videoType', videoType);
    if (circle) formData.append('circle', circle);
    if (selectedTrack) formData.append('trackId', selectedTrack.id);
    formData.append('visibility', visibility);
    formData.append('allowComments', String(allowComments));
    formData.append('allowDuets', String(allowDuets));
    formData.append('allowDownloads', String(allowDownloads));

    try {
      const result = await uploadWithProgress(formData, setUploadProgress, xhrRef);
      setStatus('done');

      // Real processing (HLS transcode) happens async on the backend — the
      // video won't show up in GET /videos/feed until that finishes and
      // flips status to 'published'. Stashing a lightweight optimistic
      // entry (using the raw file's own immediately-servable URL from the
      // upload response) lets the feed show it right away instead of
      // waiting; app/page.jsx reads and clears this on mount.
      if (result?.rawUrl) {
        const stored = localStorage.getItem('user');
        const me = stored ? JSON.parse(stored) : null;
        sessionStorage.setItem(
          'pendingUpload',
          JSON.stringify({
            id: result.id,
            videoUrl: result.rawUrl,
            caption,
            circle: result.circle,
            // videoType matters here — without it the feed can't tell which
            // tab (All / Shorts / Features) this optimistic entry belongs
            // in, and would either show it under the wrong tab or drop it
            // entirely once real per-tab filtering is applied.
            videoType: videoType === 'long' ? 'long' : 'short',
            user: me,
            likeCount: 0,
            commentCount: 0,
            bookmarkCount: 0,
            processing: true,
            postedAt: Date.now(),
          })
        );
      }
      setTimeout(() => router.push('/'), 600);
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus(null);
      } else {
        setStatus('error');
        setErrorMsg(err.message || 'Upload failed. Please try again.');
      }
    }
  }

  const captionRemaining = CAPTION_MAX - caption.length;

  return (
    <main className="min-h-screen bg-black px-4 pb-32">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto p-6 md:p-10">
        <div className="lg:col-span-12 mb-2">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Creator Studio</h1>
          <p className="text-zinc-400 text-sm mt-1">Upload, tag, and publish your next post.</p>
        </div>

        {/* Left column — media dropzone & preview */}
        <div className="lg:col-span-5">
          <Dropzone
            file={file}
            previewUrl={previewUrl}
            dragActive={dragActive}
            setDragActive={setDragActive}
            onDrop={handleDrop}
            onPick={() => fileInputRef.current?.click()}
            onClear={() => setFile(null)}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-semibold text-sm transition-all"
          >
            <CameraVideoIcon />
            Record with Camera
          </button>

          {errorMsg && status !== 'error' && (
            <p className="text-xs text-red-400 mt-3">{errorMsg}</p>
          )}
        </div>

        {/* Right column — metadata & distribution */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-6">
            {/* Format selector */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Format
              </label>
              <div className="flex gap-2 p-1 bg-zinc-800/60 border border-zinc-800 rounded-2xl w-fit">
                {[
                  { id: 'short', label: 'Short Clip (<60s)' },
                  { id: 'long', label: 'Full Feature (>60s)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVideoType(opt.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      videoType === opt.id
                        ? 'bg-amber-500 text-black font-bold shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Caption */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Caption
                </label>
                <span className={`text-[11px] font-mono ${captionRemaining <= 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {caption.length} / {CAPTION_MAX} characters
                </span>
              </div>
              <textarea
                ref={captionRef}
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
                placeholder="Write a caption that pops…"
                rows={4}
                maxLength={CAPTION_MAX}
                className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all resize-none placeholder:text-zinc-500"
              />
              <div className="flex items-center gap-2 mt-2 relative">
                <button
                  type="button"
                  onClick={insertHashtag}
                  className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded-full transition-all"
                >
                  <HashIcon /> Hashtag
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmoji((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded-full transition-all"
                >
                  <SmileIcon /> Emoji
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-xs font-bold text-white shadow-md hover:opacity-90 transition-opacity"
                >
                  ✨ Assist with AI
                </button>

                {showEmoji && (
                  <div className="absolute top-full left-0 mt-2 z-20 flex flex-wrap gap-1 bg-zinc-800 border border-zinc-700 rounded-2xl p-2 shadow-xl w-48">
                    {EMOJI_QUICKSET.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="text-lg hover:bg-zinc-700 rounded-lg w-9 h-9 flex items-center justify-center transition-all"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <AICoPilotDrawer
              open={isAiOpen}
              onClose={() => setIsAiOpen(false)}
              onInsert={handleAiInsert}
              initialTopic={caption}
            />

            {/* Topic circles */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Topic Circles <span className="text-zinc-600 normal-case font-normal">(optional)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {ALLOWED_CIRCLES.map((c) => {
                  const active = circle === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCircle((prev) => (prev === c ? null : c))}
                      className={`text-xs px-3 py-1.5 rounded-full cursor-pointer transition-all border ${
                        active
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500 font-semibold'
                          : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-zinc-500 mt-2">
                Pin this post to a community so viewers can filter the feed down to it.
              </p>
            </div>

            {/* Sound picker */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Sound <span className="text-zinc-600 normal-case font-normal">(optional)</span>
              </label>

              {selectedTrack ? (
                <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
                  <p className="text-sm text-white truncate">
                    🎵 {selectedTrack.title} <span className="text-zinc-400">· {selectedTrack.artistName}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedTrack(null)}
                    className="text-zinc-400 hover:text-white shrink-0"
                    aria-label="Remove sound"
                  >
                    <XIcon />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={trackQuery}
                    onChange={(e) => setTrackQuery(e.target.value)}
                    placeholder="Search official tracks from artists…"
                    className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all placeholder:text-zinc-500"
                  />
                  {trackQuery.trim() && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 z-20 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl max-h-56 overflow-y-auto">
                      {trackSearching && <p className="text-xs text-zinc-500 px-4 py-3">Searching…</p>}
                      {!trackSearching && trackResults.length === 0 && (
                        <p className="text-xs text-zinc-500 px-4 py-3">No tracks found.</p>
                      )}
                      {trackResults.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTrack(t);
                            setTrackQuery('');
                            setTrackResults([]);
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-zinc-700 transition-colors"
                        >
                          🎵 {t.title} <span className="text-zinc-400">· {t.artistName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px] text-zinc-500 mt-2">
                Only tracks distributed by registered artists show up here.{' '}
                <a href="/artist/register" className="text-amber-400 hover:text-amber-300">
                  Distribute your own →
                </a>
              </p>
            </div>
          </div>

          {/* Publishing privileges */}
          <PublishingPrivileges
            visibility={visibility}
            setVisibility={setVisibility}
            allowComments={allowComments}
            setAllowComments={setAllowComments}
            allowDuets={allowDuets}
            setAllowDuets={setAllowDuets}
            allowDownloads={allowDownloads}
            setAllowDownloads={setAllowDownloads}
          />
        </div>
      </form>

      {/* Sticky footer — z-50 so it's guaranteed to sit above BottomNav's z-40
          even if BottomNav ever briefly renders during a route transition
          (BottomNav is also hidden outright on /upload — see HIDDEN_ON in
          components/BottomNav.jsx — this is defense-in-depth for that).
          The extra bottom padding matches BottomNav's own safe-area handling
          so Discard/Post don't end up in the iOS home-indicator dead zone. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-black/90 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-10">
          {status === 'uploading' && (
            <div className="pt-3">
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5">Uploading… {uploadProgress}%</p>
            </div>
          )}

          {status === 'done' && (
            <p className="text-xs text-emerald-400 pt-3">
              Uploaded — it'll appear in the feed once processing finishes.
            </p>
          )}
          {status === 'error' && (
            <p className="text-xs text-red-400 pt-3">{errorMsg || 'Something went wrong. Try again.'}</p>
          )}

          <div className="py-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={status === 'uploading'}
              className="hover:bg-zinc-800 text-zinc-400 font-medium px-5 py-2.5 rounded-xl transition-all text-sm disabled:opacity-40"
            >
              {status === 'uploading' ? 'Discard' : 'Discard / Cancel'}
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={!file || status === 'uploading' || status === 'done'}
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl shadow-lg transition-all text-base flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'uploading' && <SpinnerIcon />}
              {status === 'uploading' ? 'Publishing…' : 'Post / Publish Video'}
            </button>
          </div>
        </div>
      </div>

      {showCamera && (
        <CameraRecorder onCaptured={handleCaptured} onCancel={() => setShowCamera(false)} />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Dropzone + preview player                                           */
/* ------------------------------------------------------------------ */

function Dropzone({ file, previewUrl, dragActive, setDragActive, onDrop, onPick, onClear }) {
  if (previewUrl) {
    return (
      <div className="relative aspect-[9/16] min-h-[420px] rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800">
        <VideoPreview src={previewUrl} />
        <button
          type="button"
          onClick={onClear}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center transition-all"
          aria-label="Remove video"
        >
          <XIcon />
        </button>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
          <p className="text-white text-xs font-medium truncate">{file?.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer aspect-[9/16] min-h-[420px] bg-zinc-900/50 ${
        dragActive ? 'border-amber-500/80 bg-zinc-900/80' : 'border-zinc-700 hover:border-amber-500/80'
      }`}
    >
      <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center text-amber-400 mb-4">
        <UploadCloudIcon />
      </div>
      <p className="text-white font-semibold text-sm mb-1">Drag & drop your video</p>
      <p className="text-zinc-500 text-xs text-center max-w-[220px]">
        or click to browse — MP4, MOV, WEBM
      </p>
    </div>
  );
}

function VideoPreview({ src }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function formatTime(t) {
    if (!Number.isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  }

  return (
    <div className="relative w-full h-full group">
      {/* playsInline + muted + autoPlay together is what makes mobile Safari
          and Chrome actually load the local blob's metadata and start
          rendering frames right away — without muted, mobile browsers block
          autoplay entirely and often delay firing onLoadedMetadata until the
          user manually taps play, which is what produces the stuck
          "0:00 / 0:00" readout. controls is added too as a native fallback
          scrubber; our own play button / time badge overlay stays as well
          since native controls on some Android WebViews don't reliably show
          for object URLs. */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        onClick={togglePlay}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        playsInline
        muted
        autoPlay
        controls
        loop
      />
      <button
        type="button"
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {!playing && (
          <span className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center text-white text-2xl pointer-events-auto">
            ▶
          </span>
        )}
      </button>
      <div className="absolute top-3 left-3 bg-black/70 text-white text-[11px] font-mono px-2 py-1 rounded-lg">
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Publishing privileges card                                          */
/* ------------------------------------------------------------------ */

function PublishingPrivileges({
  visibility,
  setVisibility,
  allowComments,
  setAllowComments,
  allowDuets,
  setAllowDuets,
  allowDownloads,
  setAllowDownloads,
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-5"
      >
        <div className="text-left">
          <h2 className="text-sm font-bold text-white">Publishing Privileges</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Control who can see and interact with this post.</p>
        </div>
        <span className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5 border-t border-zinc-800 pt-5">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Who can view this video
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
            >
              {VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-zinc-800">
            <ToggleRow
              title="Allow Comments"
              description="Let viewers comment on this post."
              checked={allowComments}
              onChange={() => setAllowComments((v) => !v)}
            />
            <ToggleRow
              title="Allow Duets / Stitches"
              description="Let others remix this video into their own."
              checked={allowDuets}
              onChange={() => setAllowDuets((v) => !v)}
            />
            <ToggleRow
              title="Allow Downloads"
              description="Let viewers save this video to their device."
              checked={allowDownloads}
              onChange={() => setAllowDownloads((v) => !v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
        checked ? 'bg-amber-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* XHR upload with real progress events (fetch has no upload-progress   */
/* API, so this bypasses lib/api.js's fetch-based request() just for    */
/* this one call).                                                      */
/* ------------------------------------------------------------------ */

function uploadWithProgress(formData, onProgress, xhrRef) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    xhr.open('POST', `${API_BASE}/videos`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        let message = 'Upload failed. Please try again.';
        try {
          message = JSON.parse(xhr.responseText).error || message;
        } catch {
          /* ignore parse errors, use default message */
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      reject(new Error('Network error during upload.'));
    };

    xhr.onabort = () => {
      xhrRef.current = null;
      const err = new Error('Upload cancelled');
      err.name = 'AbortError';
      reject(err);
    };

    xhr.send(formData);
  });
}
