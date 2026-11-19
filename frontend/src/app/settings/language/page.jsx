'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { LANGUAGES, MAX_CONTENT_LANGUAGES } from '@/lib/languages';
import { setPref, usePref } from '@/lib/settingsPrefs';
import { SettingsGroup, SettingsPage, ToggleRow } from '@/components/settings/SettingsUI';

export default function LanguagePage() {
  const ok = useRequireAuth();
  const toast = useToast();
  const [display] = usePref('displayLanguage');
  const [translate] = usePref('translateContent');
  const [content] = usePref('contentLanguages');
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
        footer="Saved to your account and used for the page language. The app’s own menus and labels are still in English while translations are being prepared."
      >
        <div role="radiogroup" aria-label="Display language" className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-neutral-800">
          {LANGUAGES.map((l) => {
            const on = display === l.code;
            return (
              <button key={l.code} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => !on && change('displayLanguage', l.code)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-neutral-800/60 disabled:opacity-60">
                <span className="flex-1 font-sans text-[15px] text-slate-900 dark:text-white">{l.native}{l.native !== l.name && <span className="text-slate-400 dark:text-neutral-500"> · {l.name}</span>}</span>
                {on && <Check size={18} className="text-amber-500" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup footer="Stored on your account. Translation of captions and posts isn’t available yet, so this setting takes effect when it launches.">
        <ToggleRow title="Translate captions & posts" subtitle="Show translations for content in other languages" checked={translate} onChange={(v) => change('translateContent', v)} />
      </SettingsGroup>

      <SettingsGroup title="Preferred content languages" footer={`Pick up to ${MAX_CONTENT_LANGUAGES}. ${content.length} selected.`}>
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
