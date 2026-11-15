'use client';

import { useRef, useState } from 'react';
import { Reply } from 'lucide-react';

const SWIPE_TRIGGER = 56; // px dragged right to count as "reply"
const SWIPE_MAX = 80;
const LONG_PRESS_MS = 450;
const MOVE_SLOP = 8;

// Wraps one chat row with WhatsApp-style gestures:
//   swipe right        -> onReply()   (touch or mouse drag; vertical scrolling is unaffected)
//   long-press         -> onActions() (touch)
//   right-click        -> onActions() (desktop)
// `disabled` turns the swipe/long-press off (the right-click menu still works via `onActions`).
export default function SwipeableRow({ children, onReply, onActions, swipeDisabled, className = '' }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const state = useRef(null);
  const timer = useRef(null);
  const longPressed = useRef(false);

  const clearTimer = () => clearTimeout(timer.current);

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    longPressed.current = false;
    state.current = { x: e.clientX, y: e.clientY, axis: null, dx: 0 };
    clearTimer();
    timer.current = setTimeout(() => {
      if (!state.current || state.current.axis) return;
      longPressed.current = true;
      state.current = null;
      navigator.vibrate?.(15);
      onActions?.();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e) {
    const s = state.current;
    if (!s) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(ddx) < MOVE_SLOP && Math.abs(ddy) < MOVE_SLOP) return;
      clearTimer(); // moving cancels the long-press
      s.axis = Math.abs(ddx) > Math.abs(ddy) * 1.2 ? 'h' : 'v';
      if (s.axis === 'h' && !swipeDisabled) {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
      }
    }
    if (s.axis === 'h' && !swipeDisabled) {
      const v = Math.max(0, Math.min(ddx, SWIPE_MAX));
      s.dx = v;
      setDx(v);
    }
  }

  function finish() {
    clearTimer();
    const s = state.current;
    state.current = null;
    if (s?.axis === 'h' && !swipeDisabled && s.dx >= SWIPE_TRIGGER) {
      navigator.vibrate?.(10);
      onReply?.();
    }
    setDragging(false);
    setDx(0);
  }

  const progress = Math.min(1, dx / SWIPE_TRIGGER);

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!longPressed.current) onActions?.();
      }}
      // A long-press shouldn't also "click" whatever link/media sits under the finger.
      onClickCapture={(e) => {
        if (longPressed.current) {
          e.preventDefault();
          e.stopPropagation();
          longPressed.current = false;
        }
      }}
    >
      {!swipeDisabled && (
        <span
          className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-800 text-amber-400 flex items-center justify-center pointer-events-none"
          style={{ opacity: progress, transform: `translateY(-50%) scale(${0.6 + 0.4 * progress})` }}
          aria-hidden="true"
        >
          <Reply size={16} />
        </span>
      )}
      <div style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 0.18s ease-out' }}>
        {children}
      </div>
    </div>
  );
}
