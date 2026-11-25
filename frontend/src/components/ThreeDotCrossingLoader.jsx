'use client';

// Three dots gliding along one track and crossing past each other (see .dot-cross-* in globals.css).
// No logo and no text: render it directly wherever something is loading. Colour follows currentColor
// (amber by default), `size` is the dot diameter in px, `label` is for screen readers only.
export default function ThreeDotCrossingLoader({ size = 10, label = 'Loading', className = '' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`relative inline-block text-amber-500 ${className}`}
      style={{ fontSize: size, width: '5em', height: '1em' }}
    >
      {['a', 'b', 'c'].map((k) => (
        <span
          key={k}
          aria-hidden="true"
          className={`dot-cross dot-cross-${k} absolute top-0 left-1/2 rounded-full bg-current`}
          style={{ width: '1em', height: '1em', marginLeft: '-0.5em' }}
        />
      ))}
    </span>
  );
}
