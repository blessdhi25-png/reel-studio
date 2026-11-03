'use client';

import { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { FILTERS } from '@/lib/cameraFilters';

// Keeps a set of small <canvas> filter previews fresh. `drawPreview(canvas,
// lensId)` is CameraRecorder's drawFilterPreview: it renders the current
// camera frame (or a sample portrait when the camera isn't up) through that
// lens's real shader, so a thumbnail looks like what the preview will look
// like. Returns a ref-callback factory: ref={register(id)}.
//
// Refreshes on a slow interval rather than every frame — thumbnails only need
// to feel live, and `paused` stops the work completely while recording so it
// can't compete with the recording for frame time.
export function useLensPreviews(ids, drawPreview, { intervalMs = 500, paused = false } = {}) {
  const canvases = useRef({});
  const idsKey = ids.join(',');

  useEffect(() => {
    if (paused || !drawPreview) return undefined;
    const run = () => {
      idsKey.split(',').forEach((id) => {
        const el = canvases.current[id];
        if (el) drawPreview(el, id);
      });
    };
    run();
    const timer = setInterval(run, intervalMs);
    return () => clearInterval(timer);
  }, [idsKey, drawPreview, paused, intervalMs]);

  return useCallback(
    (id) => (el) => {
      if (el) canvases.current[id] = el;
      else delete canvases.current[id];
    },
    []
  );
}

// One circular lens preview. The active lens gets a double ring: an amber
// ring, a gap in the background colour, then the thumbnail edge.
export function LensPreview({ lens, active, onSelect, register, sizeClass = 'w-16 h-16', canvasSize = 128, label = true }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(lens.id)}
      aria-label={`${lens.label} filter`}
      aria-pressed={active}
      className="flex flex-col items-center gap-2 focus:outline-none group"
    >
      <span
        className={`block ${sizeClass} rounded-full overflow-hidden bg-neutral-800 transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-white ${
          active
            ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-black animate-[ring-pop_0.28s_ease-out] motion-reduce:animate-none'
            : 'ring-1 ring-white/25'
        }`}
      >
        <canvas
          ref={register(lens.id)}
          width={canvasSize}
          height={canvasSize}
          className="block w-full h-full"
          aria-hidden="true"
        />
      </span>
      {label && (
        <span
          className={`text-[11px] font-semibold leading-none ${active ? 'text-amber-400' : 'text-white'}`}
        >
          {lens.label}
        </span>
      )}
    </button>
  );
}

// Bottom sheet. The backdrop is deliberately transparent: you need to see the
// live camera above the sheet to judge a filter, and picking one keeps the
// sheet open so you can compare several before closing.
export function FilterSheet({ activeId, onSelect, onClose, drawPreview, paused }) {
  const register = useLensPreviews(
    FILTERS.map((f) => f.id),
    drawPreview,
    { intervalMs: 500, paused }
  );

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex items-end" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Filters"
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-zinc-900/95 backdrop-blur-md border-t border-white/10 rounded-t-3xl px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-[sheet-up_0.22s_ease-out] motion-reduce:animate-none"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" aria-hidden="true" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-base">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-zinc-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        {/* Padding gives the offset ring room so it isn't clipped at the edges. */}
        <div className="grid grid-cols-4 gap-x-2 gap-y-5 px-1 pb-2">
          {FILTERS.map((f) => (
            <LensPreview
              key={f.id}
              lens={f}
              active={activeId === f.id}
              onSelect={onSelect}
              register={register}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
