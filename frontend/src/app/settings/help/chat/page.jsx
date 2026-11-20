'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { TICKET_CATEGORIES } from '@/lib/supportUi';
import BackButton from '@/components/BackButton';

const CONNECTION_LOST = 'Connection lost. Please try again.';
const TILE_HINT = {
  account: 'Login, password, profile',
  live: 'Going live, gifts, quality',
  traffic: 'Views and reach',
  interaction: 'Likes, comments, DMs',
  post: 'Uploads and videos',
  monetization: 'Earnings and payouts',
  feed: 'For You and Following',
  other: 'Anything else',
};

// Shrinks a screenshot to a small JPEG (the API request budget is small) and returns { mediaType, data, preview }.
async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  let side = 900;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.4, 0.7 - attempt * 0.06));
    const data = dataUrl.split(',')[1];
    if (data.length < 80_000) return { mediaType: 'image/jpeg', data, preview: dataUrl };
    side = Math.round(side * 0.78);
  }
  throw new Error('too large');
}

export default function SupportChatPage() {
  const ok = useRequireAuth();
  const [issueType, setIssueType] = useState(null);
  const [messages, setMessages] = useState([]); // { id, role, content, image?, error? }
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState(null); // { mediaType, data, preview }
  const [attachError, setAttachError] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const idRef = useRef(0);
  const nextId = () => { idRef.current += 1; return idRef.current; };

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, sending]);

  const typeLabel = TICKET_CATEGORIES.find((c) => c.value === issueType)?.label;

  function pickType(value) {
    const label = TICKET_CATEGORIES.find((c) => c.value === value)?.label;
    setIssueType(value);
    setMessages([{ id: nextId(), role: 'assistant', content: `Hi! I can help with ${label}. What’s going on?` }]);
  }

  async function ask(history, image) {
    setSending(true);
    try {
      const { reply } = await api.supportChat({
        issueType,
        messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        image: image ? { mediaType: image.mediaType, data: image.data } : undefined,
      });
      setMessages((cur) => [...cur, { id: nextId(), role: 'assistant', content: reply }]);
    } catch {
      // Network drop, timeout, rate limit or the service being down: always the same friendly message.
      setMessages((cur) => [...cur, { id: nextId(), role: 'assistant', error: true, content: CONNECTION_LOST }]);
    } finally {
      setSending(false);
    }
  }

  function send(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending || !issueType) return;
    const msg = { id: nextId(), role: 'user', content: text, image: attachment?.preview };
    const history = [...messages, msg];
    setMessages(history);
    setInput('');
    const image = attachment;
    setAttachment(null);
    ask(history, image);
  }

  function retry() {
    if (sending) return;
    const history = messages.filter((m) => !m.error);
    setMessages(history);
    ask(history, null);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachError('');
    if (!file.type.startsWith('image/')) return setAttachError('Only images can be attached.');
    try {
      setAttachment(await compressImage(file));
    } catch {
      setAttachError('That image couldn’t be attached. Try a smaller screenshot.');
    }
  }

  if (!ok) return null;
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const ticketHref = `/settings/help/tickets/new?type=${issueType || 'other'}${lastUser ? `&draft=${encodeURIComponent(lastUser.content.slice(0, 500))}` : ''}`;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50 dark:bg-[#0a090e] text-slate-900 dark:text-white font-sans">
      <header className="shrink-0 border-b border-slate-200/70 dark:border-neutral-800/70 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto h-14 px-2 grid grid-cols-[3rem_1fr_3rem] items-center">
          <BackButton href="/settings/help" label="Back to Help Centre" className="!bg-transparent hover:!bg-slate-200/70 dark:hover:!bg-neutral-800" />
          <h1 className="font-bold text-base text-center truncate">Chat with us{typeLabel ? ` · ${typeLabel}` : ''}</h1>
          <span />
        </div>
      </header>

      <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/20">
        <p className="max-w-2xl mx-auto px-4 py-2 text-xs text-amber-700 dark:text-amber-300 leading-snug">
          Replies are AI-generated and may be wrong. Never share your password or codes. For bans, payments or safety issues, open a ticket and a person will review it.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-3">
          {!issueType ? (
            <>
              <h2 className="font-extrabold text-lg">What do you need help with?</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {TICKET_CATEGORIES.map((c) => (
                  <button key={c.value} type="button" onClick={() => pickType(c.value)} className="text-left rounded-2xl bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 px-4 py-3.5 hover:border-amber-500/60 transition-colors">
                    <span className="block font-bold text-[15px]">{c.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-neutral-400 mt-0.5">{TILE_HINT[c.value]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line break-words ${
                    m.role === 'user' ? 'bg-amber-500 text-black rounded-br-md' : m.error ? 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 rounded-bl-md' : 'bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-bl-md'
                  }`}>
                    {m.image && <img src={m.image} alt="Attachment" className="rounded-lg mb-2 max-h-40" />}
                    {m.content}
                    {m.error && <button type="button" onClick={retry} disabled={sending} className="block mt-1.5 font-bold underline underline-offset-2 disabled:opacity-50">Try again</button>}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 px-4 py-2.5 text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Typing…
                  </div>
                </div>
              )}
              {messages.length > 1 && !sending && (
                <p className="text-center text-xs text-slate-500 dark:text-neutral-500 pt-2">
                  Still stuck? <Link href={ticketHref} className="font-bold text-amber-600 dark:text-amber-400 underline underline-offset-2">Open a support ticket</Link>
                </p>
              )}
              <div ref={endRef} />
            </>
          )}
        </div>
      </div>

      {issueType && (
        <form onSubmit={send} className="shrink-0 border-t border-slate-200/70 dark:border-neutral-800/70 bg-slate-50 dark:bg-[#0a090e] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto px-3 pt-3">
            {attachment && (
              <div className="relative inline-block mb-2">
                <img src={attachment.preview} alt="Attachment preview" className="h-16 rounded-lg border border-slate-200 dark:border-neutral-700" />
                <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center"><X size={12} /></button>
              </div>
            )}
            {attachError && <p className="text-xs text-rose-500 mb-2">{attachError}</p>}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach a screenshot" className="shrink-0 w-11 h-11 rounded-full bg-slate-200/70 dark:bg-neutral-800 flex items-center justify-center text-slate-700 dark:text-neutral-200">
                <Plus size={20} strokeWidth={2.5} />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
                rows={1}
                maxLength={2000}
                placeholder="Describe your problem…"
                className="flex-1 resize-none max-h-32 rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 px-4 py-3 text-sm focus:outline-none focus:border-amber-500"
              />
              <button type="submit" disabled={!input.trim() || sending} aria-label="Send" className="shrink-0 w-11 h-11 rounded-full bg-amber-500 text-black flex items-center justify-center disabled:opacity-40">
                <Send size={18} />
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
