'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useLanguage } from '@/context/LanguageContext';
import { friendlyError } from '@/lib/friendlyError';
import { usePref } from '@/lib/settingsPrefs';
import { getCachedTranslation, translateText } from '@/lib/translate';

// Translation state for one caption or comment.
//  - "Always translate" on: translates automatically once `active` (so a feed doesn't translate every
//    off-screen card) and shows a "Translated" badge; "Show original" flips it back.
//  - Off: nothing happens until the viewer taps "See translation".
// Text already in the display language comes back `unchanged` and gets no badge or button.
export function useContentTranslation(text, { active = true } = {}) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const [always] = usePref('translateContent');
  const [target] = usePref('displayLanguage');
  const source = typeof text === 'string' ? text.trim() : '';

  const [result, setResult] = useState(null); // { translated, unchanged } for the current text + language
  const [showTranslated, setShowTranslated] = useState(null); // null = follow "always translate"
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  // A new text or display language starts over (from the session cache when we have it).
  useEffect(() => {
    setResult(source ? getCachedTranslation(source, target) : null);
    setShowTranslated(null);
    setUnavailable(false);
  }, [source, target]);

  const run = useCallback(async (manual) => {
    if (!source || !isAuthenticated) return;
    setBusy(true);
    try {
      const r = await translateText(source, target);
      setResult(r);
      if (manual) setShowTranslated(true);
    } catch (err) {
      if (manual) toast.error(friendlyError(err, t('translation.failed')));
      else setUnavailable(true); // automatic attempts fail quietly
    } finally {
      setBusy(false);
    }
  }, [source, target, isAuthenticated, toast, t]);

  useEffect(() => {
    if (always && active && source && isAuthenticated && !result && !busy && !unavailable) run(false);
  }, [always, active, source, isAuthenticated, result, busy, unavailable, run]);

  const translated = !!result && !result.unchanged && (showTranslated ?? always);
  const canToggle = !!result && !result.unchanged;
  const canOffer = !result && !always && !!source && isAuthenticated && !unavailable;

  const toggle = useCallback(() => {
    if (busy) return;
    if (!result) return run(true);
    if (!result.unchanged) setShowTranslated(!translated);
  }, [busy, result, run, translated]);

  return {
    text: translated ? result.translated : text,
    translated,
    busy,
    canToggle,
    canOffer,
    toggle,
    // Auto mode pending: nothing to show yet but a request is on its way.
    pending: busy && !result,
  };
}

// Badge + toggle line shown under a translated caption/comment (or the "See translation" offer).
export function translationLabels(tr, t) {
  if (tr.busy) return { badge: null, action: t('translation.translating') };
  if (tr.canToggle) return { badge: tr.translated ? t('translation.translated') : null, action: tr.translated ? t('translation.showOriginal') : t('translation.see') };
  if (tr.canOffer) return { badge: null, action: t('translation.see') };
  return null;
}
