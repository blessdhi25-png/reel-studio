'use client';

import { useEffect, useState } from 'react';
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
  const text = encodeURIComponent(`Check out this video on Reel: ${url}`);

  const actions = [
    { label: 'Copy link', icon: '🔗', bg: 'bg-smoke/20', onClick: copyLink },
    { label: 'WhatsApp', icon: '✆', bg: 'bg-[#25D366]', onClick: () => openExternal(`https://wa.me/?text=${text}`) },
    { label: 'SMS', icon: '💬', bg: 'bg-smoke/40', onClick: shareSMS },
    { label: 'Telegram', icon: '➤', bg: 'bg-[#229ED9]', onClick: () => openExternal(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`) },
    { label: 'Facebook', icon: 'f', bg: 'bg-[#1877F2]', onClick: () => openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`) },
    { label: 'Repost', icon: '⟲', bg: 'bg-smoke/20', onClick: () => toast('Repost is coming soon') },
    { label: 'Report', icon: '⚑', bg: 'bg-smoke/20', onClick: () => { onReport(); onClose(); } },
    { label: 'Not interested', icon: '𝗑', bg: 'bg-smoke/20', onClick: notInterested },
    { label: 'Download', icon: '⬇', bg: 'bg-smoke/20', onClick: download },
    { label: 'Caption', icon: 'Aa', bg: 'bg-smoke/20', onClick: copyCaption },
    { label: 'Why this post', icon: '?', bg: 'bg-smoke/20', onClick: () => setShowWhy(true) },
  ];

  return (
    <div className="absolute inset-0 z-30 flex items-end">
      <div className="absolute inset-0 bg-ink/70" onClick={onClose} />
      <div className="relative w-full max-h-[75%] bg-ink2 rounded-t-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-smoke/10">
          <span className="w-6" />
          <p className="font-display text-xl text-bone tracking-wide">Send to</p>
          <button onClick={onClose} className="text-smoke text-lg font-body leading-none">✕</button>
        </div>

        {/* Quick-send to people you DM */}
        {loggedIn && (
          <div className="px-6 py-4 border-b border-smoke/10">
            {conversations.length === 0 ? (
              <p className="font-body text-xs text-smoke">
                Message people to see them here for quick sharing.
              </p>
            ) : (
              <div className="flex gap-4 overflow-x-auto">
                {conversations.slice(0, 10).map((c) => {
                  const other = c.user || {};
                  const done = sentTo.has(other.id);
                  return (
                    <button
                      key={other.id}
                      onClick={() => sendToContact(c)}
                      className="flex flex-col items-center gap-1 shrink-0 w-14"
                    >
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center font-mono text-sm ${
                          done ? 'bg-reel/30 text-reel border border-reel' : 'bg-ink text-smoke border border-smoke/20'
                        }`}
                      >
                        {done ? '✓' : (other.username?.[0]?.toUpperCase() || '?')}
                      </div>
                      <span className="font-body text-[10px] text-smoke truncate w-full text-center">
                        {other.username || 'user'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action grid */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-4 gap-y-5">
            {actions.map((a) => (
              <button key={a.label} onClick={a.onClick} className="flex flex-col items-center gap-2">
                <span className={`w-11 h-11 rounded-full flex items-center justify-center text-bone text-lg ${a.bg}`}>
                  {a.icon}
                </span>
                <span className="font-body text-[10px] text-smoke text-center leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {showWhy && (
        <div className="absolute inset-0 bg-ink/90 flex items-center justify-center z-40 px-6" onClick={() => setShowWhy(false)}>
          <div className="bg-ink2 rounded-sprocket p-6 w-full max-w-sm border border-smoke/20" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-xl text-bone mb-3 tracking-wide">Why this post?</p>
            <p className="font-body text-sm text-smoke mb-5">
              Posts are ranked using signals like the videos you watch to the end, your likes and
              comments, and the creators you follow. Skipping past videos quickly, or marking one as
              "Not interested," tells us to show fewer like it.
            </p>
            <button
              onClick={() => setShowWhy(false)}
              className="w-full bg-reel text-ink font-body font-semibold py-2 rounded-sprocket"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
