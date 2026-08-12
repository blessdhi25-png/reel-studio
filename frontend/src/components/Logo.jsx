'use client';

import { useState } from 'react';

// Plain <img> with an onError fallback, not next/image: next/image's
// optimizer refuses to serve SVGs unless `images.dangerouslyAllowSVG` is
// set (see next.config.js), and its optimization endpoint doesn't run at
// all under some static/edge deploy targets — either gap shows up as a
// broken image icon in production even though the component itself is
// correct. A plain <img> has no such dependency, and the onError handler
// below means even a genuinely missing/failed /logo.svg degrades to a
// styled "RS" mark instead of a broken-image icon.
const DIMENSIONS = {
  sm: { box: 'w-7 h-7', px: 28 },
  md: { box: 'w-9 h-9', px: 36 },
  lg: { box: 'w-12 h-12', px: 48 },
};

const TEXT_SIZE = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
};

export default function Logo({ size = 'md', showText = true, className = '' }) {
  const [imgError, setImgError] = useState(false);
  const { box, px } = DIMENSIONS[size] || DIMENSIONS.md;

  return (
    <div className={`flex items-center gap-2.5 shrink-0 ${className}`}>
      {!imgError ? (
        <img
          src="/logo.svg"
          alt="Reel Studio Logo"
          width={px}
          height={px}
          // width/height reserve the box before the file loads (no layout
          // shift); the className then locks the *rendered* size so a
          // squeezed flex parent (e.g. a header row with min-w-0 siblings)
          // can't compress or clip it — shrink-0 here and on the wrapper
          // is what actually guarantees that.
          className={`${box} object-contain shrink-0`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={`${box} shrink-0 bg-gradient-to-tr from-purple-600 to-cyan-500 rounded-lg flex items-center justify-center font-bold text-white text-xs`}
        >
          RS
        </div>
      )}
      {showText && (
        <span className={`font-bold tracking-tight text-white whitespace-nowrap ${TEXT_SIZE[size] || TEXT_SIZE.md}`}>
          Reel Studio
        </span>
      )}
    </div>
  );
}
