'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { StatusPill, TICKET_STATUS, timeAgo } from '@/lib/supportUi';
import { SettingsPage } from '@/components/settings/SettingsUI';

export default function TicketThreadPage({ params }) {
  const ok = useRequireAuth();
  const toast = useToast();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [isStaff, setIsStaff] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.getSupportTicket(params.id).then(setTicket).catch((e) => setError(friendlyError(e)));
  }, [params.id]);

  useEffect(() => {
    if (!ok) return;
    load();
    api.getMe().then((me) => setIsStaff(['admin', 'moderator'].includes(String(me?.role || me?.user?.role || '').toLowerCase()))).catch(() => {});
  }, [ok, load]);

  async function reply(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.replySupportTicket(params.id, text.trim());
      setText('');
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    try {
      await api.setSupportTicketStatus(params.id, status);
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  if (!ok) return null;
  if (error) return <SettingsPage title="Ticket" backHref="/settings/help/tickets" backLabel="Tickets"><p className="py-10 text-center font-sans text-sm text-rose-500">{error}</p></SettingsPage>;
  if (!ticket) return <SettingsPage title="Ticket" backHref="/settings/help/tickets" backLabel="Tickets"><p className="py-10 text-center font-sans text-sm text-slate-500">Loading…</p></SettingsPage>;

  const closed = ticket.status === 'closed';
  const thread = ticket.replies || []; // the opening message is the first reply

  return (
    <SettingsPage title="Ticket" backHref="/settings/help/tickets" backLabel="Tickets">
      <div className="flex items-start gap-3 mb-4">
        <h2 className="flex-1 font-sans font-extrabold text-xl text-slate-900 dark:text-white leading-snug">{ticket.subject}</h2>
        <StatusPill status={ticket.status} />
      </div>

      <div className="space-y-3 mb-5">
        {thread.map((m) => (
          <div key={m.id} className={`rounded-2xl p-4 ${m.isStaff ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800'}`}>
            <p className="font-sans text-xs font-bold text-slate-500 dark:text-neutral-400 mb-1">
              {m.isStaff ? 'ClipPulse support' : m.author?.username ? `@${m.author.username}` : 'You'} · {timeAgo(m.createdAt)}
            </p>
            <p className="font-sans text-sm text-slate-800 dark:text-neutral-200 whitespace-pre-line leading-relaxed">{m.message}</p>
          </div>
        ))}
      </div>

      {isStaff && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(TICKET_STATUS).map(([v, s]) => (
            <button key={v} type="button" disabled={ticket.status === v} onClick={() => setStatus(v)} className="px-3 py-1.5 rounded-full bg-slate-200/70 dark:bg-neutral-800 font-sans font-bold text-xs text-slate-700 dark:text-neutral-200 disabled:opacity-40">
              Mark {s.label.toLowerCase()}
            </button>
          ))}
        </div>
      )}

      {closed ? (
        <p className="font-sans text-sm text-slate-500 dark:text-neutral-400 text-center py-4">This ticket is closed. Open a new one if you still need help.</p>
      ) : (
        <form onSubmit={reply} className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} placeholder="Write a reply…" className="w-full rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 px-3.5 py-3 font-sans text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !text.trim()} className="flex-1 py-3 rounded-full bg-amber-500 text-black font-sans font-bold text-sm disabled:opacity-40">{busy ? 'Sending…' : 'Reply'}</button>
            {!isStaff && <button type="button" onClick={() => setStatus('closed')} className="px-5 py-3 rounded-full bg-slate-200/70 dark:bg-neutral-800 font-sans font-bold text-sm text-slate-700 dark:text-neutral-200">Close ticket</button>}
          </div>
        </form>
      )}
    </SettingsPage>
  );
}
