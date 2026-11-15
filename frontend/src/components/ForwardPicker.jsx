'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { LoadingSpinner } from './LoadingScreen';

// Pick who to forward a message to (people you already have a conversation with).
export default function ForwardPicker({ message, onClose, onForwarded }) {
  const [convos, setConvos] = useState(null);
  const [query, setQuery] = useState('');
  const [sendingTo, setSendingTo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getConversations().then(setConvos).catch((e) => {
      setConvos([]);
      setError(e.message);
    });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (convos || []).filter((c) => !q || c.user.username.toLowerCase().includes(q));
  }, [convos, query]);

  async function forwardTo(user) {
    setSendingTo(user.id);
    setError(null);
    try {
      const sent = await api.sendMessage(user.id, '', null, { forwardMessageId: message.id });
      onForwarded(user, sent);
    } catch (err) {
      setError(err.message);
      setSendingTo(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70" onClick={onClose} role="presentation">
      <div
        className="w-full sm:max-w-sm max-h-[70vh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-label="Forward message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="font-extrabold text-base text-white">Forward to…</p>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pb-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-zinc-800 text-white text-sm rounded-full px-4 py-2 outline-none border border-transparent focus:border-amber-500/60"
          />
        </div>
        {error && <p className="px-5 pb-2 text-xs font-semibold text-red-400">{error}</p>}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {convos === null && <LoadingSpinner label="Loading…" />}
          {convos && visible.length === 0 && (
            <p className="px-3 py-4 text-xs text-zinc-500">
              {convos.length === 0 ? 'Start a conversation first, then you can forward messages to it.' : 'No matches.'}
            </p>
          )}
          {visible.map((c) => (
            <button
              key={c.user.id}
              onClick={() => forwardTo(c.user)}
              disabled={sendingTo !== null}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800 text-left transition disabled:opacity-60"
            >
              <span className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center text-amber-400 font-bold shrink-0">
                {c.user.avatarUrl ? <img src={c.user.avatarUrl} alt="" className="w-full h-full object-cover" /> : c.user.username?.[0]?.toUpperCase()}
              </span>
              <span className="flex-1 min-w-0 font-bold text-sm text-white truncate">@{c.user.username}</span>
              <span className="text-xs font-bold text-amber-400 shrink-0">{sendingTo === c.user.id ? 'Sending…' : 'Send'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
