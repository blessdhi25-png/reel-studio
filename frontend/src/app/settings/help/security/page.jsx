'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, LogIn, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { timeAgo } from '@/lib/supportUi';
import { SettingsPage } from '@/components/settings/SettingsUI';

const METHODS = { password: 'Password', google: 'Google', biometric: 'Biometric' };

function describe(a) {
  switch (a.kind) {
    case 'login':
      return {
        Icon: a.newDevice ? ShieldAlert : LogIn,
        warn: a.newDevice,
        title: a.newDevice ? 'New device signed in' : 'Signed in',
        detail: [a.device, a.location, METHODS[a.method]].filter(Boolean).join(' · '),
      };
    case 'password_changed':
      return { Icon: KeyRound, title: 'Password changed', detail: 'If this wasn’t you, reset your password and sign out of other devices.' };
    case 'sessions_revoked':
      return { Icon: ShieldAlert, title: 'Signed out of other devices' };
    case 'biometric_enabled':
      return { Icon: Fingerprint, title: 'Biometric lock turned on' };
    case 'biometric_disabled':
      return { Icon: Fingerprint, warn: true, title: 'Biometric lock turned off' };
    default:
      return { Icon: ShieldAlert, title: 'Account activity' };
  }
}

export default function SecurityAlertsPage() {
  const ok = useRequireAuth();
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ok) return;
    api.getSecurityAlerts().then((r) => setAlerts(r.alerts || [])).catch((e) => { setError(friendlyError(e)); setAlerts([]); });
  }, [ok]);

  if (!ok) return null;
  return (
    <SettingsPage title="Security alerts" backHref="/settings/help" backLabel="Help Centre">
      <p className="font-sans text-sm text-slate-500 dark:text-neutral-400 mb-4">Sign-ins and security changes from the last 90 days. If something isn’t you, change your password right away.</p>
      {alerts === null ? (
        <p className="py-10 text-center font-sans text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="py-10 text-center font-sans text-sm text-rose-500">{error}</p>
      ) : alerts.length === 0 ? (
        <p className="py-10 text-center font-sans text-sm text-slate-500 dark:text-neutral-400">No recent security activity.</p>
      ) : (
        <ul className="rounded-2xl bg-white dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 divide-y divide-slate-100 dark:divide-neutral-800 overflow-hidden">
          {alerts.map((a) => {
            const d = describe(a);
            return (
              <li key={`${a.kind}-${a.id}`} className="flex items-start gap-3 px-4 py-3.5">
                <span className={`mt-0.5 w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${d.warn ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-300'}`}>
                  <d.Icon size={18} strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-sans font-bold text-[15px] text-slate-900 dark:text-white">{d.title}</p>
                  {d.detail && <p className="font-sans text-xs text-slate-500 dark:text-neutral-400 mt-0.5">{d.detail}</p>}
                </div>
                <span className="shrink-0 font-sans text-xs text-slate-400 dark:text-neutral-500">{timeAgo(a.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsPage>
  );
}
