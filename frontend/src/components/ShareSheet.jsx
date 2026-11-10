'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Link2, MessageCircle, Send, Download, Flag, Repeat2, MessageSquare,
  Facebook, EyeOff, Type, HelpCircle, X, Check,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

function shareUrlFor(video) {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?video=${video.id}`;
}

export default function ShareSheet({ video, onClose, onReport }) {
  const [conversations, setConversations] = useState([]);
  const [sentTo, setSentTo] = useState(new Set());
  const [showWhy, setShowWhy] = useState(false);
  const loggedIn = typeof window !== 'undefined' && !!localStorage.getItem('token');
  const toast = useToast();

  useEffect(() => {
    if (!loggedIn) return;
    api.getConversations().then(setConversations).catch(() => {});
  }, [loggedIn]);

  function logShare() {
    api.logEvent(video.id, 'share').catch(() => {});
  }

  async function sendToContact(convo) {
    const otherId = convo.user?.id;
    if (!otherId) return;
    try {
      await api.sendMessage(otherId, `Check this out: ${shareUrlFor(video)}`);
      setSentTo((prev) => new Set(prev).add(otherId));
      logShare();
      toast.success(`Sent to @${convo.user?.username || 'user'}`);
    } catch {
      toast.error("Couldn't send — try again");
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrlFor(video)).then(() => {
      logShare();
      toast.success('Link copied to clipboard');
    });
  }

  function copyCaption() {
    navigator.clipboard.writeText(video.caption || '').then(() => toast.success('Caption copied'));
  }

  function openExternal(url) {
    logShare();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function shareSMS() {
    logShare();
    window.location.href = `sms:?&body=${encodeURIComponent(shareUrlFor(video))}`;
  }

  function download() {
    if (!video.videoUrl) {
      toast.error('Download not available for this post');
      return;
    }
    const a = document.createElement('a');
    a.href = video.videoUrl;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    logShare();
  }

  function notInterested() {
    api.logEvent(video.id, 'skip', 0).catch(() => {});
    toast("Got it — we'll show you less like this");
    setTimeout(onClose, 700);
  }

  const url = shareUrlFor(video);
  const text = encodeURIComponent(`Check out this video on ClipPulse: ${url}`);

  // The six quick actions first, then the rest of what this sheet already
  // offered so nothing is lost in the redesign.
  const actions = [
    { label: 'Copy Link', Icon: Link2, onClick: copyLink },
    { label: 'WhatsApp', Icon: MessageCircle, onClick: () => openExternal(`https://wa.me/?text=${text}`) },
    { label: 'Telegram', Icon: Send, onClick: () => openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`) },
    { label: 'Download', Icon: Download, onClick: download },
    { label: 'Report', Icon: Flag, onClick: () => { onReport(); onClose(); } },
    { label: 'Repost', Icon: Repeat2, onClick: () => toast('Repost is coming soon') },
    { label: 'SMS', Icon: MessageSquare, onClick: shareSMS },
    { label: 'Facebook', Icon: Facebook, onClick: () => openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`) },
    { label: 'Caption', Icon: Type, onClick: copyCaption },
    { label: 'Not interested', Icon: EyeOff, onClick: notInterested },
    { label: 'Why this post', Icon: HelpCircle, onClick: () => setShowWhy(true) },
  ];

  if (typeof document === 'undefined') return null;

  // Portalled to <body> so the backdrop covers the whole screen, BottomNav
  // included (a fixed element inside the feed card would be clipped to it).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label="Share">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-share-backdrop"
        onClick={onClose}
      />
      <div className="relative w-full max-h-[80dvh] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white rounded-t-3xl flex flex-col animate-share-sheet pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-2.5">
          <span className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <span className="w-8" />
          <p className="font-extrabold text-base tracking-tight">Send to</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300"
          >
            <X className="w-4 h-4" strokeWidth={3} />
          </button>
        </div>

        {/* Top tier: direct friends carousel */}
        {loggedIn && (
          <div className="px-5 pb-4">
            {conversations.length === 0 ? (
              <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Message people to see them here for quick sharing.
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                {conversations.slice(0, 12).map((c) => {
                  const other = c.user || {};
                  const done = sentTo.has(other.id);
                  return (
                    <button
                      key={other.id}
                      onClick={() => sendToContact(c)}
                      className="flex flex-col items-center gap-1.5 shrink-0 w-16 snap-start"
                    >
                      <span className="relative w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-800 border-2 border-amber-500 flex items-center justify-center overflow-hidden font-extrabold text-neutral-700 dark:text-neutral-200">
                        {other.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          other.username?.[0]?.toUpperCase() || '?'
                        )}
                        {done && (
                          <span className="absolute inset-0 bg-amber-500/90 flex items-center justify-center text-black">
                            <Check className="w-6 h-6" strokeWidth={3.5} />
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate w-full text-center">
                        {other.username || 'user'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Bottom tier: action grid */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5 border-t border-neutral-100 dark:border-neutral-800">
          <div className="grid grid-cols-4 gap-2.5">
            {actions.map(({ label, Icon, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 p-3.5 rounded-2xl flex flex-col items-center gap-1.5 transition-all text-xs font-bold text-neutral-800 dark:text-neutral-200 active:scale-95"
              >
                <Icon className="w-5 h-5" strokeWidth={2.5} />
                <span className="leading-tight text-center text-[11px]">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showWhy && (
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setShowWhy(false)}
        >
          <div
            className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-extrabold text-lg tracking-tight mb-3">Why this post?</p>
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300 mb-5">
              Posts are ranked using signals like the videos you watch to the end, your likes and
              comments, and the creators you follow. Skipping past videos quickly, or marking one as
              "Not interested," tells us to show fewer like it.
            </p>
            <button
              onClick={() => setShowWhy(false)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-3 rounded-2xl"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
