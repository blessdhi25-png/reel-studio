'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Search, Send, Share2, X } from 'lucide-react';
import { api } from '@/lib/api';

// "Invite to Live Stream" sheet. Copy the room link, send it to friends as a direct message, or use the
// device's share sheet. A link opens /live/<id>, which checks the stream still exists and asks the visitor to
// log in first if they aren't (and brings them straight back).

export function liveInviteUrl(streamId) {
  return `${window.location.origin}/live/${streamId}`;
}

function inviteText(stream, url) {
  const host = stream?.host?.username ? `@${stream.host.username}` : 'I';
  const title = stream?.title ? ` “${stream.title}”` : '';
  return `🔴 ${host === 'I' ? 'I’m' : `${host} is`} live on ClipPulse${title}. Join here: ${url}`;
}

export default function InviteSheet({ streamId, stream, onClose }) {
  const url = useMemo(() => liveInviteUrl(streamId), [streamId]);
  const text = useMemo(() => inviteText(stream, url), [stream, url]);
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState(null); // null = loading
  const [fallbackList, setFallbackList] = useState(false); // true when showing "people you follow" instead of mutuals
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [results, setResults] = useState({}); // userId -> 'sent' | 'failed' | 'blocked'
  const [sending, setSending] = useState(false);
  const copyTimer = useRef(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    let off = false;
    let meId = null;
    try { meId = JSON.parse(localStorage.getItem('user') || 'null')?.id; } catch { /* ignore */ }
    if (!meId) { setFriends([]); return undefined; }
    Promise.all([api.getFollowing(meId).catch(() => []), api.getFollowers(meId).catch(() => [])]).then(([following, followers]) => {
      if (off) return;
      const followerIds = new Set(followers.map((u) => u.id));
      const mutual = following.filter((u) => followerIds.has(u.id));
      // Friends = people who follow each other. If there are none yet, fall back to everyone the person follows.
      setFallbackList(mutual.length === 0);
      setFriends(mutual.length ? mutual : following);
    });
    return () => { off = true; clearTimeout(copyTimer.current); };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API blocked (insecure context / permissions): select-and-copy fallback.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      ta.remove();
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function systemShare() {
    try {
      await navigator.share({ title: stream?.title || 'ClipPulse live', text: inviteText(stream, '').replace(' Join here: ', ''), url });
    } catch {
      /* the person closed the share sheet */
    }
  }

  function toggle(id) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function sendToSelected() {
    const ids = [...selected].filter((id) => results[id] !== 'sent');
    if (!ids.length) return;
    setSending(true);
    await Promise.all(ids.map(async (id) => {
      try {
        await api.sendMessage(id, text);
        setResults((r) => ({ ...r, [id]: 'sent' }));
      } catch (err) {
        // 403 = that person limits who can message them (or has blocked you).
        setResults((r) => ({ ...r, [id]: err?.status === 403 ? 'blocked' : 'failed' }));
      }
    }));
    setSelected((cur) => new Set([...cur].filter((id) => !ids.includes(id))));
    setSending(false);
  }

  const shown = (friends || []).filter((u) => !query.trim() || u.username.toLowerCase().includes(query.trim().toLowerCase().replace(/^@/, '')));
  const pending = [...selected].filter((id) => results[id] !== 'sent').length;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="invite-title" className="font-extrabold text-lg tracking-tight">Invite to Live Stream</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 flex items-center justify-center"><X size={18} /></button>
        </div>

        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 rounded-2xl bg-zinc-900 border border-zinc-800 pl-4 pr-1.5 py-1.5">
            <p className="flex-1 min-w-0 truncate text-sm text-zinc-300 select-all">{url}</p>
            <button type="button" onClick={copyLink} className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${copied ? 'bg-emerald-500 text-black' : 'bg-amber-500 hover:bg-amber-400 text-black'}`}>
              {copied ? <Check size={16} strokeWidth={3} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
          {canShare && (
            <button type="button" onClick={systemShare} className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sm font-bold">
              <Share2 size={16} /> Share via…
            </button>
          )}
        </div>

        <div className="px-5 pb-2 border-t border-zinc-900 pt-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-zinc-500 mb-2">{fallbackList && friends?.length ? 'People you follow' : 'Send to friends'}</p>
          <div className="flex items-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2">
            <Search size={16} className="text-zinc-500 shrink-0" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by username" className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500" />
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto px-3 min-h-[8rem]">
          {friends === null && <li className="px-2 py-6 text-center text-sm text-zinc-500">Loading friends…</li>}
          {friends && friends.length === 0 && <li className="px-2 py-6 text-center text-sm text-zinc-500">Follow people to invite them here. You can still copy the link above.</li>}
          {friends && friends.length > 0 && shown.length === 0 && <li className="px-2 py-6 text-center text-sm text-zinc-500">No one matches “{query}”.</li>}
          {shown.map((u) => {
            const status = results[u.id];
            const on = selected.has(u.id);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => status !== 'sent' && toggle(u.id)}
                  disabled={status === 'sent'}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-zinc-900 text-left disabled:hover:bg-transparent"
                >
                  <span className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center font-bold text-sm shrink-0">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : u.username[0]?.toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0 truncate font-semibold text-sm">@{u.username}</span>
                  {status === 'sent' ? (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1"><Check size={14} strokeWidth={3} /> Sent</span>
                  ) : status === 'blocked' ? (
                    <span className="text-xs font-bold text-zinc-500">Can’t message</span>
                  ) : status === 'failed' ? (
                    <span className="text-xs font-bold text-rose-400">Failed · tap to retry</span>
                  ) : (
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'}`}>
                      {on && <Check size={12} strokeWidth={4} className="text-black" />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-zinc-900">
          <button
            type="button"
            onClick={sendToSelected}
            disabled={sending || pending === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm disabled:opacity-40"
          >
            <Send size={16} />
            {sending ? 'Sending…' : pending ? `Send to ${pending} friend${pending === 1 ? '' : 's'}` : 'Select friends to send'}
          </button>
        </div>
      </div>
    </div>
  );
}
