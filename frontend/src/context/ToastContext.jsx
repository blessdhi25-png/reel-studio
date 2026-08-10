'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

const VARIANTS = {
  info: {
    border: 'border-zinc-800',
    bg: 'bg-zinc-900',
    accent: 'bg-amber-500',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    ),
  },
  success: {
    border: 'border-zinc-800',
    bg: 'bg-zinc-900',
    accent: 'bg-emerald-500',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ),
  },
  error: {
    border: 'border-zinc-800',
    bg: 'bg-zinc-900',
    accent: 'bg-rose-500',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400 shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    ),
  },
};

const DEFAULT_DURATION_MS = 3200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // Plain incrementing counter beats Date.now()/Math.random() for React
  // list keys here — two toasts fired in the same tick (e.g. a batch
  // action producing several results at once) would collide on either of
  // those, silently dropping one from the render.
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message, { type = 'info', duration = DEFAULT_DURATION_MS } = {}) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  // toast.success('x') / toast.error('x') / toast.info('x') reads more
  // naturally at call sites than show('x', { type: 'success' }) everywhere,
  // while still funneling through the one show() implementation above.
  const toast = useCallback(
    (message, opts) => show(message, opts),
    [show]
  );
  toast.info = useCallback((message, opts) => show(message, { ...opts, type: 'info' }), [show]);
  toast.success = useCallback((message, opts) => show(message, { ...opts, type: 'success' }), [show]);
  toast.error = useCallback((message, opts) => show(message, { ...opts, type: 'error' }), [show]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 px-4 w-full max-w-sm pointer-events-none"
      // bottom-24 clears the bottom nav bar (h-24 gradient scrim + safe
      // area) rather than sitting on top of/behind it.
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }) {
  const v = VARIANTS[t.type] || VARIANTS.info;
  return (
    <div
      role="status"
      onClick={onDismiss}
      className={`pointer-events-auto w-full flex items-center gap-2.5 ${v.bg} border ${v.border} rounded-2xl pl-2 pr-3.5 py-3 shadow-2xl cursor-pointer animate-[toast-in_0.18s_ease-out]`}
    >
      <span className={`w-1 self-stretch rounded-full ${v.accent} shrink-0`} />
      {v.icon}
      <p className="font-body text-sm text-zinc-100 leading-snug">{t.message}</p>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be called within <ToastProvider>');
  }
  return ctx.toast;
}
