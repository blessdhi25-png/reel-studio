'use client';

// Generic replacement for window.confirm() — styled to match the app's own
// dark zinc/amber theme instead of the browser's native (unstyled, and on
// mobile often ugly/inconsistent) confirm dialog. Not tied to logout
// specifically; any "are you sure?" action can reuse this.
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = true,
}) {
  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 px-4 pb-6 sm:pb-0"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-white mb-1.5">{title}</h2>
        {message && <p className="text-sm text-zinc-400 mb-5">{message}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-semibold hover:bg-zinc-700 transition-colors"
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
