'use client';

import { useEffect, useRef } from 'react';

// Generic replacement for window.confirm() — styled to match the app's own
// dark theme instead of the browser's native dialog. Used for log out, deleting
// posts / stories / collections, etc.
//
// Layout: a full-screen dimmed + blurred backdrop (which also swallows taps and
// locks page scroll) with the card floating ABOVE the fixed BottomNav — 7rem plus
// the device's home-indicator inset from the bottom edge — so the nav bar can never
// cover the buttons. On sm+ screens the card is centred instead.
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = true,
}) {
  const cancelRef = useRef(null);
  // Callers pass inline handlers; keep the latest in a ref so the effect below runs once on mount
  // (re-running it would re-steal focus on every parent render).
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancelRef.current?.();
    document.addEventListener('keydown', onKey);
    // Lock background scrolling while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    // z-[60] sits above the BottomNav (z-50), so the backdrop dims and blocks the nav too.
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="fixed inset-x-4 bottom-28 bottom-[calc(7rem+env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 mx-auto max-w-sm bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-2xl rounded-2xl p-5"
      >
        <h2 id="confirm-modal-title" className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white mb-1.5">
          {title}
        </h2>
        {message && <p className="text-sm font-medium text-slate-600 dark:text-neutral-400 mb-5">{message}</p>}
        <div className="flex gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              danger
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-amber-500 text-black hover:bg-amber-400'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
