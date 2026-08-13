'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

// Not one of the two components this module was scoped around
// (StoriesBar/StoryViewer) — added because "Add Story" needs somewhere
// real to go, not a dead (+) button. Intentionally minimal: pick a
// photo/video or write a text story, optionally attach one sticker (poll
// OR Q&A, not both) and a link. No camera capture, filters, or drawing —
// a real MVP boundary, not a placeholder.

const BACKGROUNDS = [
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#0ea5e9,#22c55e)',
  'linear-gradient(135deg,#111827,#374151)',
  'linear-gradient(135deg,#be185d,#7c3aed)',
];

export default function StoryComposer({ onClose, onCreated }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const videoProbeRef = useRef(null);

  const [mode, setMode] = useState(null); // null | 'media' | 'text'
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaKind, setMediaKind] = useState(null); // 'image' | 'video'
  const [videoDuration, setVideoDuration] = useState(null);

  const [textContent, setTextContent] = useState('');
  const [background, setBackground] = useState(BACKGROUNDS[0]);

  const [linkUrl, setLinkUrl] = useState('');
  const [stickerType, setStickerType] = useState(null); // null | 'poll' | 'qa'
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [qaQuestion, setQaQuestion] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFilePicked(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind = f.type.startsWith('video/') ? 'video' : 'image';
    setFile(f);
    setMediaKind(kind);
    setPreviewUrl(URL.createObjectURL(f));
    setVideoDuration(null);
    setMode('media');
  }

  function handleVideoMeta() {
    const d = videoProbeRef.current?.duration;
    if (Number.isFinite(d) && d > 0) setVideoDuration(d);
  }

  function updatePollOption(i, value) {
    setPollOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addPollOption() {
    setPollOptions((prev) => (prev.length < 4 ? [...prev, ''] : prev));
  }

  const canSubmit =
    mode === 'text' ? textContent.trim().length > 0 : mode === 'media' ? !!file : false;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('mediaType', mode === 'text' ? 'text' : mediaKind);
      if (mode === 'text') {
        formData.append('textContent', textContent.trim());
        formData.append('backgroundColor', background);
      } else {
        formData.append('media', file);
        if (mediaKind === 'video' && videoDuration) formData.append('durationSeconds', String(Math.round(videoDuration)));
      }
      if (linkUrl.trim()) formData.append('linkUrl', linkUrl.trim());
      if (stickerType === 'poll') {
        const options = pollOptions.map((o) => o.trim()).filter(Boolean);
        if (pollQuestion.trim() && options.length >= 2) {
          formData.append('pollQuestion', pollQuestion.trim());
          formData.append('pollOptions', JSON.stringify(options));
        }
      } else if (stickerType === 'qa' && qaQuestion.trim()) {
        formData.append('qaQuestion', qaQuestion.trim());
      }

      const story = await api.createStory(formData);
      toast.success('Story posted');
      onCreated(story);
    } catch (err) {
      toast.error(err.message || "Couldn't post that story");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl text-white flex flex-col">
      <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFilePicked} className="hidden" />

      <div className="flex items-center justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 shrink-0">
        <button onClick={onClose} className="text-white text-xl leading-none px-1" aria-label="Close">
          ✕
        </button>
        <p className="font-display text-lg tracking-wide">New Story</p>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="font-body text-sm font-bold text-amber-400 disabled:opacity-30 px-1"
        >
          {submitting ? 'Posting…' : 'Share'}
        </button>
      </div>

      {mode === null && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl py-5 font-body font-semibold"
          >
            📷 Photo or video
          </button>
          <button
            onClick={() => setMode('text')}
            className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl py-5 font-body font-semibold"
          >
            Aa Text story
          </button>
        </div>
      )}

      {mode === 'media' && (
        <div className="flex-1 relative overflow-hidden">
          {mediaKind === 'image' ? (
            <img src={previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <video
              ref={videoProbeRef}
              src={previewUrl}
              onLoadedMetadata={handleVideoMeta}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
          )}
        </div>
      )}

      {mode === 'text' && (
        <div className="flex-1 flex items-center justify-center px-8" style={{ background }}>
          <textarea
            autoFocus
            value={textContent}
            onChange={(e) => setTextContent(e.target.value.slice(0, 280))}
            placeholder="Type something…"
            rows={4}
            className="w-full bg-transparent text-center text-2xl font-display text-white placeholder-white/50 outline-none resize-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
          />
        </div>
      )}

      {mode === 'text' && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 shrink-0">
          {BACKGROUNDS.map((bg) => (
            <button
              key={bg}
              onClick={() => setBackground(bg)}
              aria-label="Choose background"
              className={`w-7 h-7 rounded-full border-2 ${background === bg ? 'border-white' : 'border-transparent'}`}
              style={{ background: bg }}
            />
          ))}
        </div>
      )}

      {mode !== null && (
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shrink-0 space-y-3 bg-black/80 border-t border-zinc-800/80">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Add a link (optional)"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm placeholder-zinc-500 outline-none focus:ring-2 focus:ring-amber-500/50"
          />

          <div className="flex gap-2">
            <button
              onClick={() => setStickerType(stickerType === 'poll' ? null : 'poll')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                stickerType === 'poll' ? 'bg-amber-500 text-black border-amber-500' : 'border-zinc-700 text-zinc-300'
              }`}
            >
              📊 Poll
            </button>
            <button
              onClick={() => setStickerType(stickerType === 'qa' ? null : 'qa')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                stickerType === 'qa' ? 'bg-amber-500 text-black border-amber-500' : 'border-zinc-700 text-zinc-300'
              }`}
            >
              ❓ Question
            </button>
          </div>

          {stickerType === 'poll' && (
            <div className="space-y-2">
              <input
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a question…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm placeholder-zinc-500 outline-none"
              />
              {pollOptions.map((opt, i) => (
                <input
                  key={i}
                  value={opt}
                  onChange={(e) => updatePollOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm placeholder-zinc-500 outline-none"
                />
              ))}
              {pollOptions.length < 4 && (
                <button onClick={addPollOption} className="text-xs text-amber-400 font-semibold">
                  + Add option
                </button>
              )}
            </div>
          )}

          {stickerType === 'qa' && (
            <input
              value={qaQuestion}
              onChange={(e) => setQaQuestion(e.target.value)}
              placeholder="What do you want to be asked?"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm placeholder-zinc-500 outline-none"
            />
          )}
        </div>
      )}
    </div>
  );
}
