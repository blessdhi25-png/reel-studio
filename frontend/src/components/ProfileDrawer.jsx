'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Copy, Share2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

const CLOSE_MS = 250;
const DRAG_CLOSE_PX = 90;

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Bottom-sheet menu opened from the hamburger (≡) on the signed-in user's own
 * profile. Four destinations: Wallet, Studio, QR / share, Settings & Privacy.
 * The QR view lives inside the sheet (it's a share action, not a page).
 */
export default function ProfileDrawer({ open, onClose, user }) {
  const toast = useToast();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false); // drives the slide transition
  const [view, setView] = useState('menu'); // 'menu' | 'qr'
  const [balance, setBalance] = useState(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef(null);
  const sheetRef = useRef(null);

  // Mount → next frame → slide in; slide out → unmount.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setView('menu');
      setQrFailed(false);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Wallet subtitle shows the real running total; failure just leaves the generic label.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .getEarnings()
      .then((d) => !cancelled && typeof d?.totalCents === 'number' && setBalance(d.totalCents))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Escape to close, scroll lock, move focus into the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const profileUrl =
    typeof window !== 'undefined' && user?.id ? `${window.location.origin}/profile/${user.id}` : '';

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast.success('Profile link copied');
    } catch {
      toast.error("Couldn't copy — long-press the link to copy it.");
    }
  }, [profileUrl, toast]);

  const shareLink = useCallback(async () => {
    if (!navigator.share) return copyLink();
    try {
      await navigator.share({ title: `@${user.username} on ClipPulse`, url: profileUrl });
    } catch {
      // User dismissed the share sheet — not an error.
    }
  }, [copyLink, profileUrl, user]);

  // Drag-down-to-dismiss on the handle area.
  const onPointerDown = (e) => {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (dragStart.current == null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    const shouldClose = dragY > DRAG_CLOSE_PX;
    dragStart.current = null;
    setDragY(0);
    if (shouldClose) onClose();
  };

  if (!mounted) return null;

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(profileUrl)}`;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/70 transition-opacity duration-300 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        style={{ transform: shown ? `translateY(${dragY}px)` : 'translateY(100%)' }}
        className={`absolute inset-x-0 bottom-0 max-w-md mx-auto bg-neutral-900 border-t border-neutral-800 rounded-t-3xl p-5 z-50 shadow-2xl font-sans outline-none pb-[max(1.25rem,env(safe-area-inset-bottom))] ${
          dragStart.current == null ? 'transition-transform duration-300 ease-out motion-reduce:transition-none' : ''
        }`}
      >
        <div
          className="-mt-2 mb-3 pt-2 pb-3 touch-none cursor-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="w-10 h-1 rounded-full bg-neutral-700 mx-auto" />
        </div>

        {view === 'menu' ? (
          <nav aria-label="Profile actions" className="space-y-1">
            <DrawerLink href="/earnings" icon="💳" title="ClipPulse Wallet & Creator Balance" onClick={onClose}
              subtitle={balance != null ? `${formatCents(balance)} earned · Tips & earnings` : 'Earnings & tips breakdown'} />
            <DrawerLink href="/studio" icon="📊" title="ClipPulse Studio" onClick={onClose}
              subtitle="Analytics & video performance" />
            <DrawerRow icon="📱" title="My QR Code / Share Profile" subtitle="Dynamic link to your profile"
              onClick={() => setView('qr')} />
            <DrawerLink href="/settings" icon="⚙️" title="Settings and Privacy" onClick={onClose}
              subtitle="Account, privacy, wellbeing" />
          </nav>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setView('menu')}
              className="inline-flex items-center gap-0.5 -ml-1 mb-3 text-sm font-bold text-amber-500 hover:text-amber-400"
            >
              <ChevronLeft size={18} aria-hidden="true" /> Back
            </button>
            <h2 className="font-bold text-lg text-white text-center">My QR Code</h2>
            <p className="font-medium text-xs text-neutral-400 text-center mt-1 mb-4">
              Anyone who scans this opens your profile.
            </p>

            <div className="mx-auto w-[240px] h-[240px] bg-white rounded-2xl p-3 flex items-center justify-center">
              {qrFailed ? (
                <p className="text-xs font-bold text-neutral-600 text-center px-4">
                  Couldn't load the QR code. You can still copy or share the link below.
                </p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrSrc} alt={`QR code for @${user?.username}'s profile`} width={216} height={216}
                  onError={() => setQrFailed(true)} />
              )}
            </div>

            <p className="font-mono text-[11px] text-neutral-500 break-all text-center mt-4">{profileUrl}</p>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button type="button" onClick={copyLink}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-neutral-800 text-white text-sm font-bold hover:bg-neutral-700 transition-colors">
                <Copy size={16} aria-hidden="true" /> Copy link
              </button>
              <button type="button" onClick={shareLink}
                className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition-colors">
                <Share2 size={16} aria-hidden="true" /> Share
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ITEM_CLASS =
  'w-full flex items-center gap-3 px-2 py-3 rounded-2xl text-left hover:bg-neutral-800/70 active:bg-neutral-800 transition-colors';

function ItemBody({ icon, title, subtitle }) {
  return (
    <>
      <span aria-hidden="true" className="w-11 h-11 shrink-0 rounded-2xl bg-neutral-800 flex items-center justify-center text-xl">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm text-white">{title}</span>
        <span className="block font-medium text-xs text-neutral-400 mt-0.5 truncate">{subtitle}</span>
      </span>
      <ChevronRight size={18} className="text-neutral-600 shrink-0" aria-hidden="true" />
    </>
  );
}

function DrawerLink({ href, onClick, ...body }) {
  return (
    <Link href={href} onClick={onClick} className={ITEM_CLASS}>
      <ItemBody {...body} />
    </Link>
  );
}

function DrawerRow({ onClick, ...body }) {
  return (
    <button type="button" onClick={onClick} className={ITEM_CLASS}>
      <ItemBody {...body} />
    </button>
  );
}
