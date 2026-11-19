'use client';

import { LANGUAGES } from '@/lib/languages';
import { useLanguage } from '@/context/LanguageContext';

// "Video language" picker for the upload form. Tags the post so it can be ranked for people who prefer that language.
export default function PostLanguageSelect({ value, onChange }) {
  const { t } = useLanguage();
  return (
    <div className="mt-4">
      <label htmlFor="post-language" className="block text-xs font-semibold text-zinc-300 mb-1.5">{t('upload.language')}</label>
      <select
        id="post-language"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-amber-500/60 transition"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>{l.native}{l.native !== l.name ? ` · ${l.name}` : ''}</option>
        ))}
      </select>
      <p className="mt-1.5 text-[11px] text-zinc-500">{t('upload.languageHint')}</p>
    </div>
  );
}
