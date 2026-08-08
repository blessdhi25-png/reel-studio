'use client';

import { useState } from 'react';

const STORAGE_KEY = 'feedTuningWeights';
const DEFAULTS = { nicheWeight: 50, freshWeight: 50, localWeight: 50 };

export function loadTuningWeights() {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function Slider({ label, leftLabel, rightLabel, value, onChange }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="font-mono text-[10px] text-smoke uppercase tracking-widest mb-2">{label}</p>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-reel"
      />
      <div className="flex justify-between font-body text-[11px] text-smoke mt-1">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

export default function TuneFeedPanel({ weights, onChange }) {
  const [open, setOpen] = useState(false);

  function update(field, value) {
    const next = { ...weights, [field]: value };
    onChange(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }

  function reset() {
    onChange(DEFAULTS);
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div
      className="fixed right-4 z-20"
      style={{ top: 'calc(env(safe-area-inset-top) + 6.25rem)' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700/80 text-amber-400 text-xs font-bold py-2 px-3 rounded-xl flex items-center gap-2 shadow-lg backdrop-blur-md transition-colors ml-auto"
      >
        ⚙ Tune Feed
      </button>

      {open && (
        <div className="mt-3 w-72 bg-ink2 border border-reel/20 rounded-sprocket p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <p className="font-display text-lg text-bone tracking-wide">Tune your feed</p>
            <button onClick={() => setOpen(false)} className="text-smoke text-sm">✕</button>
          </div>

          <Slider
            label="Niche vs Viral"
            leftLabel="Viral"
            rightLabel="Niche"
            value={weights.nicheWeight}
            onChange={(v) => update('nicheWeight', v)}
          />
          <Slider
            label="Freshness vs Evergreen"
            leftLabel="Evergreen"
            rightLabel="Fresh"
            value={weights.freshWeight}
            onChange={(v) => update('freshWeight', v)}
          />
          <div>
            <Slider
              label="Hyper-Local vs Global"
              leftLabel="Global"
              rightLabel="Local"
              value={weights.localWeight}
              onChange={(v) => update('localWeight', v)}
            />
            <p className="font-body text-[10px] text-smoke/60 mt-1">
              Coming soon — we don't have location data on videos yet, so this doesn't affect your feed for now.
            </p>
          </div>

          <button
            onClick={reset}
            className="w-full mt-4 font-mono text-[10px] uppercase tracking-widest text-smoke border border-smoke/30 rounded-sprocket py-2"
          >
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
