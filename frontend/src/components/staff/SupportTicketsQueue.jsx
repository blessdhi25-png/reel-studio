'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useToast } from '@/context/ToastContext';
import { TICKET_CATEGORIES, TICKET_STATUS, timeAgo } from '@/lib/supportUi';

// Support Tickets tab of the admin and moderator dashboards. Staff see every user's tickets (the backend
// returns them only to admin/moderator accounts and re-checks the role on every request, including each PATCH).
// `t` is the dashboard's theme token set so the same markup fits the dark admin and light moderator portals.

const STATUS_STYLE = {
  OPEN: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
  IN_REVIEW: 'bg-blue-500/15 text-blue-500 border-blue-500/40',
  RESOLVED: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
  CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/40',
};
const FILTERS = [['', 'All'], ['OPEN', 'Open'], ['IN_REVIEW', 'In review'], ['RESOLVED', 'Resolved']];
const catLabel = (v) => TICKET_CATEGORIES.find((c) => c.value === v)?.label || 'Other';

export default function SupportTicketsQueue({ t, onCount }) {
  const toast = useToast();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('OPEN');

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.listSupportTickets({ scope: 'all' });
      setTickets(r.tickets || []);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Keep the tab badge in step with what's on screen.
  useEffect(() => {
    if (tickets) onCount?.(tickets.filter((x) => x.status === 'OPEN').length);
  }, [tickets, onCount]);

  const patchLocal = (id, patch) => setTickets((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const counts = (tickets || []).reduce((acc, x) => ({ ...acc, [x.status]: (acc[x.status] || 0) + 1 }), {});
  const shown = (tickets || []).filter((x) => !filter || x.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className={`text-lg font-black tracking-tight ${t.heading}`}>Support tickets</h2>
        <button onClick={load} className={`shrink-0 px-4 py-2 rounded-xl border text-xs font-extrabold uppercase tracking-widest ${t.outlineBtn}`}>Refresh</button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto mb-4">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-extrabold ${filter === value ? 'bg-amber-500 text-black' : t.chip}`}
          >
            {label}{tickets ? ` · ${value ? counts[value] || 0 : tickets.length}` : ''}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-red-500">{error}</p>
          <button onClick={load} className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-extrabold">Retry</button>
        </div>
      )}
      {!tickets && !error && <p className={`text-sm font-bold ${t.sub}`}>Loading tickets…</p>}
      {tickets && shown.length === 0 && (
        <div className={`rounded-2xl border p-10 text-center ${t.card}`}>
          <p className={`text-lg font-black ${t.heading}`}>{filter ? 'Nothing here' : 'No tickets yet'}</p>
          <p className={`text-sm font-semibold mt-1 ${t.sub}`}>{filter === 'OPEN' ? 'No tickets are waiting for a response.' : 'Tickets people submit from the Help Centre appear here.'}</p>
        </div>
      )}

      <ul className="space-y-4">
        {shown.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} t={t} toast={toast} onChange={(patch) => patchLocal(ticket.id, patch)} />
        ))}
      </ul>
    </div>
  );
}

