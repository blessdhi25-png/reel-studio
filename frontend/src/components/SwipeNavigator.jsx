'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

// Swipe left/right between the four main tabs — Home, Friends, Inbox,
// Profile — in the same order as the bottom nav. Plain touchstart/touchend
// listeners, no dependency.
//
// A gesture only counts when it is unmistakably a page swipe: >= 80px
// horizontal, at least 1.8x more horizontal than vertical (so scrolling and
// the feed's vertical snap never trigger it), and quick (< 700ms). It is
// ignored when it starts inside anything that handles horizontal input itself:
// form fields, [data-no-swipe] regions (comments panel…), sliders, and any
// horizontally scrollable container (story rows, carousels) — and while a
// modal/drawer is open.
const MIN_DX = 80;
const DOMINANCE = 1.8;
const MAX_MS = 700;

function startsInHorizontalScroller(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 4) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

function shouldIgnore(target) {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-swipe], canvas')) return true;
  if (document.querySelector('[aria-modal="true"]')) return true;
  return startsInHorizontalScroller(target);
}

export function useTabPaths() {
  const { user } = useAuth();
  // Guests have no profile tab — swiping stops at Inbox.
  return useMemo(
    () => ['/', '/friends', '/notifications', ...(user?.id ? [`/profile/${user.id}`] : [])],
    [user?.id]
  );
}

export default function SwipeNavigator() {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const tabs = useTabPaths();
  const start = useRef(null);
  const index = tabs.indexOf(pathname);

  // Warm the neighbouring tabs so the swipe lands instantly.
  useEffect(() => {
    if (index < 0) return;
    [tabs[index - 1], tabs[index + 1]].filter(Boolean).forEach((p) => router.prefetch?.(p));
  }, [index, tabs, router]);

  useEffect(() => {
    if (index < 0) return undefined;

    const onStart = (e) => {
      if (e.touches.length !== 1 || shouldIgnore(e.target)) {
        start.current = null;
        return;
      }
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, at: Date.now() };
    };
    const onEnd = (e) => {
      const s = start.current;
      start.current = null;
      if (!s || !e.changedTouches.length) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.at > MAX_MS) return;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * DOMINANCE) return;
      const next = tabs[index + (dx < 0 ? 1 : -1)];
      if (next) router.push(next);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', () => (start.current = null), { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [index, tabs, router]);

  return null;
}
