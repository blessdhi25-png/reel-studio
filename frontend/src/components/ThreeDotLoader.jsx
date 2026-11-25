'use client';

import ThreeDotCrossingLoader from './ThreeDotCrossingLoader';

// Three dots bouncing in a staggered wave — the app's one loading indicator. No logo, no "Loading…" text:
// pages go straight from the previous screen to this to their content. `label` is for screen readers only.
// Colour follows the surrounding text colour (currentColor), so it works on light, dark and image backgrounds.
export default function ThreeDotLoader(props) {
  return <ThreeDotCrossingLoader {...props} />;
}

// Centered in whatever box it's placed in (page body, panel, list).
export function ThreeDotBlock({ label, className = '', size = 10 }) {
  return (
    <div className={`flex items-center justify-center py-10 ${className}`}>
      <ThreeDotLoader label={label} size={size} />
    </div>
  );
}
