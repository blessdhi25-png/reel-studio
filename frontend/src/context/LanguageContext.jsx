'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { usePref } from '@/lib/settingsPrefs';
import en from '@/locales/en.json';
import fr from '@/locales/fr.json';
import es from '@/locales/es.json';
import ha from '@/locales/ha.json';
import ak from '@/locales/ak.json';

// Languages the interface is actually translated into. Everything else offered in Settings → Language
// falls back to English for interface text. 'tw' (Twi) and 'ak' (Akan) share one dictionary.
const LOCALES = { en, fr, es, ha, tw: ak, ak };
export const hasLocale = (code) => Object.prototype.hasOwnProperty.call(LOCALES, code);

// English message -> key, so plain-string errors (lib/friendlyError.js, toasts) can be translated at render.
const MESSAGE_KEYS = Object.fromEntries(
  Object.entries(en).filter(([k, v]) => /^(error|translation)\./.test(k) && typeof v === 'string').map(([k, v]) => [v, k]),
);

const fill = (str, vars) => (vars ? str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : str);

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [code] = usePref('displayLanguage');
  const dict = LOCALES[code] || en;

  // t('nav.home'): dictionary lookup, falling back to English, then to the key itself.
  const t = useCallback((key, vars) => fill(dict[key] ?? en[key] ?? key, vars), [dict]);
  // tx('Account Details'): for screens that pass their English label as the key (settings rows & headings).
  const tx = useCallback((text) => (typeof text === 'string' ? dict.literals?.[text] ?? text : text), [dict]);
  // tm(message): translate a known English system message (e.g. "Connection lost. Please try again."); others pass through.
  const tm = useCallback((msg) => (MESSAGE_KEYS[msg] ? t(MESSAGE_KEYS[msg]) : msg), [t]);

  const value = useMemo(() => ({ lang: LOCALES[code] ? code : 'en', t, tx, tm }), [code, t, tx, tm]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

const FALLBACK = { lang: 'en', t: (k, v) => fill(en[k] ?? k, v), tx: (x) => x, tm: (m) => m };
export function useLanguage() {
  return useContext(LanguageContext) || FALLBACK;
}
