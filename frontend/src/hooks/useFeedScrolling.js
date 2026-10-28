'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Tracks whether the feed is being dragged or is mid-scroll so the overlay
// chrome (action rail, captions) can fade out while the finger is moving —
// TikTok-style. Spread `handlers` onto the scroll container.
//
// - touchmove / scroll  → isScrolling = true
// - touchend / touchcancel / scrollend, or SETTLE_MS after the last scroll
//   event (fallback for browsers without `scrollend`) → isScrolling = false
//
// touchstart deliberately does NOT hide anything: a plain tap on a button
// starts with a touchstart, and hiding (pointer-events-none) the button
// mid-tap would swallow the click.
const SETTLE_MS = 150;

export function useFeedScrolling() {
  const [isScrolling, setIsScrolling] = useState(false);
  const timerRef = useRef(null);
  const touchingRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleSettle = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      // Don't restore while a finger is still down and dragging.
      if (!touchingRef.current) setIsScrolling(false);
    }, SETTLE_MS);
  }, []);

  const onTouchStart = useCallback(() => {
    touchingRef.current = true;
  }, []);

  const onTouchMove = useCallback(() => {
    setIsScrolling(true);
  }, []);

  const onTouchEnd = useCallback(() => {
    touchingRef.current = false;
    // Momentum scrolling may continue after release; onScroll keeps
    // pushing the debounce out until it actually stops.
    scheduleSettle();
  }, [scheduleSettle]);

  const onScroll = useCallback(() => {
    setIsScrolling(true);
    scheduleSettle();
  }, [scheduleSettle]);

  const onScrollEnd = useCallback(() => {
    if (!touchingRef.current) {
      clearTimer();
      setIsScrolling(false);
    }
  }, []);

  useEffect(() => clearTimer, []);

  return {
    isScrolling,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      onScroll,
      onScrollEnd,
    },
  };
}
