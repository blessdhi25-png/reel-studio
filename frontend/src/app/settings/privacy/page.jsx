'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { SettingsGroup, SettingsPage } from '@/components/settings/SettingsUI';

// Private profile and the comment / DM audience filters live on the main
// Settings dashboard (app/settings/page.jsx). This route is the detail screen
// for blocked accounts, which needs a list rather than a toggle.
export default function BlockedAccountsPage() {
  const router = useRouter();
  const toast = useToast();
  const { ready, isAuthenticated } = useAuth();
  const [blocked, setBlocked] = useState(null); // null = loading
  const [loadFailed, setLoadFailed] = useState(false);
  const [unblockingId, setUnblockingId] = useState(null);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api
      .getBlockedUsers()
      .then((list) => !cancelled && setBlocked(list))
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setBlocked([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  async function unblock(user) {
    setUnblockingId(user.id);
    setBlocked((prev) => prev.filter((u) => u.id !== user.id));
    try {
      await api.unblockUser(user.id);
      toast.success(`Unblocked @${user.username}`);
    } catch (err) {
      setBlocked((prev) => [...prev, user]);
      toast.error(err.message || "Couldn't unblock — try again.");
    } finally {
      setUnblockingId(null);
    }
  }

  if (!ready || !isAuthenticated) return null;

  return (
    <SettingsPage title="Blocked Accounts">
      <p className="font-sans font-medium text-xs text-neutral-400 -mt-3 mb-5 px-1">
        Blocked accounts can't follow you, message you, comment on your videos, or find your profile.
      </p>

      {blocked === null ? (
        <div className="bg-neutral-900/90 rounded-2xl border border-neutral-800 overflow-hidden mb-5 divide-y divide-neutral-800 animate-pulse">
          <div className="h-16" />
          <div className="h-16" />
        </div>
      ) : loadFailed ? (
        <p className="font-sans font-bold text-sm text-red-400 px-1">Couldn't load your blocked accounts.</p>
      ) : blocked.length === 0 ? (
        <p className="font-sans font-bold text-sm text-neutral-500 px-1">You haven't blocked anyone.</p>
      ) : (
        <SettingsGroup>
          {blocked.map((user) => (
            <div key={user.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-sans font-bold text-base text-amber-500 overflow-hidden shrink-0">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.username?.[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-sans font-bold text-sm text-white truncate">{user.displayName || user.username}</p>
                <p className="font-sans font-medium text-xs text-neutral-400 truncate">@{user.username}</p>
              </div>
              <button
                type="button"
                onClick={() => unblock(user)}
                disabled={unblockingId === user.id}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-neutral-800 text-white font-sans font-bold text-xs hover:bg-neutral-700 transition-colors disabled:opacity-50"
              >
                Unblock
              </button>
            </div>
          ))}
        </SettingsGroup>
      )}
    </SettingsPage>
  );
}
