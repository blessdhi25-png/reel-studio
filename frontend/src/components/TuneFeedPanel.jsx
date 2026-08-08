'use client';

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

// Pure content — no floating trigger or open/close state of its own anymore.
// It now lives inside FeedFiltersDrawer instead of floating over the video.
export default function TuneFeedControls({ weights, onChange }) {
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
    <div>
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
  );
}
