'use client';

import { ClipPulseMark } from './ClipPulseLogo';

// Full-screen branded splash — the app's first-load moment (auth hydration,
// the home feed's first batch of videos). Always white: it is the first
// thing painted, before any saved theme preference has been applied, so it
// deliberately has no dark: variants. AppShell renders it with no props.
export default function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[200] bg-white text-black flex flex-col items-center justify-center overflow-hidden"
      role="status"
      aria-label="Loading ClipPulse"
    >
      <div className="flex flex-col items-center gap-6">
        {/* Logo tile: black rounded square, amber pulse mark with a soft glow */}
        <div className="relative">
          <span className="absolute inset-0 rounded-[28px] bg-amber-500/30 blur-2xl animate-pulse" aria-hidden="true" />
          <div className="relative w-24 h-24 rounded-[28px] bg-black flex items-center justify-center shadow-xl">
            <svg width="60" height="60" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="splashPulse" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
                <filter id="splashGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g filter="url(#splashGlow)">
                <path
                  d="M6,52 L28,52 L38,26 L52,76 L64,40 L72,52 L94,52"
                  stroke="url(#splashPulse)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </svg>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="font-black tracking-widest text-2xl text-black">CLIPPULSE</h1>
          <p className="text-xs tracking-widest font-semibold text-neutral-400 uppercase">Powered by Blest D.</p>
        </div>

        {/* Indeterminate bar — no real percentage exists to show */}
        <div className="w-40 h-1 rounded-full bg-neutral-100 overflow-hidden">
          <div className="bg-amber-500 h-1 rounded-full animate-pulse w-2/3 mx-auto" />
        </div>
      </div>
    </div>
  );
}

// Compact inline replacement for the plain "Loading…" text scattered across
// ~25 pages. Export name/signature unchanged — imported across the app.
export function LoadingSpinner({ size = 20, label, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ClipPulseMark size={size} animated />
      {label && <span className="font-body text-sm text-smoke">{label}</span>}
    </span>
  );
}
