'use client';

import { useEffect, useRef, useState } from 'react';

const CLOSE_MS = 300;
const DRAG_CLOSE_PX = 80;

/**
 * Shared right-side slide-over. Backdrop dims + blurs; the panel slides in from
 * the right edge. Closes via backdrop, Escape, or a rightward drag started on any
 * element marked `data-drag-handle`. Focus moves into the panel and body scroll
 * is locked while open. Children render inside a flex column panel.
 */
export default function SlideDrawer({ open, onClose, label, children }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const onPointerDown = (e) => {
    if (!e.target.closest('[data-drag-handle]') || e.target.closest('button,a')) return;
    dragStart.current = e.clientX;
    setDragging(true);
    panelRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (dragStart.current == null) return;
    setDragX(Math.max(0, e.clientX - dragStart.current));
  };
  const end = () => {
    if (dragStart.current == null) return;
    const close = dragX > DRAG_CLOSE_PX;
    dragStart.current = null;
    setDragging(false);
    setDragX(0);
    if (close) onClose();
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={dragging ? { transform: `translateX(${dragX}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-neutral-900 text-slate-900 dark:text-white border-l border-slate-200 dark:border-neutral-800 shadow-2xl font-sans outline-none flex flex-col pt-[env(safe-area-inset-top)] pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
          dragging ? '' : 'transform transition-transform duration-300 ease-in-out motion-reduce:transition-none'
        } ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {children}
      </div>
    </div>
  );
}
