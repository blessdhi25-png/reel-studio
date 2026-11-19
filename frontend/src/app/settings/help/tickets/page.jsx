'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Ticket } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { StatusPill, TICKET_CATEGORIES, timeAgo } from '@/lib/supportUi';
import { SettingsPage } from '@/components/settings/SettingsUI';

export default function TicketsPage() {
  const ok = useRequireAuth();
  const [isStaff, setIsStaff] = useState(false);
  const [scope, setScope] = useState('mine');
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ok) return;
    api.getMe().then((me) => setIsStaff(['admin', 'moderator'].includes(String(me?.role || me?.user?.role || '').toLowerCase()))).catch(() => {});
  }, [ok]);

  useEffect(() => {
    if (!ok) return;
    let off = false;
    setTickets(null);
    setError('');
    api.listSupportTickets({ scope: scope === 'all' ? 'all' : undefined })
      .then((r) => { if (!off) setTickets(r.tickets || []); })
      .catch((e) => { if (!off) { setError(friendlyError(e)); setTickets([]); } });
    return () => { off = true; };
  }, [ok, scope]);

  if (!ok) return null;
  const cat = (v) => TICKET_CATEGORIES.find((c) => c.value === v)?.label || 'Other';

  return (
    <SettingsPage
      title="Support tickets"
      backHref="/settings/help"
      backLabel="Help Centre"
      headerRight={
        <Link href="/settings/help/tickets/new" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-black font-sans font-bold text-xs">
          <Plus size={14} strokeWidth={3} /> New ticket
        </Link>
      }
    >
      {isStaff && (
        <div className="flex gap-2 mb-4">
          {[['mine', 'My tickets'], ['all', 'All tickets']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setScope(v)} className={`px-4 py-2 rounded-full font-sans font-bold text-sm ${scope === v ? 'bg-slate-900 text-white dark:bg-white dark:text-black' : 'bg-slate-200/70 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'}`}>{l}</button>
          ))}
        </div>
      )}

      {tickets === null ? (
        <p className="font-sans text-sm text-slate-500 dark:text-neutral-400 py-10 text-center">Loading…</p>
      ) : error ? (
        <p className="font-sans text-sm text-rose-500 py-10 text-center">{error}</p>
      ) : tickets.length === 0 ? (
        <div className="text-center py-14">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3"><Ticket size={22} /></span>
          <p className="font-sans font-bold text-slate-900 dark:text-white">No support tickets</p>
          <p className="font-sans text-sm text-slate-500 dark:text-neutral-400 mt-1">Create one and we’ll reply here.</p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 divide-y divide-slate-100 dark:divide-neutral-800 overflow-hidden">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/settings/help/tickets/${t.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-neutral-800/60">
                <div className="min-w-0 flex-1">
                  <p className="font-sans font-bold text-[15px] text-slate-900 dark:text-white truncate">{t.subject}</p>
                  <p className="font-sans text-xs text-slate-500 dark:text-neutral-400 mt-0.5 truncate">
                    {scope === 'all' && t.user?.username ? `@${t.user.username} · ` : ''}{cat(t.category)} · {t._count?.replies || 0} {t._count?.replies === 1 ? 'reply' : 'replies'} · {timeAgo(t.updatedAt)}
                  </p>
                </div>
                <StatusPill status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SettingsPage>
  );
}
