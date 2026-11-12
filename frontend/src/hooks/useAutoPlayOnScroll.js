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
export function useAutoPlayOnScroll(containerRef, videoRef, { threshold = 0.6, enabled = true, onSoundBlocked } = {}) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    // video is null for photo posts — they still need the in-view signal (view
    // logging, impressions), just nothing to play/pause.
    if (!container || !enabled) {
      setInView(false);
      return;
    }

    // No IntersectionObserver support (very old browser, or a non-DOM
    // test environment) — fail open rather than leaving the video
    // permanently paused with no way to ever start.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      video?.play().catch(() => {});
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= threshold;
        setInView(visible);
        if (visible) {
          // Try with sound first. Browsers refuse unmuted autoplay before any
          // user gesture; when that happens, silently fall back to muted
          // playback (no on-screen text) and let the owner know so its mute
          // button reflects reality. The first tap then turns sound on.
          video?.play().catch((err) => {
            if (video && !video.muted && err?.name === 'NotAllowedError') {
              video.muted = true;
              onSoundBlocked?.();
              video.play().catch(() => {});
            }
          });
        } else {
          video?.pause();
        }
      },
      { threshold }
    );

    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, videoRef, threshold, enabled]);

  return inView;
}
