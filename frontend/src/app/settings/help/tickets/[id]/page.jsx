'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { StatusPill, TICKET_CATEGORIES, TICKET_STATUS, timeAgo } from '@/lib/supportUi';
import { SettingsPage } from '@/components/settings/SettingsUI';

const BOX = 'w-full rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 px-3.5 py-3 font-sans text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500';
const SHELL = (children) => <SettingsPage title="Ticket" backHref="/settings/help/tickets" backLabel="Tickets">{children}</SettingsPage>;

export default function TicketThreadPage({ params }) {
  const ok = useRequireAuth();
  const toast = useToast();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [isStaff, setIsStaff] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.getSupportTicket(params.id).then((t) => { setTicket(t); setNote(t.adminNote || ''); }).catch((e) => setError(friendlyError(e)));
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

  async function update(body, done) {
    try {
      await api.updateSupportTicket(params.id, body);
      if (done) toast.success(done);
      load();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  if (!ok) return null;
  if (error) return SHELL(<p className="py-10 text-center font-sans text-sm text-rose-500">{error}</p>);
  if (!ticket) return SHELL(<p className="py-10 text-center font-sans text-sm text-slate-500">Loading…</p>);

  const closed = ticket.status === 'CLOSED';
  const typeLabel = TICKET_CATEGORIES.find((c) => c.value === ticket.issueType)?.label || 'Other';
  const submitter = ticket.user?.username ? `@${ticket.user.username}` : 'You';
  const thread = ticket.replies || [];

  return SHELL(
    <>
      <div className="flex items-start gap-3 mb-1">
        <h2 className="flex-1 font-sans font-extrabold text-xl text-slate-900 dark:text-white leading-snug">{ticket.title}</h2>
        <StatusPill status={ticket.status} />
      </div>
      <p className="font-sans text-xs text-slate-500 dark:text-neutral-400 mb-4">
        {typeLabel} · {isStaff && ticket.user?.email ? `${submitter} (${ticket.user.email}) · ` : ''}{timeAgo(ticket.createdAt)}
      </p>

      <div className="rounded-2xl p-4 mb-3 bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800">
        <p className="font-sans text-xs font-bold text-slate-500 dark:text-neutral-400 mb-1">{submitter} · {timeAgo(ticket.createdAt)}</p>
        <p className="font-sans text-sm text-slate-800 dark:text-neutral-200 whitespace-pre-line leading-relaxed">{ticket.description}</p>
        {(ticket.deviceInfo || ticket.locationText) && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-neutral-800 space-y-1.5">
            {ticket.deviceInfo && <p className="flex items-start gap-2 font-sans text-xs text-slate-500 dark:text-neutral-400"><Smartphone size={14} className="mt-px shrink-0" aria-hidden="true" /><span className="break-words">{ticket.deviceInfo}</span></p>}
            {ticket.locationText && <p className="flex items-start gap-2 font-sans text-xs text-slate-500 dark:text-neutral-400"><MapPin size={14} className="mt-px shrink-0" aria-hidden="true" /><span className="break-words">{ticket.locationText}</span></p>}
          </div>
        )}
      </div>

      <div className="space-y-3 mb-5">
        {thread.map((m) => (
          <div key={m.id} className={`rounded-2xl p-4 ${m.isStaff ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800'}`}>
            <p className="font-sans text-xs font-bold text-slate-500 dark:text-neutral-400 mb-1">
              {m.isStaff ? `ClipPulse support${isStaff && m.author?.username ? ` (@${m.author.username})` : ''}` : m.author?.username ? `@${m.author.username}` : 'You'} · {timeAgo(m.createdAt)}
            </p>
            <p className="font-sans text-sm text-slate-800 dark:text-neutral-200 whitespace-pre-line leading-relaxed">{m.message}</p>
          </div>
        ))}
      </div>

      {isStaff && (
        <div className="rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-4 mb-5 space-y-3">
          <p className="font-sans font-bold text-xs uppercase tracking-widest text-slate-500 dark:text-neutral-500">Staff</p>
          <div className="flex flex-wrap gap-2">
            {['OPEN', 'IN_REVIEW', 'RESOLVED'].map((v) => (
              <button key={v} type="button" disabled={ticket.status === v} onClick={() => update({ status: v }, `Marked ${TICKET_STATUS[v].label.toLowerCase()}`)} className="px-3 py-1.5 rounded-full bg-slate-200/70 dark:bg-neutral-800 font-sans font-bold text-xs text-slate-700 dark:text-neutral-200 disabled:opacity-40">
                {v === 'OPEN' ? 'Reopen' : `Mark ${TICKET_STATUS[v].label.toLowerCase()}`}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="font-sans font-bold text-xs text-slate-600 dark:text-neutral-300">Internal note (never shown to the user)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={`${BOX} mt-1`} />
          </label>
          <button type="button" disabled={note === (ticket.adminNote || '')} onClick={() => update({ adminNote: note }, 'Note saved')} className="px-4 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-black font-sans font-bold text-xs disabled:opacity-40">Save note</button>
        </div>
      )}

      {closed ? (
        <p className="font-sans text-sm text-slate-500 dark:text-neutral-400 text-center py-4">This ticket is closed. Open a new one if you still need help.</p>
      ) : (
        <form onSubmit={reply} className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={4000} placeholder={isStaff ? 'Write a response to the user…' : 'Write a reply…'} className={BOX} />
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !text.trim()} className="flex-1 py-3 rounded-full bg-amber-500 text-black font-sans font-bold text-sm disabled:opacity-40">{busy ? 'Sending…' : isStaff ? 'Send response' : 'Reply'}</button>
            {!isStaff && <button type="button" onClick={() => update({ status: 'CLOSED' })} className="px-5 py-3 rounded-full bg-slate-200/70 dark:bg-neutral-800 font-sans font-bold text-sm text-slate-700 dark:text-neutral-200">Close ticket</button>}
          </div>
        </form>
      )}
    </>
  );
}
