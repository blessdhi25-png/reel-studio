'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

// Generic replacement for window.confirm() — styled to match the app's own
// dark theme instead of the browser's native dialog. Used for log out, deleting
// posts / stories / collections, etc.
//
// Layout: a full-screen dimmed + blurred backdrop (z-[100]: above the BottomNav and any floating
// icons; it also swallows taps and locks page scroll) with the card centred. Light card on mobile,
// dark card on desktop (lg:).
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = true,
  confirmDisabled = false,
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

  const Icon = danger ? Trash2 : AlertTriangle;
  return (
    // z-[100] sits above the BottomNav (z-50), floating chat button and any card chrome.
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white text-neutral-900 rounded-2xl p-6 shadow-2xl border border-neutral-200 text-center lg:bg-neutral-900 lg:text-white lg:border-neutral-800"
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
          }`}
        >
          <Icon className="w-6 h-6" strokeWidth={2.25} />
        </div>
        <h2 id="confirm-modal-title" className="font-extrabold text-lg tracking-tight mb-1.5">
          {title}
        </h2>
        {message && <p className="text-xs font-medium text-neutral-500 leading-relaxed mb-6">{message}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={confirmDisabled}
            className="py-3 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs transition lg:bg-neutral-800 lg:hover:bg-neutral-700 lg:text-neutral-200 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={`py-3 rounded-xl font-extrabold text-xs shadow-sm transition disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-amber-500 hover:bg-amber-600 text-black'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
