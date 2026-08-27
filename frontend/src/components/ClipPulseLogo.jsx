'use client';

// ClipPulse's icon mark: a play triangle with a smooth pulse wave flowing
// through it, dipping to baseline right where the triangle sits so the two
// never visually collide (same approach used in the standalone app-icon
// artwork, just re-authored here as a lean inline SVG — no blur/glass
// filters — since this gets re-rendered as a tiny spinner across 25+ pages
// via LoadingSpinner below, not just once on the splash screen.
export function ClipPulseMark({ size = 64, animated = false, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? 'animate-mark-pulse' : ''} ${className}`}
      role="img"
      aria-label="ClipPulse"
    >
      <defs>
        <linearGradient id="cpMarkGradient" x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#9ACD32" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>
      </defs>

      <path
        d="M4,50 C14,50 14,45 20,45 C26,45 26,55 32,55 C36,55 40,50 44,50 L74,50 C78,50 82,45 88,45 C92,45 92,50 96,50"
        stroke="url(#cpMarkGradient)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <path
        d="M44,36 L44,64 Q44,67 46.61,65.52 L71.39,51.48 Q74,50 71.39,48.52 L46.61,34.48 Q44,33 44,36 Z"
        fill="url(#cpMarkGradient)"
      />
    </svg>
  );
}

// The full lockup used on the loading screen and anywhere else the complete
// brand identity (not just the icon) is called for: mark + wordmark +
// credit line. `animated` only affects the mark — the wordmark and credit
// line stay static underneath it, matching how e.g. TikTok's own splash
// pulses just the glyph while the type stays put.
export default function ClipPulseLogo({ size = 96, animated = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <ClipPulseMark size={size} animated={animated} />
      <div className="flex flex-col items-center gap-1">
        <p className="tracking-wide text-2xl font-black text-white">ClipPulse</p>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2">
          Powered by Blest D.
        </p>
      </div>
    </div>
  );
}
