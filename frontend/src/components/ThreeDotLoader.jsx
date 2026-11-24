'use client';

// Three dots bouncing in a staggered wave — the app's one loading indicator. No logo, no "Loading…" text:
// pages go straight from the previous screen to this to their content. `label` is for screen readers only.
// Colour follows the surrounding text colour (currentColor), so it works on light, dark and image backgrounds.
export default function ThreeDotLoader({ size = 10, label = 'Loading', className = '' }) {
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center justify-center gap-[0.45em] text-amber-500 ${className}`} style={{ fontSize: size }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="three-dot rounded-full bg-current"
          style={{ width: '1em', height: '1em', animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

// Centered in whatever box it's placed in (page body, panel, list).
export function ThreeDotBlock({ label, className = '', size = 10 }) {
  return (
    <div className={`flex items-center justify-center py-10 ${className}`}>
      <ThreeDotLoader label={label} size={size} />
    </div>
  );
}
