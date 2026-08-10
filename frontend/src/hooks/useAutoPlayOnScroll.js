'use client';

import { useEffect, useState } from 'react';

// Drives a <video>'s play/pause purely off how much of its container is
// actually on screen, instead of a discretized "which index did we scroll
// to" calculation. This matters for a snap-scroll feed specifically because
// a scroll-position/clientHeight calculation can drift by a frame or two
// during momentum scrolling or on viewports where env(safe-area-inset-*)
// shifts the effective card height — the video can end up playing a beat
// before it's actually visible, or still playing just after it's scrolled
// away. Observing the element's real intersection ratio doesn't have that
// class of bug: the callback only ever fires on an actual visibility
// threshold crossing.
//
// threshold=0.6 (60% visible) is deliberate, not arbitrary: in a
// single-column, full-height snap feed, two adjacent cards' visible
// regions can never both exceed 50% of the viewport at once (they'd have
// to overlap more than the viewport itself). So a 60% threshold guarantees
// at most one card is ever "in view" at a time — there's no scroll
// position where two videos could both be playing.
export function useAutoPlayOnScroll(containerRef, videoRef, { threshold = 0.6, enabled = true } = {}) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video || !enabled) {
      setInView(false);
      return;
    }

    // No IntersectionObserver support (very old browser, or a non-DOM
    // test environment) — fail open rather than leaving the video
    // permanently paused with no way to ever start.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      video.play().catch(() => {});
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= threshold;
        setInView(visible);
        if (visible) {
          video.play().catch(() => {
            // Autoplay can still be rejected (e.g. a browser that requires
            // an explicit gesture even for muted video) — the tap-to-play
            // handler already on the video element covers that case.
          });
        } else {
          video.pause();
        }
      },
      { threshold }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, videoRef, threshold, enabled]);

  return inView;
}
