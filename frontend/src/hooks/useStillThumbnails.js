'use client';

import { useEffect, useState } from 'react';
import { usePref } from '@/lib/settingsPrefs';

// True when preview thumbnails should stay still: the OS "reduce motion" setting, or Settings →
// Accessibility → Reduced motion, or Animated thumbnails switched off.
export function useStillThumbnails() {
  const [os, setOs] = useState(false);
  const [reduceMotion] = usePref('reduceMotion');
  const [animated] = usePref('animatedThumbnails');
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    setOs(mq.matches);
    const onChange = (e) => setOs(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return os || reduceMotion || !animated;
}
