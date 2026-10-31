'use client';

import { useCallback, useEffect, useRef } from 'react';

// Long-press detection for touch AND mouse.
//
// - Fires `onLongPress` after `delay` ms of holding still.
// - Any movement beyond `moveTolerance` px cancels it, so a scroll/drag
//   never opens the menu. (Touch scrolling arrives as touchmove.)
// - We never preventDefault on touch events (that would block scrolling);
//   the native callout/context menu is suppressed via onContextMenu plus
//   the CSS in `longPressStyle`.
// - After a long press fires, the finger/mouse release would normally still
//   produce a click. `shouldSuppressClick()` lets the tap handler ignore
//   that click so it doesn't also toggle play/pause.
export const longPressStyle = {
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
};

export function useLongPress(onLongPress, { delay = 400, moveTolerance = 10, enabled = true } = {}) {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);
  const releaseTimerRef = useRef(null);
  const lastTouchRef = useRef(0);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (x, y) => {
      if (!enabled) return;
      clearTimer();
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      firedRef.current = false;
      startRef.current = { x, y };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        if (typeof navigator !== 'undefined') navigator.vibrate?.(15);
        callbackRef.current?.();
      }, delay);
    },
    [enabled, delay, clearTimer]
  );

  const move = useCallback(
    (x, y) => {
      if (!timerRef.current) return;
      const dx = x - startRef.current.x;
      const dy = y - startRef.current.y;
      if (Math.hypot(dx, dy) > moveTolerance) clearTimer();
    },
    [moveTolerance, clearTimer]
  );

  const end = useCallback(() => {
    clearTimer();
    if (firedRef.current) {
      // Keep suppressing the trailing click briefly, then reset — some
      // browsers don't fire a click after a long press at all, and a flag
      // left set would swallow the viewer's next real tap.
      releaseTimerRef.current = setTimeout(() => {
        firedRef.current = false;
      }, 400);
    }
  }, [clearTimer]);

  useEffect(
    () => () => {
      clearTimer();
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    },
    [clearTimer]
  );

  return {
    handlers: {
      onTouchStart: (e) => {
        lastTouchRef.current = Date.now();
        const t = e.touches[0];
        if (t) start(t.clientX, t.clientY);
      },
      onTouchMove: (e) => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      },
      onTouchEnd: end,
      onTouchCancel: end,
      onMouseDown: (e) => {
        // Touch devices emulate mouse events after a tap — ignore those.
        if (e.button !== 0 || Date.now() - lastTouchRef.current < 800) return;
        start(e.clientX, e.clientY);
      },
      onMouseMove: (e) => move(e.clientX, e.clientY),
      onMouseUp: end,
      onMouseLeave: clearTimer,
      onContextMenu: (e) => e.preventDefault(),
    },
    cancel: clearTimer,
    shouldSuppressClick: () => firedRef.current,
  };
}
