'use client';

import { notFound } from 'next/navigation';
import { LEGAL_DOCS, LEGAL_UPDATED } from '@/lib/legalDocs';
import { SettingsPage } from '@/components/settings/SettingsUI';

export default function LegalDocPage({ params }) {
  const doc = Object.prototype.hasOwnProperty.call(LEGAL_DOCS, params.doc) ? LEGAL_DOCS[params.doc] : null;
  if (!doc) notFound();

  return (
    <SettingsPage title={doc.title}>
      <p className="font-sans font-medium text-xs text-neutral-500 -mt-3 mb-4 px-1">Last updated {LEGAL_UPDATED}</p>
      <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 p-5 mb-5">
        <p className="font-sans font-bold text-sm text-white">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.heading} className="mt-5">
            <h2 className="font-sans font-bold text-[11px] tracking-widest uppercase text-amber-500 mb-1.5">{s.heading}</h2>
            <p className="font-sans font-medium text-sm text-neutral-300 leading-relaxed">{s.body}</p>
          </section>
        ))}
      </div>
    </SettingsPage>
  );
}
