'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Trash2, UserPlus, X } from 'lucide-react';
import SlideDrawer from '@/components/SlideDrawer';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { MAX_ACCOUNTS } from '@/lib/accounts';

function Avatar({ user }) {
  return (
    <span className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 font-extrabold text-amber-600">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        (user?.displayName || user?.username || '?')[0].toUpperCase()
      )}
    </span>
  );
}

/** Multi-account switcher as a right-side slide-over. Switching reloads into the chosen account. */
export default function AccountSwitcherModal({ open, onClose }) {
  const router = useRouter();
  const toast = useToast();
  const { user, accounts = [], switchAccount, forgetAccount } = useAuth();
  const [busyId, setBusyId] = useState(null);

  async function onSwitch(id) {
    if (id === user?.id || busyId) return;
    setBusyId(id);
    const res = await switchAccount(id);
    if (!res?.ok) {
      toast.error(res?.error || "Couldn't switch account");
      setBusyId(null);
    }
  }

  return (
    <SlideDrawer open={open} onClose={onClose} label="Switch account">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-neutral-800">
        <h2 className="font-extrabold tracking-tight text-lg">Switch account</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center">
          <X className="w-4 h-4" strokeWidth={3} />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-3 py-3">
        {accounts.map((a) => {
          const active = a.id === user?.id;
          return (
            <li key={a.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSwitch(a.id)}
                disabled={!!busyId}
                className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left disabled:opacity-60"
              >
                <Avatar user={a.user} />
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold tracking-tight truncate">{a.user?.displayName || a.user?.username}</span>
                  <span className="block text-xs font-bold text-neutral-500 truncate">@{a.user?.username}</span>
                </span>
                {busyId === a.id ? (
                  <span className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                ) : active ? (
                  <Check className="w-5 h-5 text-amber-600" strokeWidth={3.5} />
                ) : null}
              </button>
              {!active && (
                <button
                  type="button"
                  onClick={() => forgetAccount(a.id)}
                  aria-label={`Remove @${a.user?.username} from this device`}
                  className="w-9 h-9 rounded-full text-neutral-500 hover:text-red-500 flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-5 pt-3">
        <button
          type="button"
          disabled={accounts.length >= MAX_ACCOUNTS}
          onClick={() => {
            onClose();
            router.push('/login?add=1');
          }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold disabled:opacity-40"
        >
          <UserPlus className="w-4 h-4" strokeWidth={3} /> Add account
        </button>
        <p className="text-[11px] font-bold text-neutral-500 text-center mt-2">
          {accounts.length >= MAX_ACCOUNTS
            ? `You can keep up to ${MAX_ACCOUNTS} accounts on this device.`
            : 'Accounts stay signed in on this device only.'}
        </p>
      </div>
    </SlideDrawer>
  );
}
