'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { LANGUAGES, MAX_CONTENT_LANGUAGES } from '@/lib/languages';
import { setPref, usePref } from '@/lib/settingsPrefs';
import { hasLocale, useLanguage } from '@/context/LanguageContext';
import { SettingsGroup, SettingsPage, ToggleRow } from '@/components/settings/SettingsUI';

export default function LanguagePage() {
  const ok = useRequireAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const [display] = usePref('displayLanguage');
  const [translate] = usePref('translateContent');
  const [storedContent] = usePref('contentLanguages');
  const content = Array.isArray(storedContent) ? storedContent : []; // tolerate a bad stored value
  const [busy, setBusy] = useState(false);

  // Apply locally first so the change is instant, persist to the account, and roll back if the server refuses.
  async function change(key, value) {
    const previous = { displayLanguage: display, translateContent: translate, contentLanguages: content }[key];
    setPref(key, value);
    setBusy(true);
    try {
      await api.updateLanguagePrefs({ [key]: value });
    } catch (err) {
      setPref(key, previous);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleContent(code) {
    const has = content.includes(code);
    if (!has && content.length >= MAX_CONTENT_LANGUAGES) return toast.error(`You can pick up to ${MAX_CONTENT_LANGUAGES} languages.`);
    change('contentLanguages', has ? content.filter((c) => c !== code) : [...content, code]);
  }

  if (!ok) return null;
  return (
    <SettingsPage title="Language">
      <SettingsGroup
        title="Display language"
        footer="Menus and labels switch immediately for languages marked as translated; other languages show the interface in English for now. Captions and comments can be translated into any language below."
      >
        <div role="radiogroup" aria-label="Display language" className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-neutral-800">
          {LANGUAGES.map((l) => {
            const on = display === l.code;
            return (
              <button key={l.code} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => !on && change('displayLanguage', l.code)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-neutral-800/60 disabled:opacity-60">
                <span className="flex-1 font-sans text-[15px] text-slate-900 dark:text-white">{l.native}{l.native !== l.name && <span className="text-slate-400 dark:text-neutral-500"> · {l.name}</span>}{hasLocale(l.code) && <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold align-middle">{t('language.uiAvailable')}</span>}</span>
                {on && <Check size={18} className="text-amber-500" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup footer="When on, captions and comments in other languages are translated into your display language automatically. When off, you can tap See translation on any caption or comment.">
        <ToggleRow title={t('language.alwaysTranslate')} subtitle={t('language.alwaysTranslateSub')} checked={translate} onChange={(v) => change('translateContent', v)} />
      </SettingsGroup>

      <SettingsGroup title="Preferred content languages" footer={`Pick up to ${MAX_CONTENT_LANGUAGES}. ${content.length} selected. Videos in these languages are ranked higher in your For You feed.`}>
        <div className="flex flex-wrap gap-2 p-4">
          {LANGUAGES.map((l) => {
            const on = content.includes(l.code);
            return (
              <button key={l.code} type="button" aria-pressed={on} onClick={() => toggleContent(l.code)} className={`px-3.5 py-2 rounded-full font-sans font-bold text-sm transition-colors ${on ? 'bg-amber-500 text-black' : 'bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-300'}`}>
                {l.native}
              </button>
            );
          })}
        </div>
      </SettingsGroup>
    </SettingsPage>
  );
}
