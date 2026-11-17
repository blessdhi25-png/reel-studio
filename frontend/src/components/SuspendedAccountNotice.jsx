'use client';

import { useEffect, useRef } from 'react';
import { ShieldOff } from 'lucide-react';

// Full-screen, non-dismissible lockout shown instead of the whole app when the signed-in
// account is suspended or banned (see AppShell / AuthContext). There is deliberately no close
// button, no backdrop click and no Escape handling — signing out is the only way forward.
export default function SuspendedAccountNotice({ code = 'ACCOUNT_SUSPENDED', reason, onLogout }) {
  const buttonRef = useRef(null);
  const banned = code === 'ACCOUNT_BANNED';

  useEffect(() => {
    buttonRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function handleLogout() {
    onLogout?.();
    // Full load: drops sockets, cached feeds and any other state keyed to the locked account.
    window.location.assign('/login');
  }

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black text-white flex items-center justify-center px-6 overflow-y-auto"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="suspended-title"
      aria-describedby="suspended-desc"
    >
      <div className="w-full max-w-md text-center py-10">
        <div className="mx-auto mb-6 w-16 h-16 rounded-full border-2 border-red-500 text-red-500 flex items-center justify-center">
          <ShieldOff size={30} aria-hidden="true" />
        </div>
        <h1 id="suspended-title" className="text-3xl font-extrabold tracking-tight">
          {banned ? 'Access Revoked' : 'Account Suspended'}
        </h1>
        <p id="suspended-desc" className="mt-4 text-base leading-relaxed text-zinc-300">
          Your account has been {banned ? 'banned' : 'suspended'} due to a violation of our community guidelines. You can no
          longer access or use ClipPulse.
        </p>
        {reason && (
          <p className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400 text-left">
            <span className="block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Reason</span>
            {reason}
          </p>
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={handleLogout}
          className="mt-8 w-full rounded-xl bg-white text-black font-bold text-sm py-3.5 hover:bg-zinc-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
