'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';
import { ALLOWED_CIRCLES } from '@/lib/circles';
import CameraRecorder from '@/components/CameraRecorder';
import AICoPilotDrawer from '@/components/AICoPilotDrawer';
import SoundPicker from '@/components/SoundPicker';

const CAPTION_MAX = 2200;

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public (Everyone)' },
  { value: 'friends', label: 'Friends Only' },
  { value: 'private', label: 'Private (Only Me)' },
];

// Live-preview-only — see the CameraRecorder <video> comment further down
// for why these aren't (and can't cheaply be) baked into the actual
// recorded file.
const FILTERS = [
  { id: 'normal', label: 'Normal', css: '', swatch: 'linear-gradient(135deg,#52525b,#3f3f46)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(1.1) saturate(1.3) brightness(1.05)', swatch: 'linear-gradient(135deg,#b45309,#78350f)' },
  { id: 'noir', label: 'B&W · Noir', css: 'grayscale(1) contrast(1.3) brightness(0.95)', swatch: 'linear-gradient(135deg,#e5e5e5,#171717)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.2) saturate(1.4) hue-rotate(-8deg) brightness(1.05)', swatch: 'linear-gradient(135deg,#f59e0b,#dc2626)' },
  { id: 'cyberpunk', label: 'Cyberpunk', css: 'hue-rotate(220deg) saturate(2.2) contrast(1.2)', swatch: 'linear-gradient(135deg,#22d3ee,#a21caf)' },
  { id: 'glow', label: 'Glow', css: 'brightness(1.25) contrast(0.9) saturate(1.25)', swatch: 'linear-gradient(135deg,#fde68a,#fca5a5)' },
];

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

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

function MusicNoteIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

function FilterIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </svg>
  );
}

function TextToolIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function FlipCameraIcon(props) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 8a8 8 0 0 0-14.3-4.3M4 16a8 8 0 0 0 14.3 4.3" />
      <path d="M4 3v5h5M20 21v-5h-5" />
    </svg>
  );
}

function FlashIcon(props) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
    </svg>
  );
}

function TimerIcon(props) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </svg>
  );
}

function MicIcon({ crossedOut, ...props }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v4" />
      {crossedOut && <line x1="3" y1="21" x2="21" y2="3" />}
    </svg>
  );
}

