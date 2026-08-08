'use client';

import TuneFeedControls from './TuneFeedPanel';

// Everything that used to clutter the video canvas directly — the topic
// circle chips and the feed-tuning sliders — now lives in here instead,
// opened from a single icon in the header.
export default function FeedFiltersDrawer({ open, onClose, circles, circle, onSelectCircle, weights, onWeightsChange }) {
  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        className={`fixed top-0 right-0 z-50 h-full w-[85vw] max-w-sm bg-ink2 border-l border-smoke/10 shadow-2xl overflow-y-auto transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          paddingTop: 'max(1.25rem, calc(env(safe-area-inset-top) + 0.75rem))',
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex items-center justify-between px-5 mb-6">
          <p className="font-display text-2xl text-bone tracking-wide">Filters</p>
          <button onClick={onClose} aria-label="Close" className="text-smoke text-xl leading-none px-1">
            ✕
          </button>
        </div>

        {/* Topic Circles */}
        <div className="px-5 mb-8">
          <p className="font-mono text-[10px] text-smoke uppercase tracking-widest mb-3">Topic circles</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onSelectCircle(null)}
              className={`px-3 py-1.5 rounded-sprocket font-mono text-xs uppercase tracking-widest ${
                circle === null ? 'bg-reel text-ink' : 'bg-ink/60 text-smoke'
              }`}
            >
              All circles
            </button>
            {circles.map((c) => (
              <button
                key={c.circle}
                onClick={() => onSelectCircle(c.circle)}
                className={`px-3 py-1.5 rounded-sprocket font-mono text-xs uppercase tracking-widest ${
                  circle === c.circle ? 'bg-reel text-ink' : 'bg-ink/60 text-smoke'
                }`}
              >
                {c.circle} · {c.count}
              </button>
            ))}
            {circles.length === 0 && (
              <p className="font-body text-smoke text-sm">No circles have any posts yet.</p>
            )}
          </div>
        </div>

        {/* Tune Feed */}
        <div className="px-5">
          <p className="font-mono text-[10px] text-smoke uppercase tracking-widest mb-3">Tune your feed</p>
          <TuneFeedControls weights={weights} onChange={onWeightsChange} />
        </div>
      </div>
    </>
  );
}
