'use client';

import { useCallback, useEffect, useRef } from 'react';
import { shouldIgnoreSwipe } from '@/lib/swipeGuards';

// Horizontal pager that follows the finger. Pages sit side by side in one flex track; while a drag is
// active the track is translated with the pointer (translate3d, no transition), so the neighbouring page
// peeks in live. On release it snaps to the nearest page with a cubic-bezier ease (and flicks count).
//
//   <SwipeablePager index={i} onIndexChange={setI} onProgress={(p) => …} pages={[() => <A/>, () => <B/>]} />
//
// - `pages`: array of nodes or render functions. Only the current page and its neighbours are mounted.
// - `onProgress(p)`: fractional index (0…pages.length-1) on every move and when a snap starts — use it to
//   keep tab indicators in step with the finger.
// - `touch-action: pan-y` hands vertical scrolling to the browser, so feeds and lists inside a page keep
//   scrolling normally; only a clearly horizontal drag (≥ 8px, mostly sideways) takes over.
// - Drags that start in inputs, sliders, [data-no-swipe] regions or horizontal scrollers are left alone.
const LOCK_PX = 8;
const SNAP_MS = 300;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function SwipeablePager({
  pages,
  index,
  onIndexChange,
  onProgress,
  disabled = false,
  threshold = 0.25,
  className = '',
}) {
  const boxRef = useRef(null);
  const trackRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const last = pages.length - 1;

  const setTrack = useCallback((px, animate) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animate ? `transform ${SNAP_MS}ms ${EASE}` : 'none';
    el.style.transform = `translate3d(${px}px,0,0)`;
  }, []);

  // Keep the resting position in sync with `index` (and with resizes/rotation).
  useEffect(() => {
    const el = trackRef.current;
    const box = boxRef.current;
    if (!el || !box) return undefined;
    const place = () => setTrack(-index * box.clientWidth, false);
    el.style.transition = `transform ${SNAP_MS}ms ${EASE}`;
    el.style.transform = `translate3d(${-index * 100}%,0,0)`;
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [index, setTrack]);

  const onPointerDown = (e) => {
    if (disabled || e.pointerType === 'mouse' || !e.isPrimary || shouldIgnoreSwipe(e.target)) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, locked: null, dx: 0, w: boxRef.current?.clientWidth || 1 };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.locked) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        d.locked = 'h';
        try { boxRef.current?.setPointerCapture(e.pointerId); } catch {}
      } else {
        drag.current = null; // vertical: the browser scrolls, we step aside
        return;
      }
    }
    // Rubber-band past the first/last page.
    let eff = dx;
    if ((index === 0 && dx > 0) || (index === last && dx < 0)) eff = dx * 0.3;
    d.dx = dx;
    setTrack(-index * d.w + eff, false);
    onProgress?.(index - eff / d.w);
  };

  const finish = (e, cancelled) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.locked !== 'h') return;
    try { boxRef.current?.releasePointerCapture(e.pointerId); } catch {}
    suppressClick.current = true; // the lift that ends a drag must not also "click" something underneath
    setTimeout(() => { suppressClick.current = false; }, 0);

    const v = d.dx / Math.max(1, e.timeStamp - d.t); // px per ms
    let target = index;
    if (!cancelled && (Math.abs(d.dx) > d.w * threshold || (Math.abs(v) > 0.5 && Math.abs(d.dx) > 30))) {
      target = Math.max(0, Math.min(last, index + (d.dx < 0 ? 1 : -1)));
    }
    setTrack(-target * d.w, true);
    onProgress?.(target);
    if (target !== index) setTimeout(() => onIndexChange?.(target), SNAP_MS);
  };

  return (
    <div
      ref={boxRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onClickCapture={(e) => {
        if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); }
      }}
    >
      <div ref={trackRef} className="flex h-full w-full will-change-transform">
        {pages.map((page, i) => (
          <div key={i} className="h-full w-full shrink-0 basis-full min-w-0 overflow-hidden" aria-hidden={i !== index}>
            {Math.abs(i - index) <= 1 ? (typeof page === 'function' ? page(i === index) : page) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