function ExpandIcon(props) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function UploadIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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
  const overlayStageRef = useRef(null);
  const draggingOverlayRef = useRef(false);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const [videoType, setVideoType] = useState('short');
  const [caption, setCaption] = useState('');
  const [circle, setCircle] = useState(null);

  // Sound picker — SoundPicker itself handles searching tracks distributed
  // by registered artists (Artist Hub); this page just tracks whether the
  // picker sheet is open and which track ended up selected.
  const [isSoundPickerOpen, setIsSoundPickerOpen] = useState(false);
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

  // --- New for the camera-first studio redesign ---
  const cameraRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecondsLeft, setRecordingSecondsLeft] = useState(0);
  const [cameraError, setCameraError] = useState(null);
  const [cameraRecordError, setCameraRecordError] = useState(null);
  const [activeFilterId, setActiveFilterId] = useState('normal');
  const [showFilterGrid, setShowFilterGrid] = useState(false);
  const [textOverlay, setTextOverlay] = useState(null); // { content, x, y (both 0-100, % of stage) } | null
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [showPublishDrawer, setShowPublishDrawer] = useState(false);

  // Duration selector row: '10m' | '60s' | '15s' | 'photo' | 'text'. Only
  // the three real durations map to actual recording seconds — photo/text
  // capture aren't things this page's upload pipeline supports (the Video
  // model backing POST /videos is video-only; photo/text posts are what
  // Stories are for), so those two stay visible in the row exactly per
  // spec, but selecting them just explains that rather than pretending to
  // work.
  const [durationMode, setDurationMode] = useState('60s');
  const DURATION_SECONDS = { '10m': 600, '60s': 60, '15s': 15 };

  const [micOn, setMicOn] = useState(true);
  const [retouchOn, setRetouchOn] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0); // 0 (off) | 3 | 10
  const [countdownValue, setCountdownValue] = useState(null);
  const [expandedAspect, setExpandedAspect] = useState(false);
  // Browsers have no API to peek at the OS photo library without the
  // person actively picking a file — there's no way to show a true "latest
  // gallery item" thumbnail the way the native TikTok app can. This
  // remembers whatever was last picked *through this button, this
  // session* as the closest honest approximation, defaulting to a plain
  // gallery icon until that's happened at least once.
  const [lastPickedPreviewUrl, setLastPickedPreviewUrl] = useState(null);
  const [lastPickedFile, setLastPickedFile] = useState(null);
  const [publishTab, setPublishTab] = useState('post'); // 'post' | 'templates' — Templates has no backing feature, see BottomCaptureControls

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

  // Independent object-URL lifecycle from `previewUrl` above (kept for the
  // bottom-left "gallery" corner button even after a retake clears `file`)
  // — sharing one URL between both would mean this effect's cleanup and
  // the other one's race to revoke the same blob URL, leaving whichever
  // ran second pointing at nothing.
  useEffect(() => {
    if (!lastPickedFile) {
      setLastPickedPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(lastPickedFile);
    setLastPickedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [lastPickedFile]);

  function pickFile(selected) {
    if (!selected) return;
    if (selected.type.startsWith('image/')) {
      // The gallery-thumbnail button welcomes photos per the studio
      // redesign brief, but backend/src/utils/upload.js's video upload
      // pipeline only accepts video files — there's no photo-post model or
      // route yet. Saying so clearly beats silently accepting the file and
      // failing later at submit time.
      setErrorMsg("Photo posts aren't supported yet — please choose a video.");
      return;
    }
    if (!selected.type.startsWith('video/')) {
      setErrorMsg('Please choose a video file.');
      return;
    }
    setErrorMsg(null);
    setFile(selected);
    setLastPickedFile(selected);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  function handleCaptured(capturedFile) {
    setFile(capturedFile);
    // A fresh recording becomes "the latest item" too, same as it would on
    // a real device's camera roll.
    setLastPickedFile(capturedFile);
  }

  function handleRetake() {
    setFile(null);
    setShowPublishDrawer(false);
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
    setActiveFilterId('normal');
    setTextOverlay(null);
    setShowPublishDrawer(false);
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

  // --- Text overlay drag (percentage-of-stage coordinates so it lines up
  // identically whether the stage is the live camera view or the captured
  // preview player, regardless of either one's actual pixel size). ---
  function beginOverlayDrag() {
    draggingOverlayRef.current = true;
  }
  function handleOverlayDragMove(e) {
    if (!draggingOverlayRef.current || !textOverlay || !overlayStageRef.current) return;
    const rect = overlayStageRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;
    const x = Math.min(96, Math.max(4, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(96, Math.max(4, ((clientY - rect.top) / rect.height) * 100));
    setTextOverlay((prev) => (prev ? { ...prev, x, y } : prev));
  }
  function endOverlayDrag() {
    draggingOverlayRef.current = false;
  }

  function openTextEditor() {
    setTextDraft(textOverlay?.content || '');
    setShowTextEditor(true);
  }
  function submitTextOverlay(e) {
    e.preventDefault();
    const trimmed = textDraft.trim();
    setTextOverlay(trimmed ? { content: trimmed.slice(0, 80), x: textOverlay?.x ?? 50, y: textOverlay?.y ?? 50 } : null);
    setShowTextEditor(false);
  }

  // --- Camera chrome now lives in this page instead of inside
  // CameraRecorder (see hideOwnControls) — everything below drives the
  // camera engine through the imperative ref it exposes. ---
  function handleExitStudio() {
    if (isRecording) return;
    router.push('/');
  }

  function handleFlipCamera() {
    cameraRef.current?.flipCamera();
  }

  function handleToggleMic() {
    const enabled = cameraRef.current?.toggleMic();
    if (enabled != null) setMicOn(enabled);
  }

  function cycleTimer() {
    setTimerSeconds((s) => (s === 0 ? 3 : s === 3 ? 10 : 0));
  }

  function handleDurationSelect(id) {
    setDurationMode(id);
    if (id === 'photo' || id === 'text') {
      setErrorMsg(
        id === 'photo'
          ? "Photo posts aren't supported here yet — try Stories instead."
          : "Text posts aren't supported here yet — try Stories instead."
      );
      return;
    }
    setErrorMsg(null);
    cameraRef.current?.setDurationSeconds(DURATION_SECONDS[id]);
  }

  function handleShutterPress() {
    if (durationMode === 'photo' || durationMode === 'text' || countdownValue !== null) return;
    if (isRecording) {
      cameraRef.current?.stopRecording();
      return;
    }
    if (timerSeconds > 0) {
      setCountdownValue(timerSeconds);
    } else {
      cameraRef.current?.startRecording();
    }
  }

  // Ticks the pre-record countdown down to 0, then actually starts
  // recording — an effect (not a manual setTimeout chain in
  // handleShutterPress) so navigating away or re-tapping mid-countdown
  // cleans up the pending timer automatically via the cleanup function.
  useEffect(() => {
    if (countdownValue === null) return;
    if (countdownValue === 0) {
      const t = setTimeout(() => {
        setCountdownValue(null);
        cameraRef.current?.startRecording();
      }, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCountdownValue((v) => (v == null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdownValue]);

  const captionRemaining = CAPTION_MAX - caption.length;
  const activeFilter = FILTERS.find((f) => f.id === activeFilterId) || FILTERS[0];
  // Merged into one inline style — object-fit here overrides the
  // <video>'s own Tailwind object-cover class (inline style specificity
  // beats a class), so the aspect-ratio toggle doesn't need a new prop on
  // CameraRecorder at all.
  const combinedFilterCss = [activeFilter.css, retouchOn ? 'brightness(1.06) contrast(0.95) saturate(1.08)' : '']
    .filter(Boolean)
    .join(' ');
  const cameraVideoStyle = {
    filter: combinedFilterCss || undefined,
    objectFit: expandedAspect ? 'contain' : 'cover',
    backgroundColor: expandedAspect ? '#000' : undefined,
  };

  return (
    <main className="fixed inset-0 bg-black overflow-hidden">
      {/* ---------------- Step 1: nothing captured/picked yet ---------------- */}
      {!file && (
        <div
          ref={overlayStageRef}
          className="relative w-full h-full"
          onPointerMove={handleOverlayDragMove}
          onPointerUp={endOverlayDrag}
          onPointerLeave={endOverlayDrag}
        >
          <CameraRecorder
            ref={cameraRef}
            embedded
            hideOwnControls
            videoStyle={cameraVideoStyle}
            onRecordingChange={setIsRecording}
            onSecondsLeftChange={setRecordingSecondsLeft}
            onErrorChange={setCameraError}
            onRecordErrorChange={setCameraRecordError}
            onCaptured={handleCaptured}
            overlayChildren={
              textOverlay && <DraggableTextOverlay overlay={textOverlay} onPointerDownHandle={beginOverlayDrag} />
            }
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          <TopCameraBar
            onExit={handleExitStudio}
            onFlip={handleFlipCamera}
            soundLabel={selectedTrack ? `🎵 ${selectedTrack.title}` : null}
            onOpenSound={() => setIsSoundPickerOpen(true)}
            disabled={isRecording}
          />

          <RightToolColumn
            onFlip={handleFlipCamera}
            retouchOn={retouchOn}
            onToggleRetouch={() => setRetouchOn((v) => !v)}
            timerSeconds={timerSeconds}
            onCycleTimer={cycleTimer}
            onOpenFilters={() => setShowFilterGrid(true)}
            micOn={micOn}
            onToggleMic={handleToggleMic}
            expandedAspect={expandedAspect}
            onToggleAspect={() => setExpandedAspect((v) => !v)}
            disabled={isRecording}
          />

          <button
            onClick={openTextEditor}
            className={`absolute top-20 left-3 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              textOverlay ? 'bg-amber-500 text-black' : 'bg-black/50 text-white'
            }`}
            aria-label={textOverlay ? 'Edit text overlay' : 'Add text overlay'}
          >
            <TextToolIcon />
          </button>

          {countdownValue !== null && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white text-8xl font-display drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                {countdownValue || ''}
              </span>
            </div>
          )}

          <BottomCaptureControls
            durationMode={durationMode}
            onSelectDuration={handleDurationSelect}
            isRecording={isRecording}
            recordingSecondsLeft={recordingSecondsLeft}
            disabled={!!cameraError || !!cameraRecordError}
            onShutterPress={handleShutterPress}
            activeFilterId={activeFilterId}
            onSelectFilter={setActiveFilterId}
            galleryPreviewUrl={lastPickedPreviewUrl}
            onOpenGallery={() => fileInputRef.current?.click()}
            onGalleryDrop={handleDrop}
            publishTab={publishTab}
            setPublishTab={setPublishTab}
          />

          {(errorMsg || cameraError || cameraRecordError) && (
            <div className="absolute bottom-52 inset-x-0 flex justify-center px-6 pointer-events-none">
              <p className="bg-black/80 text-red-400 text-xs px-4 py-2 rounded-full text-center">
                {errorMsg || cameraError || cameraRecordError}
              </p>
            </div>
          )}

          {showFilterGrid && (
            <FilterGridModal activeId={activeFilterId} onSelect={setActiveFilterId} onClose={() => setShowFilterGrid(false)} />
          )}
        </div>
      )}

      {/* ---------------- Step 2: captured/picked — full-screen review ---------------- */}
      {file && !showPublishDrawer && (
        <div
          ref={overlayStageRef}
          className="relative w-full h-full"
          onPointerMove={handleOverlayDragMove}
          onPointerUp={endOverlayDrag}
          onPointerLeave={endOverlayDrag}
        >
          <VideoPreview src={previewUrl} />
          {textOverlay && <DraggableTextOverlay overlay={textOverlay} onPointerDownHandle={beginOverlayDrag} />}

          <div className="absolute top-0 inset-x-0 flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
            <button
              onClick={handleRetake}
              className="w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
              aria-label="Retake"
            >
              <XIcon />
            </button>
            <button
              onClick={openTextEditor}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                textOverlay ? 'bg-amber-500 text-black' : 'bg-black/60 text-white'
              }`}
              aria-label="Add text"
            >
              <TextToolIcon />
            </button>
          </div>

          <div className="absolute bottom-0 inset-x-0 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => setShowPublishDrawer(true)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-2xl text-base shadow-lg transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Step 3: slide-up publishing drawer ---------------- */}
      {file && showPublishDrawer && (
        <PublishDrawer
          previewUrl={previewUrl}
          onBack={() => setShowPublishDrawer(false)}
          onSubmit={handleSubmit}
          videoType={videoType}
          setVideoType={setVideoType}
          caption={caption}
          setCaption={setCaption}
          captionRef={captionRef}
          captionRemaining={captionRemaining}
          insertHashtag={insertHashtag}
          showEmoji={showEmoji}
          setShowEmoji={setShowEmoji}
          insertEmoji={insertEmoji}
          setIsAiOpen={setIsAiOpen}
          isAiOpen={isAiOpen}
          handleAiInsert={handleAiInsert}
          circle={circle}
          setCircle={setCircle}
          selectedTrack={selectedTrack}
          setSelectedTrack={setSelectedTrack}
          setIsSoundPickerOpen={setIsSoundPickerOpen}
          visibility={visibility}
          setVisibility={setVisibility}
          allowComments={allowComments}
          setAllowComments={setAllowComments}
          allowDuets={allowDuets}
          setAllowDuets={setAllowDuets}
          allowDownloads={allowDownloads}
          setAllowDownloads={setAllowDownloads}
          status={status}
          uploadProgress={uploadProgress}
          errorMsg={errorMsg}
          handleCancel={handleCancel}
        />
      )}

      {showTextEditor && (
        <TextEditorModal
          value={textDraft}
          onChange={setTextDraft}
          onSubmit={submitTextOverlay}
          onClose={() => setShowTextEditor(false)}
          hasExisting={!!textOverlay}
        />
      )}

      {isSoundPickerOpen && (
        <SoundPicker
          mode="browse"
          selectedTrackId={selectedTrack?.id ?? null}
          onClose={() => setIsSoundPickerOpen(false)}
          onSelect={({ soundId, soundUrl, title, artistName }) => {
            setSelectedTrack({ id: soundId, audioUrl: soundUrl, title, artistName });
          }}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Camera-first studio chrome — top bar, right tool column, text tool   */
/* ------------------------------------------------------------------ */

function TopCameraBar({ onExit, onFlip, soundLabel, onOpenSound, disabled }) {
  return (
    <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <button
        onClick={onExit}
        disabled={disabled}
        aria-label="Close studio"
        className="w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-30"
      >
        <XIcon />
      </button>

      <button
        onClick={onOpenSound}
        className="max-w-[55%] flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 text-white text-xs font-semibold"
      >
        <MusicNoteIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{soundLabel || 'Add sound'}</span>
      </button>

      <button
        onClick={onFlip}
        disabled={disabled}
        aria-label="Flip camera"
        className="w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center disabled:opacity-30"
      >
        <FlipCameraIcon />
      </button>
    </div>
  );
}

function RightToolColumn({
  onFlip,
  retouchOn,
  onToggleRetouch,
  timerSeconds,
  onCycleTimer,
  onOpenFilters,
  micOn,
  onToggleMic,
  expandedAspect,
  onToggleAspect,
  disabled,
}) {
  const items = [
    { key: 'flip', icon: FlipCameraIcon, label: 'Flip', onClick: onFlip, active: false },
    // getUserMedia has no reliable cross-browser flash/torch control, and a
    // real beauty/retouch filter would need face landmark detection this
    // app doesn't have — this toggles a light brightness/contrast/saturation
    // smoothing pass on the preview instead of pretending to do either.
    { key: 'retouch', icon: FlashIcon, label: 'Retouch', onClick: onToggleRetouch, active: retouchOn },
    {
      key: 'timer',
      icon: TimerIcon,
      label: timerSeconds ? `${timerSeconds}s` : 'Timer',
      onClick: onCycleTimer,
      active: timerSeconds > 0,
    },
    { key: 'filters', icon: FilterIcon, label: 'Filters', onClick: onOpenFilters, active: false },
    { key: 'mic', icon: MicIcon, label: micOn ? 'Mic' : 'Muted', onClick: onToggleMic, active: !micOn, muted: !micOn },
    { key: 'aspect', icon: ExpandIcon, label: 'Expand', onClick: onToggleAspect, active: expandedAspect },
  ];

  return (
    <div className="absolute right-3 top-24 flex flex-col gap-5 items-center">
      {items.map(({ key, icon: Icon, label, onClick, active, muted }) => (
        <button
          key={key}
          onClick={onClick}
          disabled={disabled && key !== 'aspect'}
          className="flex flex-col items-center gap-1 disabled:opacity-30"
          aria-label={label}
        >
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              active ? 'bg-amber-500 text-black' : 'bg-black/40 text-white'
            }`}
          >
            {key === 'mic' ? <Icon crossedOut={muted} /> : <Icon />}
          </span>
          <span className="text-white text-[9px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{label}</span>
        </button>
      ))}
    </div>
  );
}

function FilterGridModal({ activeId, onSelect, onClose }) {
  return (
    <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className="w-full bg-zinc-900 border-t border-zinc-800 rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-semibold text-sm">Filters</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                onSelect(f.id);
                onClose();
              }}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`w-14 h-14 rounded-full border-2 ${activeId === f.id ? 'border-amber-400' : 'border-white/20'}`}
                style={{ background: f.swatch }}
              />
              <span className="text-white text-[11px] font-medium">{f.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DraggableTextOverlay({ overlay, onPointerDownHandle }) {
  return (
    <div
      onPointerDown={onPointerDownHandle}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing touch-none px-3 py-1.5"
      style={{ left: `${overlay.x}%`, top: `${overlay.y}%` }}
    >
      <p className="text-white text-xl font-display text-center whitespace-pre-wrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] select-none">
        {overlay.content}
      </p>
    </div>
  );
}

function TextEditorModal({ value, onChange, onSubmit, onClose, hasExisting }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-zinc-900 border border-zinc-800 text-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3"
      >
        <p className="font-semibold text-base">Add text</p>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 80))}
          placeholder="Type something…"
          rows={2}
          maxLength={80}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm placeholder-zinc-500 outline-none resize-none focus:ring-2 focus:ring-amber-500/50"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-300 border border-zinc-700">
            Cancel
          </button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-black">
            {hasExisting ? 'Update' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

function BottomCaptureControls({
  durationMode,
  onSelectDuration,
  isRecording,
  recordingSecondsLeft,
  disabled,
  onShutterPress,
  activeFilterId,
  onSelectFilter,
  galleryPreviewUrl,
  onOpenGallery,
  onGalleryDrop,
  publishTab,
  setPublishTab,
}) {
  const DURATION_TABS = [
    { id: '10m', label: '10m' },
    { id: '60s', label: '60s' },
    { id: '15s', label: '15s' },
    { id: 'photo', label: 'PHOTO' },
    { id: 'text', label: 'TEXT' },
  ];
  // The two flanking each side of the shutter — a quick-access subset, not
  // the full set (that's what the Filters icon in the right column opens
  // via FilterGridModal).
  const leftFilters = FILTERS.slice(1, 3);
  const rightFilters = FILTERS.slice(3, 5);

  return (
    <div className="absolute bottom-0 inset-x-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex justify-center gap-2 overflow-x-auto no-scrollbar px-6 mb-4">
        {DURATION_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectDuration(t.id)}
            disabled={isRecording}
            className={`shrink-0 px-3 py-1 font-mono text-[11px] uppercase tracking-widest rounded-full transition-colors disabled:opacity-40 ${
              durationMode === t.id ? 'text-amber-400 font-bold' : 'text-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-5 px-6">
        {leftFilters.map((f) => (
          <FilterThumb key={f.id} filter={f} active={activeFilterId === f.id} onClick={() => onSelectFilter(f.id)} />
        ))}

        <ShutterButton
          recording={isRecording}
          secondsLeft={recordingSecondsLeft}
          disabled={disabled}
          onPress={onShutterPress}
        />

        {rightFilters.map((f) => (
          <FilterThumb key={f.id} filter={f} active={activeFilterId === f.id} onClick={() => onSelectFilter(f.id)} />
        ))}
      </div>

      <div className="flex items-center justify-between px-6 mt-4">
        <GalleryThumbButton previewUrl={galleryPreviewUrl} onClick={onOpenGallery} onDrop={onGalleryDrop} disabled={isRecording} />

        <div className="flex gap-1 p-1 bg-black/40 rounded-full">
          {[
            { id: 'post', label: 'POST' },
            { id: 'templates', label: 'TEMPLATES' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setPublishTab(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors ${
                publishTab === t.id ? 'bg-white text-black' : 'text-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Balances the gallery thumbnail on the left so the POST/TEMPLATES
            switcher stays visually centered. */}
        <span className="w-10" aria-hidden="true" />
      </div>
    </div>
  );
}

function FilterThumb({ filter, active, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1" aria-label={filter.label}>
      <span
        className={`w-10 h-10 rounded-full border-2 ${active ? 'border-amber-400' : 'border-white/40'}`}
        style={{ background: filter.swatch }}
      />
    </button>
  );
}

function ShutterButton({ recording, secondsLeft, disabled, onPress }) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
      className="relative w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center disabled:opacity-30 shrink-0"
    >
      <span className={`bg-red-500 transition-all ${recording ? 'w-7 h-7 rounded-xl' : 'w-[58px] h-[58px] rounded-full'}`} />
      {recording && (
        <span className="absolute -bottom-6 font-mono text-[11px] text-white bg-black/50 px-2 py-0.5 rounded-full whitespace-nowrap">
          {secondsLeft}s
        </span>
      )}
    </button>
  );
}

function GalleryThumbButton({ previewUrl, onClick, onDrop, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        onDrop?.(e);
      }}
      aria-label="Choose from gallery"
      className={`w-10 h-10 rounded-lg overflow-hidden border-2 shrink-0 disabled:opacity-30 ${
        dragOver ? 'border-amber-400' : 'border-white/50'
      }`}
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
          <UploadIcon />
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Publishing drawer — the exact metadata form from before, now inside  */
/* a slide-up sheet instead of always-visible page content.             */
/* ------------------------------------------------------------------ */

function PublishDrawer({
  previewUrl,
  onBack,
  onSubmit,
  videoType,
  setVideoType,
  caption,
  setCaption,
  captionRef,
  captionRemaining,
  insertHashtag,
  showEmoji,
  setShowEmoji,
  insertEmoji,
  setIsAiOpen,
  isAiOpen,
  handleAiInsert,
  circle,
  setCircle,
  selectedTrack,
  setSelectedTrack,
  setIsSoundPickerOpen,
  visibility,
  setVisibility,
  allowComments,
  setAllowComments,
  allowDuets,
  setAllowDuets,
  allowDownloads,
  setAllowDownloads,
  status,
  uploadProgress,
  errorMsg,
  handleCancel,
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black animate-sheet-up">
      <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-zinc-800 shrink-0">
        <button onClick={onBack} className="text-zinc-400 hover:text-white text-sm font-semibold px-1">
          ← Back
        </button>
        <h1 className="text-base font-bold text-white">Post details</h1>
      </div>

      <form onSubmit={onSubmit} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-5 md:p-8 grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-4">
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 max-h-[280px] mx-auto">
              <VideoPreview src={previewUrl} />
            </div>
          </div>

          <div className="md:col-span-8 space-y-6">
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
                <div className="flex items-center gap-2 mt-3 flex-wrap relative">
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
                    className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-semibold shadow-md flex items-center gap-1 hover:opacity-90 transition"
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
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsSoundPickerOpen(true)}
                        className="text-xs font-semibold text-amber-400 hover:text-amber-300"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTrack(null)}
                        className="text-zinc-400 hover:text-white"
                        aria-label="Remove sound"
                      >
                        <XIcon />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSoundPickerOpen(true)}
                    className="w-full flex items-center gap-2 bg-zinc-800/80 border border-zinc-700 text-zinc-300 hover:border-amber-500/50 hover:text-white rounded-xl px-4 py-2.5 text-sm transition-all"
                  >
                    <MusicNoteIcon className="w-4 h-4 text-amber-400 shrink-0" />
                    Add Sound / Pick Music
                  </button>
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
        </div>

        {/* Sticky footer — matches the previous page-level footer 1:1, just
            scoped to the drawer instead of the whole page now. */}
        <div
          className="sticky bottom-0 border-t border-zinc-800 bg-black/90 backdrop-blur-md"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-2xl mx-auto px-5 md:px-8">
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
                disabled={status === 'uploading' || status === 'done'}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl shadow-lg transition-all text-base flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'uploading' && <SpinnerIcon />}
                {status === 'uploading' ? 'Publishing…' : 'Post / Publish Video'}
              </button>
            </div>
          </div>
        </div>
      </form>
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