function TicketCard({ ticket, t, toast, onChange }) {
  const [open, setOpen] = useState(false); // conversation
  const [replies, setReplies] = useState(null);
  const [response, setResponse] = useState('');
  const [note, setNote] = useState(ticket.adminNote || '');
  const [busy, setBusy] = useState('');
  const u = ticket.user;
  const input = `w-full rounded-xl border px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-amber-500 ${t.quote}`;

  async function loadReplies() {
    try {
      const full = await api.getSupportTicket(ticket.id);
      setReplies(full.replies || []);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }
  function toggleConversation() {
    setOpen((v) => !v);
    if (!open && !replies) loadReplies();
  }

  async function setStatus(status) {
    setBusy(status);
    try {
      await api.updateSupportTicket(ticket.id, { status });
      onChange({ status });
      toast.success(`Marked ${TICKET_STATUS[status].label.toLowerCase()}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy('');
    }
  }

  async function sendResponse() {
    setBusy('reply');
    try {
      const r = await api.replySupportTicket(ticket.id, response.trim());
      setResponse('');
      onChange({ status: r.status || ticket.status, _count: { replies: (ticket._count?.replies || 0) + 1 } });
      setReplies((list) => (list ? [...list, r.reply] : list));
      toast.success('Response sent to the user');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy('');
    }
  }

  async function saveNote() {
    setBusy('note');
    try {
      await api.updateSupportTicket(ticket.id, { adminNote: note });
      onChange({ adminNote: note.trim() || null });
      toast.success('Internal note saved');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy('');
    }
  }

  const btn = 'px-4 py-2.5 rounded-xl text-sm font-extrabold tracking-tight transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <li className={`rounded-2xl border p-4 ${t.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-9 h-9 shrink-0 rounded-full overflow-hidden flex items-center justify-center text-sm font-black ${t.thumb}`}>
            {u?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (u?.username || '?')[0].toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <p className={`font-extrabold tracking-tight truncate ${t.heading}`}>
              {u?.displayName || (u?.username ? `@${u.username}` : 'Unknown user')}
              {u?.displayName && u?.username && <span className={`ml-1.5 font-semibold ${t.sub}`}>@{u.username}</span>}
            </p>
            <p className={`text-xs font-semibold truncate ${t.sub}`}>{u?.email || 'No email on file'}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${STATUS_STYLE[ticket.status] || STATUS_STYLE.OPEN}`}>
          {(TICKET_STATUS[ticket.status]?.label || ticket.status)}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-extrabold uppercase tracking-wider rounded-lg px-2 py-1 ${t.chip}`}>{catLabel(ticket.issueType)}</span>
          <span className={`text-[11px] font-bold ${t.link}`}>{new Date(ticket.createdAt).toLocaleString()} · {timeAgo(ticket.createdAt)}</span>
        </div>
        <p className={`mt-2 font-extrabold tracking-tight ${t.heading}`}>{ticket.title}</p>
        <p className={`mt-1 text-sm font-semibold whitespace-pre-line leading-relaxed ${t.sub}`}>{ticket.description}</p>
      </div>

      {(ticket.deviceInfo || ticket.locationText) && (
        <dl className={`mt-3 rounded-xl border px-3 py-2.5 text-xs font-semibold space-y-1 ${t.quote}`}>
          {ticket.deviceInfo && <div className="flex gap-2"><dt className="font-extrabold shrink-0">Device</dt><dd className="break-words">{ticket.deviceInfo}</dd></div>}
          {ticket.locationText && <div className="flex gap-2"><dt className="font-extrabold shrink-0">Location</dt><dd className="break-words">{ticket.locationText}</dd></div>}
        </dl>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`} disabled={!!busy || ticket.status === 'IN_REVIEW'} onClick={() => setStatus('IN_REVIEW')}>
          {busy === 'IN_REVIEW' ? 'Saving…' : 'Mark in review'}
        </button>
        <button type="button" className={`${btn} bg-emerald-500 hover:bg-emerald-400 text-black`} disabled={!!busy || ticket.status === 'RESOLVED'} onClick={() => setStatus('RESOLVED')}>
          {busy === 'RESOLVED' ? 'Saving…' : 'Mark resolved'}
        </button>
        {(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
          <button type="button" className={`${btn} border ${t.outlineBtn}`} disabled={!!busy} onClick={() => setStatus('OPEN')}>Reopen</button>
        )}
        <button type="button" className={`${btn} border ${t.outlineBtn}`} onClick={toggleConversation}>
          {open ? 'Hide' : 'View'} conversation{ticket._count?.replies ? ` (${ticket._count.replies})` : ''}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {!replies && <p className={`text-xs font-bold ${t.sub}`}>Loading…</p>}
          {replies && replies.length === 0 && <p className={`text-xs font-bold ${t.sub}`}>No replies yet.</p>}
          {(replies || []).map((r) => (
            <div key={r.id} className={`rounded-xl border px-3 py-2 ${r.isStaff ? 'border-amber-500/40 bg-amber-500/10' : t.quote}`}>
              <p className={`text-[11px] font-extrabold ${t.sub}`}>{r.isStaff ? `Support${r.author?.username ? ` (@${r.author.username})` : ''}` : r.author?.username ? `@${r.author.username}` : 'User'} · {timeAgo(r.createdAt)}</p>
              <p className={`text-sm font-semibold whitespace-pre-line mt-0.5 ${t.heading}`}>{r.message}</p>
            </div>
          ))}
        </div>
      )}

      {ticket.status !== 'CLOSED' && (
        <div className="mt-4 space-y-2">
          <label className={`block text-[11px] font-extrabold uppercase tracking-widest ${t.kpiLabel}`}>Response to the user</label>
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={3} maxLength={4000} placeholder="Write a reply they’ll see in their ticket and notifications…" className={input} />
          <button type="button" className={`${btn} bg-amber-500 hover:bg-amber-400 text-black`} disabled={!!busy || !response.trim()} onClick={sendResponse}>
            {busy === 'reply' ? 'Sending…' : 'Send response'}
          </button>
        </div>
      )}

      <details className="mt-3">
        <summary className={`cursor-pointer text-xs font-extrabold uppercase tracking-widest ${t.link}`}>Internal note{ticket.adminNote ? ' · saved' : ''}</summary>
        <div className="mt-2 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Only admins and moderators can see this" className={input} />
          <button type="button" className={`${btn} border ${t.outlineBtn}`} disabled={!!busy || note === (ticket.adminNote || '')} onClick={saveNote}>
            {busy === 'note' ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </details>
    </li>
  );
}
