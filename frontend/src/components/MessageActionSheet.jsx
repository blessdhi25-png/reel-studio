'use client';

import { useEffect } from 'react';
import { Copy, CornerUpRight, Reply, Trash2 } from 'lucide-react';

function ActionButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-5 py-3.5 text-left text-sm font-bold transition hover:bg-zinc-800 ${
        danger ? 'text-red-400' : 'text-white'
      }`}
    >
      <Icon size={18} className={danger ? 'text-red-400' : 'text-zinc-400'} />
      {label}
    </button>
  );
}

// Long-press / right-click menu: Reply, Copy, Forward, Delete. A bottom sheet on phones, a small
// centred card on wider screens.
export default function MessageActionSheet({ message, onClose, onReply, onCopy, onForward, onDelete }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const deleted = message.deleted;
  const preview = deleted
    ? 'This message was deleted'
    : message.content || (message.attachmentUrl ? `📎 ${message.attachmentName || 'Attachment'}` : '');

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="w-full sm:max-w-xs bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl pb-[env(safe-area-inset-bottom)]"
        style={{ animation: 'action-sheet-up 0.18s ease-out' }}
        role="dialog"
        aria-label="Message actions"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 mb-1 w-10 h-1.5 rounded-full bg-white/20 sm:hidden" />
        <p className="px-5 pt-3 pb-3 text-xs font-medium text-zinc-400 line-clamp-2 border-b border-zinc-800">{preview}</p>
        {!deleted && <ActionButton icon={Reply} label="Reply" onClick={onReply} />}
        {!deleted && message.content && <ActionButton icon={Copy} label="Copy" onClick={onCopy} />}
        {!deleted && <ActionButton icon={CornerUpRight} label="Forward" onClick={onForward} />}
        <ActionButton icon={Trash2} label="Delete message" onClick={onDelete} danger />
        <style>{`@keyframes action-sheet-up { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
      </div>
    </div>
  );
}

// "Delete for me" vs "Delete for everyone" (the latter only for your own, not-yet-deleted messages).
export function DeleteMessageDialog({ canDeleteForEveryone, busy, onDeleteForMe, onDeleteForEveryone, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-6 bg-black/75" onClick={busy ? undefined : onClose} role="presentation">
      <div
        className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="delete-message-title" className="font-extrabold text-base text-white">Delete message?</p>
        <p className="mt-1 text-sm font-medium text-zinc-400">
          {canDeleteForEveryone
            ? 'Delete for everyone replaces it with "This message was deleted" for both of you. Delete for me only removes it from your side.'
            : 'This removes the message from your chat only. The other person will still see it.'}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {canDeleteForEveryone && (
            <button
              onClick={onDeleteForEveryone}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition disabled:opacity-50"
            >
              Delete for everyone
            </button>
          )}
          <button
            onClick={onDeleteForMe}
            disabled={busy}
            className={`w-full py-3 rounded-xl font-bold text-sm transition disabled:opacity-50 ${
              canDeleteForEveryone ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            Delete for me
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-zinc-400 hover:text-white transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
