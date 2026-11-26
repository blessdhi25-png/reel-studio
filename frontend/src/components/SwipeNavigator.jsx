'use client';

import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { shouldIgnoreSwipe } from '@/lib/swipeGuards';

// Finger-tracking swipe between the main tabs — Home, Friends, Inbox, Profile — in bottom-nav order.
//
// While the finger is down the whole page (#page-slider, see AppShell) is translated with it, revealing a
// "peek" underlay that names the tab you're heading to, and the bottom nav highlights that tab once you're
// past ~⅓ of the way. On release past 30% of the width (or a quick flick) the page slides off, the route
// changes, and the new page slides in from the same side; otherwise it springs back.
//
// The Home feed itself isn't handled here: swiping left on a feed video belongs to the creator-profile
// pager in app/page.jsx. So from Home there is nothing to swipe to; from Friends swiping right returns Home.
//
// Real neighbouring routes can't be rendered side by side (each tab is its own Next route), so the peek is
// a labelled underlay rather than a live preview of the next screen.
const LOCK_PX = 12;
const COMMIT = 0.3;
const OUT_MS = 180;
const IN_MS = 280;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function useTabPaths() {
  const { user } = useAuth();
  // Guests have no profile tab — swiping stops at Inbox.
  return useMemo(
    () => ['/', '/friends', '/notifications', ...(user?.id ? [`/profile/${user.id}`] : [])],
    [user?.id]
  );
}

const LABELS = ['Home', 'Friends', 'Inbox', 'Profile'];

function getUnderlay() {
  let el = document.getElementById('swipe-underlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'swipe-underlay';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:0;display:none;align-items:center;font:800 18px system-ui,sans-serif;letter-spacing:.02em;color:#fff;background:#09090b;pointer-events:none;padding:0 28px;';
    document.body.appendChild(el);
  }
  return el;
}

const hint = (path) => window.dispatchEvent(new CustomEvent('clippulse:swipe-hint', { detail: path }));

export default function SwipeNavigator() {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const tabs = useTabPaths();
  const index = tabs.indexOf(pathname);
  const enterDir = useRef(null); // 'left' | 'right': direction the finger moved when the route change was committed
  const fallback = useRef(null);

  // Warm the neighbouring tabs so the swipe lands instantly.
  useEffect(() => {
    if (index < 0) return;
    [tabs[index - 1], tabs[index + 1]].filter(Boolean).forEach((p) => router.prefetch?.(p));
  }, [index, tabs, router]);

  // The route just changed after a committed swipe: slide the new page in from the side the finger pushed.
  useEffect(() => {
    const dir = enterDir.current;
    const page = document.getElementById('page-slider');
    if (!dir || !page) return;
    enterDir.current = null;
    clearTimeout(fallback.current);
    page.style.transition = 'none';
    page.style.transform = `translate3d(${dir === 'left' ? '100%' : '-100%'},0,0)`;
    void page.offsetWidth; // commit the start position before animating
    page.style.transition = `transform ${IN_MS}ms ${EASE}`;
    page.style.transform = 'translate3d(0,0,0)';
    const done = setTimeout(() => reset(page), IN_MS + 30);
    return () => clearTimeout(done);
  }, [pathname]);

  useEffect(() => {
    if (index < 0 || index === 0) return undefined; // Home: owned by the feed pager

    let s = null;
    const page = () => document.getElementById('page-slider');
    // Tell the browser this area only pans vertically. Without it, Android Chrome/WebViews may claim a
    // sideways drag for themselves (overscroll / history gestures) and cancel our touch stream. Horizontal
    // scrollers inside are unaffected: touch-action only intersects up to the nearest scroll container.
    const shell = page();
    if (shell) shell.style.touchAction = 'pan-y pinch-zoom';

    const onStart = (e) => {
      s = null;
      if (e.touches.length !== 1 || !page() || shouldIgnoreSwipe(e.target)) return;
      const t = e.touches[0];
      s = { x: t.clientX, y: t.clientY, at: Date.now(), locked: false, dx: 0, w: window.innerWidth, target: null };
    };

    const onMove = (e) => {
      if (!s || e.touches.length !== 1) return;
      const el = page();
      if (!el) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (!s.locked) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        if (Math.abs(dx) <= Math.abs(dy)) { s = null; return; } // vertical wins: a scroll, not a page swipe
        s.locked = true;
        const under = getUnderlay();
        el.style.position = 'relative';
        el.style.zIndex = '1';
        el.style.backgroundColor = getComputedStyle(document.body).backgroundColor;
        el.style.willChange = 'transform';
        under.style.display = 'flex';
        s.under = under;
      }
      const next = tabs[index + (dx < 0 ? 1 : -1)];
      s.target = next || null;
      const eff = next ? dx : dx * 0.25; // rubber-band when there's no page that way
      s.dx = eff;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${eff}px,0,0)`;
      if (next) {
        s.under.textContent = LABELS[tabs.indexOf(next)] || '';
        s.under.style.justifyContent = dx < 0 ? 'flex-end' : 'flex-start';
      } else s.under.textContent = '';
      hint(next && Math.abs(eff) > s.w * 0.35 ? next : null);
    };

    const onEnd = () => {
      const st = s;
      s = null;
      if (!st || !st.locked) return;
      const el = page();
      if (!el) return;
      const v = st.dx / Math.max(1, Date.now() - st.at);
      const go = st.target && (Math.abs(st.dx) > st.w * COMMIT || (Math.abs(v) > 0.5 && Math.abs(st.dx) > 40));
      if (go) {
        const dir = st.dx < 0 ? 'left' : 'right';
        el.style.transition = `transform ${OUT_MS}ms ease-out`;
        el.style.transform = `translate3d(${dir === 'left' ? -st.w : st.w}px,0,0)`;
        enterDir.current = dir;
        hint(st.target);
        setTimeout(() => router.push(st.target), OUT_MS);
        // If the route never changes, don't leave a blank screen behind.
        fallback.current = setTimeout(() => { enterDir.current = null; hint(null); reset(el); }, 2500);
      } else {
        el.style.transition = `transform 250ms ${EASE}`;
        el.style.transform = 'translate3d(0,0,0)';
        hint(null);
        setTimeout(() => reset(el), 270);
      }
    };

    const onCancel = () => {
      if (!s?.locked) { s = null; return; }
      s = null;
      const el = page();
      if (el) { el.style.transition = `transform 250ms ${EASE}`; el.style.transform = 'translate3d(0,0,0)'; setTimeout(() => reset(el), 270); }
      hint(null);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      if (shell) shell.style.touchAction = '';
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, [index, tabs, router]);

  return null;
}

// Back to a plain, transform-free page (a lingering transform would turn it into the containing block for
// every position:fixed child).
function reset(el) {
  el.style.transition = '';
  el.style.transform = '';
  el.style.position = '';
  el.style.zIndex = '';
  el.style.backgroundColor = '';
  el.style.willChange = '';
  const under = document.getElementById('swipe-underlay');
  if (under) under.style.display = 'none';
  window.dispatchEvent(new CustomEvent('clippulse:swipe-hint', { detail: null }));
}
