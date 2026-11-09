'use client';

import { useRef, useState } from 'react';
import { Camera, Film, Plus, X } from 'lucide-react';

const MAX_CLIP_BYTES = 200 * 1024 * 1024;

function fmtSize(bytes) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Bottom sheet shown after tapping a (non-AI) template. Two ways in:
//  - Record with camera: guided session (effect, per-clip timing, sound pre-applied)
//  - Choose clips from the gallery: fill the template's slots one pick at a time (or
//    several at once); once every slot is full, the clips go to the studio as videoClips[].
export default function TemplateClipSheet({ template, onRecord, onUseClips, onClose }) {
  const inputRef = useRef(null);
  const [clips, setClips] = useState([]);
  const [note, setNote] = useState(null);
  const count = template.clipCount || 1;
  const seconds = Array.isArray(template.clipSeconds) ? Math.round(template.clipSeconds.reduce((a, b) => a + b, 0)) : null;
  const full = clips.length >= count;

  function addFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // same file can be picked again
    if (!picked.length) return;
    const videos = picked.filter((f) => f.type.startsWith('video/'));
    const problems = [];
    if (videos.length < picked.length) problems.push('Only video files can be used.');
    const sized = videos.filter((f) => f.size <= MAX_CLIP_BYTES);
    if (sized.length < videos.length) problems.push('Clips over 200 MB were skipped.');
    const room = count - clips.length;
    if (sized.length > room) problems.push(`This template takes ${count} clip${count === 1 ? '' : 's'} — extra ones were left out.`);
    setClips((prev) => [...prev, ...sized.slice(0, room)]);
    setNote(problems.length ? problems.join(' ') : null);
  }

  const remove = (i) => {
    setClips((prev) => prev.filter((_, idx) => idx !== i));
    setNote(null);
  };

  return (
    <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm max-h-[92dvh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-5 pb-32 sm:pb-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Use ${template.title}`}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-white font-extrabold text-base">&quot;{template.title}&quot;</p>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full bg-zinc-800 text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-zinc-400 text-sm mb-4">
          {count} clip{count === 1 ? '' : 's'}
          {seconds ? ` · about ${seconds}s` : ''}
          {template.sound ? ` · ${template.sound}` : ''}
        </p>

        <button
          type="button"
          onClick={onRecord}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2"
        >
          <Camera className="w-5 h-5" /> Record with camera
        </button>
        <p className="text-zinc-500 text-xs mt-2 mb-4">The camera opens with this template&apos;s effect and timing already set. Each clip stops by itself.</p>

        <div className="flex items-center gap-3 mb-3" aria-hidden="true">
          <span className="h-px flex-1 bg-zinc-800" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">or use your gallery</span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <ol className="space-y-2 mb-3">
          {Array.from({ length: count }, (_, i) => {
            const f = clips[i];
            return (
              <li key={i} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${f ? 'border-zinc-700 bg-zinc-800/60' : 'border-dashed border-zinc-700'}`}>
                <span className="w-6 h-6 shrink-0 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                {f ? (
                  <>
                    <Film className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm text-white truncate">{f.name}</span>
                    <span className="text-xs text-zinc-400 shrink-0">{fmtSize(f.size)}</span>
                    <button onClick={() => remove(i)} aria-label={`Remove clip ${i + 1}`} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-zinc-500">Empty slot</span>
                )}
              </li>
            );
          })}
        </ol>

        {note && <p className="text-amber-400 text-xs mb-3" role="alert">{note}</p>}

        <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" multiple className="hidden" onChange={addFiles} />
        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mb-2"
          >
            <Plus className="w-4 h-4" /> {clips.length ? `Add clip ${clips.length + 1} of ${count}` : `Choose ${count === 1 ? 'a clip' : 'clips'}`}
          </button>
        )}
        <button
          type="button"
          disabled={!full}
          onClick={() => onUseClips(clips)}
          className="w-full bg-white text-black font-extrabold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {count === 1 ? 'Use this clip' : `Combine ${count} clips`}
        </button>
        {count > 1 && <p className="text-zinc-500 text-xs mt-2">Combining plays the clips back once in order, so it takes about as long as the finished video. Keep this tab open.</p>}
      </div>
    </div>
  );
}
