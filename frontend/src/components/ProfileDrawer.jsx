'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Copy, Share2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import SlideDrawer from '@/components/SlideDrawer';

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

const TITLES = { menu: 'Menu', share: 'Share profile', settings: 'Settings' };

/**
 * Right-side slide-over for the signed-in user's own profile. One panel, three
 * views, opened from the profile's top-right dropdown:
 *   'menu'     – Wallet, Studio, Share, Settings & Privacy
 *   'share'    – QR code + copy / native share
 *   'settings' – quick links into the settings pages
 * Slides in from the right edge (translate-x), closes via backdrop, Escape, the
 * close button, or a swipe to the right on the header.
 */
export default function ProfileDrawer({ open, onClose, user, initialView = 'menu' }) {
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [balance, setBalance] = useState(null);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setView(initialView);
      setQrFailed(false);
    }
  }, [open, initialView]);

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

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(profileUrl)}`;

  return (
    <SlideDrawer open={open} onClose={onClose} label={TITLES[view]}>
        <div
          data-drag-handle
          className="flex items-center justify-between px-5 py-4 touch-pan-y cursor-grab border-b border-slate-100 dark:border-neutral-800"
        >
          {view === 'menu' ? (
            <h2 className="font-extrabold tracking-tight text-lg">{TITLES.menu}</h2>
          ) : (
            <button
              type="button"
              onClick={() => setView('menu')}
              className="inline-flex items-center gap-0.5 -ml-1 text-sm font-extrabold text-amber-600 dark:text-amber-500"
            >
              <ChevronLeft size={18} aria-hidden="true" /> Menu
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-700 dark:text-neutral-300"
          >
            <X size={18} strokeWidth={3} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {view === 'menu' && (
            <nav aria-label="Profile actions" className="space-y-1">
              <DrawerLink href="/earnings" icon="💳" title="ClipPulse Wallet & Creator Balance" onClick={onClose}
                subtitle={balance != null ? `${formatCents(balance)} earned · Tips & earnings` : 'Earnings & tips breakdown'} />
              <DrawerRow icon="📊" title="ClipPulse Studio" subtitle="Analytics & video performance"
                onClick={() => {
                  onClose();
                  router.push('/studio');
                }} />
              <DrawerRow icon="📱" title="My QR Code / Share Profile" subtitle="Dynamic link to your profile"
                onClick={() => setView('share')} />
              <DrawerRow icon="⚙️" title="Settings and Privacy" subtitle="Account, privacy, wellbeing"
                onClick={() => setView('settings')} />
              <Link
                href="/menu"
                onClick={onClose}
                className="block pt-3 text-center text-xs font-extrabold text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                More from ClipPulse
              </Link>
            </nav>
          )}

          {view === 'settings' && (
            <nav aria-label="Settings" className="space-y-1">
              <DrawerLink href="/settings/account" icon="👤" title="Account Details" onClick={onClose}
                subtitle="Email, phone, bio, links & switch account" />
              <DrawerLink href="/settings/security" icon="🔒" title="Security" onClick={onClose}
                subtitle="Password & sign-in protection" />
              <DrawerLink href="/settings/privacy" icon="🚫" title="Privacy & Blocked Accounts" onClick={onClose}
                subtitle="Control who can see and contact you" />
              <DrawerLink href="/settings/wellbeing" icon="🌿" title="Digital Wellbeing" onClick={onClose}
                subtitle="Screen time and breaks" />
              <DrawerLink href="/settings" icon="⚙️" title="All settings" onClick={onClose}
                subtitle="Notifications, appearance, legal & log out" />
            </nav>
          )}

          {view === 'share' && (
            <div>
              <h2 className="font-extrabold tracking-tight text-lg text-center">My QR Code</h2>
              <p className="font-semibold text-xs text-slate-500 dark:text-neutral-400 text-center mt-1 mb-4">
                Anyone who scans this opens your profile.
              </p>

              <div className="mx-auto w-[240px] h-[240px] bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-center">
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

              <p className="font-mono text-[11px] text-slate-500 dark:text-neutral-500 break-all text-center mt-4">{profileUrl}</p>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button type="button" onClick={copyLink}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white text-sm font-extrabold hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors">
                  <Copy size={16} aria-hidden="true" /> Copy link
                </button>
                <button type="button" onClick={shareLink}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-500 text-black text-sm font-extrabold hover:bg-amber-400 transition-colors">
                  <Share2 size={16} aria-hidden="true" /> Share
                </button>
              </div>
            </div>
          )}
        </div>
    </SlideDrawer>
  );
}

const ITEM_CLASS =
  'w-full flex items-center gap-3 px-2 py-3 rounded-2xl text-left hover:bg-slate-100 dark:hover:bg-neutral-800/70 active:bg-slate-200 dark:active:bg-neutral-800 transition-colors';

function ItemBody({ icon, title, subtitle }) {
  return (
    <>
      <span aria-hidden="true" className="w-11 h-11 shrink-0 rounded-2xl bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-xl">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-extrabold tracking-tight text-sm text-slate-900 dark:text-white">{title}</span>
        <span className="block font-semibold text-xs text-slate-500 dark:text-neutral-400 mt-0.5 truncate">{subtitle}</span>
      </span>
      <ChevronRight size={18} className="text-slate-400 dark:text-neutral-600 shrink-0" aria-hidden="true" />
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
