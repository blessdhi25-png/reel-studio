'use client';

// The rail reads like a strip of film running down the left edge of the
// viewport. Each hole is one video in the feed; the amber hole marks where
// you are. It replaces a generic progress bar with something that says
// "you're watching film" at a glance.
export default function SprocketRail({ count, activeIndex }) {
  return (
    <div className="fixed left-0 top-0 h-full w-6 flex flex-col items-center justify-center gap-3 z-20">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-sprocket transition-colors duration-300 ${
            i === activeIndex ? 'bg-reel' : 'bg-smoke/30'
          }`}
        />
      ))}
    </div>
  );
}
