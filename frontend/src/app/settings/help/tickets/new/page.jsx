'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { TICKET_CATEGORIES } from '@/lib/supportUi';
import { SettingsPage } from '@/components/settings/SettingsUI';

const FIELD = 'w-full rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 px-3.5 py-3 font-sans text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500';

export default function NewTicketPage() {
  const ok = useRequireAuth();
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState('account');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api.createSupportTicket({ category, subject: subject.trim(), message: message.trim() });
      toast.success('Ticket sent. We’ll reply here.');
      router.replace(`/settings/help/tickets/${t.id}`);
    } catch (err) {
      toast.error(friendlyError(err));
      setBusy(false);
    }
  }

  if (!ok) return null;
  return (
    <SettingsPage title="New ticket" backHref="/settings/help/tickets" backLabel="Tickets">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="font-sans font-bold text-xs text-slate-600 dark:text-neutral-300">Topic</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${FIELD} mt-1`}>
            {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="font-sans font-bold text-xs text-slate-600 dark:text-neutral-300">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Short summary of the problem" className={`${FIELD} mt-1`} />
        </label>
        <label className="block">
          <span className="font-sans font-bold text-xs text-slate-600 dark:text-neutral-300">What happened?</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} maxLength={4000} placeholder="Include what you expected, what you saw, and any video titles or usernames involved." className={`${FIELD} mt-1`} />
        </label>
        <button type="submit" disabled={busy || subject.trim().length < 3 || message.trim().length < 10} className="w-full py-3.5 rounded-full bg-amber-500 text-black font-sans font-bold text-sm disabled:opacity-40">
          {busy ? 'Sending…' : 'Send ticket'}
        </button>
      </form>
    </SettingsPage>
  );
}
