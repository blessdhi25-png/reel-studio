'use client';

import ClipPulseLogo, { ClipPulseMark } from './ClipPulseLogo';

// Full-screen branded splash — used for the app's first-load moment (auth
// hydration, the home feed's first batch of videos) where a genuine,
// unmissable brand moment is appropriate. Not meant to be dropped into
// every small nested loading state in the app — see LoadingSpinner below
// for that. Export name/signature (no props) kept exactly as before —
// AppShell.jsx renders this with no props, and changing that contract
// wasn't part of what's being fixed here.
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[200] bg-[#0B0E14] flex items-center justify-center overflow-hidden">
      {/* Ambient radial glow centered behind the logo */}
      <div
        className="absolute w-[560px] h-[560px] max-w-[140vw] max-h-[140vw] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(34,197,94,0.24) 0%, rgba(34,197,94,0.08) 45%, transparent 70%)',
        }}
      />

      {/* Heartbeat ring — a distinct effect from the mark's own subtle
          scale-pulse (.animate-mark-pulse, applied to the mark itself
          below): this radiates outward continuously behind it, using
          Tailwind's built-in expanding-ring animation. */}
      <span className="absolute w-40 h-40 rounded-full bg-emerald-500/20 animate-ping" />
      <span className="absolute w-40 h-40 rounded-full border border-emerald-400/30" />

      <div className="relative flex flex-col items-center gap-8">
        <ClipPulseLogo size={96} animated />

        {/* Progress bar — indeterminate (see the loading-bar keyframe in
            globals.css for why), not a fake specific percentage. */}
        <div className="w-40 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-[#9ACD32] to-[#22C55E] animate-loading-bar" />
        </div>
      </div>
    </div>
  );
}

// Compact inline replacement for the plain "Loading…" text that was
// scattered across ~18 files (comment lists, chat panels, admin tables,
// etc.) — same pulsing brand mark at a small size, no wordmark/credit line
// (those only make sense at full-screen scale), optional short label text
// alongside it for contexts where "Loading…" was communicating something
// more specific than just "loading" (e.g. "Loading conversations…"). Export
// name/signature kept exactly as before — this is imported by 25+ files
// across the app.
export function LoadingSpinner({ size = 20, label, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ClipPulseMark size={size} animated />
      {label && <span className="font-body text-sm text-smoke">{label}</span>}
    </span>
  );
}
