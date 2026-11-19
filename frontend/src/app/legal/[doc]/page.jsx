'use client';

import { useEffect, useMemo, useState } from 'react';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { LEGAL_DOCS, LEGAL_UPDATED } from '@/lib/legalDocs';
import { SettingsPage } from '@/components/settings/SettingsUI';

// URL segment -> default copy key + API slug. The full slugs are accepted too.
const DOCS = {
  terms: { key: 'terms', slug: 'terms-of-service' },
  'terms-of-service': { key: 'terms', slug: 'terms-of-service' },
  privacy: { key: 'privacy', slug: 'privacy-policy' },
  'privacy-policy': { key: 'privacy', slug: 'privacy-policy' },
  guidelines: { key: 'guidelines', slug: 'community-guidelines' },
  'community-guidelines': { key: 'guidelines', slug: 'community-guidelines' },
};

// Stored text: first block is the intro, then "## Heading" starts each section.
function parsePolicy(content) {
  const parts = String(content || '').replace(/\r\n/g, '\n').split(/^##[ \t]+/m);
  const intro = parts.shift().trim();
  const sections = parts
    .map((p) => {
      const nl = p.indexOf('\n');
      return nl === -1 ? { heading: p.trim(), body: '' } : { heading: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
    })
    .filter((s) => s.heading || s.body);
  return { intro, sections };
}

function serializeDefault(doc) {
  return [doc.intro, ...doc.sections.map((s) => `## ${s.heading}\n${s.body}`)].join('\n\n');
}

export default function LegalDocPage({ params }) {
  const entry = Object.prototype.hasOwnProperty.call(DOCS, params.doc) ? DOCS[params.doc] : null;
  if (!entry) notFound();
  const fallback = LEGAL_DOCS[entry.key];

  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const [saved, setSaved] = useState(null); // { title, content, updatedAt } from the server, or null = defaults
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let off = false;
    api.getPolicy(entry.slug).then((p) => { if (!off && p?.content) setSaved(p); }).catch(() => {});
    return () => { off = true; };
  }, [entry.slug]);

  // Role comes from the DB via /auth/me; the server re-checks it on every save regardless.
  useEffect(() => {
    if (!isAuthenticated) return setCanEdit(false);
    let off = false;
    api.getMe().then((me) => { if (!off) setCanEdit(['admin', 'moderator'].includes(String(me?.role || me?.user?.role || '').toLowerCase())); }).catch(() => {});
    return () => { off = true; };
  }, [isAuthenticated]);

  const view = useMemo(() => (saved ? { title: saved.title || fallback.title, ...parsePolicy(saved.content) } : fallback), [saved, fallback]);
  const updated = saved?.updatedAt ? new Date(saved.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : LEGAL_UPDATED;

  function startEdit() {
    setTitle(saved?.title || fallback.title);
    setContent(saved?.content || serializeDefault(fallback));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const p = await api.updatePolicy(entry.slug, { title: title.trim(), content: content.trim() });
      setSaved(p);
      setEditing(false);
      toast.success('Policy updated');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-full rounded-xl bg-neutral-950 border border-neutral-700 px-3 py-2.5 font-sans text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500';

  return (
    <SettingsPage
      title={view.title}
      headerRight={canEdit && !editing ? (
        <button type="button" onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-black font-sans font-bold text-xs">
          <Pencil size={14} /> Edit Policy
        </button>
      ) : null}
    >
      <p className="font-sans font-medium text-xs text-neutral-500 -mt-3 mb-4 px-1">Last updated {updated}</p>

      {editing ? (
        <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 p-5 mb-5 space-y-3">
          <label className="block">
            <span className="font-sans font-bold text-xs text-neutral-300">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={`${field} mt-1`} />
          </label>
          <label className="block">
            <span className="font-sans font-bold text-xs text-neutral-300">Content</span>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={16} maxLength={60000} className={`${field} mt-1 leading-relaxed`} />
          </label>
          <p className="font-sans text-xs text-neutral-500">Write the introduction first, then start each section with a line like <code className="text-amber-500">## Heading</code>. Saving publishes immediately for everyone.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="px-4 py-2 rounded-xl bg-neutral-800 text-white font-sans font-bold text-sm">Cancel</button>
            <button type="button" onClick={save} disabled={saving || title.trim().length < 2 || !content.trim()} className="px-4 py-2 rounded-xl bg-amber-500 text-black font-sans font-bold text-sm disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 p-5 mb-5">
          {view.intro && <p className="font-sans font-bold text-sm text-white whitespace-pre-line">{view.intro}</p>}
          {view.sections.map((s, i) => (
            <section key={`${s.heading}-${i}`} className="mt-5">
              <h2 className="font-sans font-bold text-[11px] tracking-widest uppercase text-amber-500 mb-1.5">{s.heading}</h2>
              <p className="font-sans font-medium text-sm text-neutral-300 leading-relaxed whitespace-pre-line">{s.body}</p>
            </section>
          ))}
        </div>
      )}
    </SettingsPage>
  );
}
