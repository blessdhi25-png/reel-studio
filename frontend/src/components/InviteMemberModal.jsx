'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, RefreshCw, Share2, X } from 'lucide-react';
import SlideDrawer from '@/components/SlideDrawer';
import { api } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

/**
 * Invite-link sheet for a community (right-side slide-over). Any member can copy
 * or share the link; admins can also reset it, which invalidates the old one.
 */
export default function InviteMemberModal({ open, onClose, communityId, communityName }) {
  const toast = useToast();
  const [code, setCode] = useState(null);
  const [canReset, setCanReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !communityId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getCommunityInvite(communityId)
      .then((r) => {
        if (cancelled) return;
        setCode(r.code);
        setCanReset(!!r.canReset);
      })
      .catch((e) => !cancelled && setError(e?.message || "Couldn't load the invite link"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, communityId]);

  const url = code && typeof window !== 'undefined' ? `${window.location.origin}/communities/invite/${code}` : '';

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied');
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }, [url, toast]);

  const share = useCallback(async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: `Join ${communityName} on ClipPulse`, url });
    } catch {
      /* dismissed */
    }
  }, [copy, communityName, url]);

  async function reset() {
    if (!window.confirm('Reset the invite link? The current link will stop working.')) return;
    try {
      const r = await api.resetCommunityInvite(communityId);
      setCode(r.code);
      toast.success('New invite link created');
    } catch (e) {
      toast.error(e?.message || "Couldn't reset the link");
    }
  }

  return (
    <SlideDrawer open={open} onClose={onClose} label="Invite members">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-neutral-800">
        <h2 className="font-extrabold tracking-tight text-lg">Invite members</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center">
          <X className="w-4 h-4" strokeWidth={3} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300 leading-snug">
          Anyone with this link can join <span className="text-black dark:text-white">{communityName}</span>. Share it
          only with people you want in.
        </p>
        {loading && <p className="text-sm font-bold text-neutral-500">Loading…</p>}
        {error && <p className="text-sm font-bold text-red-500" role="alert">{error}</p>}
        {url && (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-3 py-3">
              <Link2 className="w-4 h-4 shrink-0 text-amber-600" />
              <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Invite link" className="min-w-0 flex-1 bg-transparent text-xs font-bold text-black dark:text-white outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={copy} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-sm font-extrabold">
                <Copy className="w-4 h-4" /> Copy link
              </button>
              <button type="button" onClick={share} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-extrabold">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
            {canReset && (
              <button type="button" onClick={reset} className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-extrabold text-red-600 dark:text-red-400 hover:underline">
                <RefreshCw className="w-3.5 h-3.5" /> Reset link
              </button>
            )}
          </>
        )}
      </div>
    </SlideDrawer>
  );
}
