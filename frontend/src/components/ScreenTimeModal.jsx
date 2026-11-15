'use client';

import { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { EXTEND_MINUTES } from '@/lib/activeWatch';

// High-priority wellbeing reminder. Deliberately NOT dismissible by backdrop click or Escape:
// the person has to either take the break (resets the timer) or ask for more time.
export default function ScreenTimeModal({ minutes, onBreak, onExtend }) {
  const primaryRef = useRef(null);
  const secondaryRef = useRef(null);

  useEffect(() => {
    primaryRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Tab') {
        // keep focus inside the two buttons
        e.preventDefault();
        const next = document.activeElement === primaryRef.current ? secondaryRef.current : primaryRef.current;
        next?.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-6 bg-black/70 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="screen-time-title"
      aria-describedby="screen-time-desc"
    >
      <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 text-center text-white">
        <span className="mx-auto mb-4 w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 flex items-center justify-center">
          <Clock size={26} />
        </span>
        <h2 id="screen-time-title" className="font-extrabold text-xl tracking-tight">Time for a break?</h2>
        <p id="screen-time-desc" className="mt-2 text-sm font-medium text-zinc-400">
          You&apos;ve been watching for {minutes} minutes. Step away, stretch, and come back fresh.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            ref={primaryRef}
            onClick={onBreak}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition active:scale-[0.98]"
          >
            Take a break
          </button>
          <button
            ref={secondaryRef}
            onClick={onExtend}
            className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-sm transition active:scale-[0.98]"
          >
            Keep watching · {EXTEND_MINUTES} more min
          </button>
        </div>
        <p className="mt-4 text-[11px] font-medium text-zinc-500">Change the interval in Settings → Wellbeing.</p>
      </div>
    </div>
  );
}
