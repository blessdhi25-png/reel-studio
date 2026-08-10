'use client';

import ActiveReelLogo, { ActiveReelMark } from './ActiveReelLogo';

// Full-screen branded splash — used for the app's first-load moment (auth
// hydration, the home feed's first batch of videos) where a genuine,
// unmissable brand moment is appropriate. Not meant to be dropped into
// every small nested loading state in the app — see LoadingSpinner below
// for that.
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[200] bg-[#121212] flex items-center justify-center">
      <ActiveReelLogo size={96} animated />
    </div>
  );
}

// Compact inline replacement for the plain "Loading…" text that was
// scattered across ~18 files (comment lists, chat panels, admin tables,
// etc.) — same pulsing brand mark at a small size, no wordmark/credit line
// (those only make sense at full-screen scale), optional short label text
// alongside it for contexts where "Loading…" was communicating something
// more specific than just "loading" (e.g. "Loading conversations…").
export function LoadingSpinner({ size = 20, label, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ActiveReelMark size={size} animated />
      {label && <span className="font-body text-sm text-smoke">{label}</span>}
    </span>
  );
}
