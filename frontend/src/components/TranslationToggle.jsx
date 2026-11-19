'use client';

import { useLanguage } from '@/context/LanguageContext';
import { translationLabels } from '@/hooks/useContentTranslation';

// Subtle "Translated · Show original" / "See translation" line for a caption or comment (see useContentTranslation).
export default function TranslationToggle({ tr, className = '' }) {
  const { t } = useLanguage();
  const labels = translationLabels(tr, t);
  if (!labels) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${className}`}>
      {labels.badge && <span className="px-1.5 py-0.5 rounded bg-white/15 text-current opacity-80">{labels.badge}</span>}
      <button
        type="button"
        disabled={tr.busy}
        onClick={(e) => {
          e.stopPropagation();
          tr.toggle();
        }}
        className="underline underline-offset-2 opacity-80 hover:opacity-100 disabled:no-underline disabled:opacity-60"
      >
        {labels.action}
      </button>
    </span>
  );
}
