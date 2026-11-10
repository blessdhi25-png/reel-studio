'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { ALLOWED_CIRCLES } from '@/lib/circles';
import { xhrUpload } from '@/lib/xhrUpload';
import PhotoMedia from './PhotoMedia';
import TextOverlayEditor from './TextOverlayEditor';

const MAX_BYTES = 20 * 1024 * 1024;
const NATIVE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const CAPTION_MAX = 150;

// Segmented Video | Photo switch, shared by the camera screen and this studio.
export function MediaTypeToggle({ value, onChange, className = '' }) {
  return (
    <div
      role="tablist"
      aria-label="Post type"
      className={`inline-flex rounded-full bg-black/55 backdrop-blur-md p-1 ${className}`}
    >
      {[
        ['video', 'Video'],
        ['photo', 'Photo'],
      ].map(([id, label]) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={value === id}
          onClick={() => value !== id && onChange(id)}
          className={`px-4 py-1.5 rounded-full text-sm font-extrabold tracking-tight transition-colors ${
            value === id ? 'bg-amber-500 text-black' : 'text-white/80'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// HEIC/AVIF/BMP etc. aren't accepted by the server. Browsers that can decode
// them (Safari for HEIC) re-encode through a canvas to a high-quality JPEG;
// one that can't gets a clear message instead of an opaque upload failure.
async function normalizeImage(file) {
  if (NATIVE_TYPES.includes(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.95));
    if (!blob) throw new Error('encode failed');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    throw new Error("This browser can't read that image format — please use JPG, PNG, WEBP or GIF.");
  }
}

export default function UploadStudio({ communityTarget, initialFile, onSwitchToVideo, onExit }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const xhrRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [overlays, setOverlays] = useState([]);
  const [caption, setCaption] = useState('');
  const [circle, setCircle] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState(null); // null | uploading | done | error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const pick = useCallback(async (selected) => {
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, WEBP or GIF).');
      return;
    }
    try {
      const f = await normalizeImage(selected);
      if (f.size > MAX_BYTES) {
        setError('That photo is over 20 MB — choose a smaller one.');
        return;
      }
      setError(null);
      setFile(f);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // A photo picked from the camera screen's gallery button arrives here.
  useEffect(() => {
    if (initialFile) pick(initialFile);
  }, [initialFile, pick]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function publish() {
    if (!file || status === 'uploading') return;
    setStatus('uploading');
    setError(null);
    setProgress(0);
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('caption', caption);
    if (circle) fd.append('circle', circle);
    if (overlays.length) fd.append('textOverlays', JSON.stringify(overlays));
    try {
      const result = await xhrUpload(
        `/videos/photo${communityTarget ? `?communityId=${encodeURIComponent(communityTarget.id)}` : ''}`,
        fd,
        { onProgress: setProgress, xhrRef }
      );
      setStatus('done');
      if (result?.rawUrl && !communityTarget) {
        let me = null;
        try { me = JSON.parse(localStorage.getItem('user') || 'null'); } catch { /* ignore */ }
        // Same optimistic hand-off the video flow uses — app/page.jsx shows it
        // at the top of the feed until the real feed response includes it.
        sessionStorage.setItem('pendingUpload', JSON.stringify({
          id: result.id, mediaType: 'photo', videoUrl: result.rawUrl, thumbnailUrl: result.rawUrl,
          caption, circle: result.circle, videoType: 'short', textOverlays: result.textOverlays || null,
          user: me, likeCount: 0, commentCount: 0, bookmarkCount: 0, postedAt: Date.now(),
        }));
      }
      setTimeout(() => router.push(communityTarget ? `/communities/${communityTarget.id}` : '/'), 500);
    } catch (err) {
      if (err.name === 'AbortError') setStatus(null);
      else {
        setStatus('error');
        setError(err.message);
      }
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    pick(e.dataTransfer.files?.[0]);
  }

  const uploading = status === 'uploading';

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 z-30">
        <button
          type="button"
          onClick={() => { xhrRef.current?.abort(); onExit(); }}
          aria-label="Close studio"
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
        >
          <X className="w-4 h-4" strokeWidth={3} />
        </button>
        <MediaTypeToggle value="photo" onChange={(v) => v === 'video' && onSwitchToVideo()} />
        <span className="w-9" />
      </div>

      {!file ? (
        <div className="flex-1 px-5 pb-8 flex">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex-1 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-3 px-6 text-center transition-colors ${
              dragOver ? 'border-amber-500 bg-amber-500/10' : 'border-white/25 bg-white/5'
            }`}
          >
            <span className="w-16 h-16 rounded-2xl bg-amber-500 text-black flex items-center justify-center">
              <ImagePlus className="w-8 h-8" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Drop a photo here</span>
            <span className="text-sm font-bold text-white/60">or tap to choose from your gallery · JPG, PNG, WEBP, GIF · up to 20 MB</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0">
            <PhotoMedia src={previewUrl} overlays={null}>
              <TextOverlayEditor overlays={overlays} onChange={setOverlays} />
            </PhotoMedia>
          </div>

          <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2.5 bg-black">
            {communityTarget && (
              <p className="text-xs font-bold text-white/60">
                Posting to <span className="text-amber-400">{communityTarget.name}</span>
              </p>
            )}
            <div className="relative">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
                rows={2}
                placeholder="Write a caption…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm font-bold tracking-tight placeholder-zinc-500 outline-none resize-none focus:ring-2 focus:ring-amber-500/50"
              />
              <span className="absolute bottom-2 right-3 text-[10px] font-bold text-zinc-500">{CAPTION_MAX - caption.length}</span>
            </div>
            <select
              value={circle}
              onChange={(e) => setCircle(e.target.value)}
              aria-label="Circle"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-sm font-bold text-white outline-none"
            >
              <option value="">No circle</option>
              {ALLOWED_CIRCLES.map((c) => (
                <option key={c.id ?? c} value={c.id ?? c}>{c.label ?? c}</option>
              ))}
            </select>
            {error && <p className="text-sm font-bold text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => { setFile(null); setOverlays([]); setError(null); }}
                className="px-5 py-3.5 rounded-2xl bg-zinc-800 text-white font-extrabold text-sm disabled:opacity-40"
              >
                Change
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={uploading || status === 'done'}
                className="flex-1 relative overflow-hidden flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-base disabled:opacity-80"
              >
                {uploading && <span className="absolute inset-y-0 left-0 bg-amber-300/70" style={{ width: `${progress}%` }} />}
                <span className="relative flex items-center gap-2">
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={3} />}
                  {status === 'done' ? 'Posted ✓' : uploading ? `Posting… ${progress}%` : status === 'error' ? 'Try again' : 'Post photo'}
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      {!file && error && <p className="px-5 pb-6 -mt-3 text-sm font-bold text-red-400 text-center">{error}</p>}
    </main>
  );
}
