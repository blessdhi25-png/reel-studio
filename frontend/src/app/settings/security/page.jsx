'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { usePref } from '@/lib/settingsPrefs';
import { SettingsGroup, SettingsPage, SettingsRow, ToggleRow } from '@/components/settings/SettingsUI';

// Best-effort "Browser on OS" label from the user agent. Only used to name the
// current device, so a coarse match is enough.
function describeDevice(ua) {
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const mobile = /iPhone|Android.*Mobile|iPod/.test(ua);
  return { label: `${browser} on ${os}`, icon: mobile ? '📱' : '💻' };
}

export default function SecurityPage() {
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const [twoStep, setTwoStep] = usePref('twoStep');
  const [device, setDevice] = useState(null);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => setDevice(describeDevice(navigator.userAgent)), []);

  if (!ready || !isAuthenticated) return null;

  return (
    <SettingsPage title="Security & Permissions">
      <SettingsGroup
        title="Sign-in protection"
        footer="This saves your preference on this device. Verification codes aren't enforced at sign-in yet, so don't rely on it as your only protection."
      >
        <ToggleRow
          icon="🔐"
          title="2-Step Verification"
          subtitle={twoStep ? 'On' : 'Off'}
          checked={twoStep}
          onChange={setTwoStep}
        />
        <SettingsRow href="/settings/change-password" icon="🔑" title="Change Password" />
      </SettingsGroup>

      <SettingsGroup
        title="Active session devices"
        footer="Only this device can be listed for now. Changing your password signs out your other sessions."
      >
        <SettingsRow
          icon={device?.icon || '💻'}
          title={device?.label || 'This device'}
          subtitle="This device · Active now"
          chevron={false}
          right={
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans font-bold text-[10px] uppercase tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Current
            </span>
          }
        />
      </SettingsGroup>
    </SettingsPage>
  );
}
