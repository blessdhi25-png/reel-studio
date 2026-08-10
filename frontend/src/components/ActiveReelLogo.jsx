'use client';

// The icon mark on its own: a stylized 'A' built from two solid legs, with
// the letterform's natural triangular counter (the small enclosed gap a
// capital A has above its crossbar) deliberately shaped and sized to read
// as a play button (▶) instead of a generic hole. That's the "integrate a
// stylized A with a play button icon" brief — one shape doing both jobs,
// rather than a play icon just sitting next to a separate letter A.
//
// Exported on its own (not just as part of the full lockup below) so it can
// be reused at small sizes — e.g. as a compact inline loading spinner
// elsewhere in the app — without dragging the wordmark and credit line
// along with it.
export function ActiveReelMark({ size = 64, animated = false, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? 'animate-mark-pulse' : ''} ${className}`}
      role="img"
      aria-label="Active Reel"
    >
      {/* Left leg */}
      <path
        d="M50 10 L16 90"
        stroke="#FFFFFF"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right leg */}
      <path
        d="M50 10 L84 90"
        stroke="#FFFFFF"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Crossbar, positioned low enough to leave room for the play triangle
          above it inside the letter's counter — a real capital A's
          crossbar sits roughly here relative to its apex. */}
      <path
        d="M29 70 L71 70"
        stroke="#FFFFFF"
        strokeWidth="11"
        strokeLinecap="round"
      />
      {/* The play triangle — sitting in the A's counter, pointing right.
          This is the "play button" half of the brief, and the part the
          loading-screen animation pulses/scales. */}
      <polygon points="38,38 38,64 62,51" fill="#A3FF12" />
    </svg>
  );
}

// The full lockup used on the loading screen and anywhere else the complete
// brand identity (not just the icon) is called for: mark + wordmark +
// credit line. `animated` only affects the mark — the wordmark and credit
// line stay static underneath it, matching how e.g. TikTok's own splash
// pulses just the glyph while the type stays put.
export default function ActiveReelLogo({ size = 96, animated = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <ActiveReelMark size={size} animated={animated} />
      <div className="flex flex-col items-center gap-1">
        <p className="font-display text-3xl tracking-[0.15em] leading-none">
          <span className="text-white">ACTIVE</span>{' '}
          <span className="text-volt">REEL</span>
        </p>
        <p className="font-body text-[11px] text-white/40 tracking-[0.2em] uppercase">
          Developed by Blest D.
        </p>
      </div>
    </div>
  );
}
