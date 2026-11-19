'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { languageByCode } from '@/lib/languages';
import { setPref, usePref } from '@/lib/settingsPrefs';

// Renders nothing. Applies display preferences to <html> (reduce motion, larger text, page language /
// direction) and, once per sign-in, pulls the server-backed language settings into the local mirror
// so a new device picks up the choices made on another one.
export default function PreferenceApplier() {
  const { isAuthenticated } = useAuth();
  const [reduceMotion] = usePref('reduceMotion');
  const [largeText] = usePref('largeText');
  const [displayLanguage] = usePref('displayLanguage');

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.reduceMotion = String(!!reduceMotion);
    el.dataset.largeText = String(!!largeText);
  }, [reduceMotion, largeText]);

  useEffect(() => {
    const lang = languageByCode(displayLanguage);
    // lang only: the interface text isn't translated yet, so flipping direction for RTL languages
    // would just mirror an English layout.
    document.documentElement.lang = lang ? lang.code : 'en';
  }, [displayLanguage]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api
      .getLanguagePrefs()
      .then((p) => {
        if (cancelled || !p) return;
        if (p.displayLanguage) setPref('displayLanguage', p.displayLanguage);
        if (typeof p.translateContent === 'boolean') setPref('translateContent', p.translateContent);
        if (Array.isArray(p.contentLanguages)) setPref('contentLanguages', p.contentLanguages);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return null;
}
