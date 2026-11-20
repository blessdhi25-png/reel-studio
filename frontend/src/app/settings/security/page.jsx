'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useToast } from '@/context/ToastContext';
import ConfirmModal from '@/components/ConfirmModal';
import { timeAgo } from '@/lib/supportUi';
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
  const toast = useToast();
  const { ready, isAuthenticated, user, login } = useAuth();
  const [twoStep, setTwoStep] = usePref('twoStep');
  const [device, setDevice] = useState(null);
  const [devices, setDevices] = useState(null); // null = loading
  const [devicesError, setDevicesError] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => setDevice(describeDevice(navigator.userAgent)), []);

  const loadDevices = useCallback(() => {
    setDevicesError(false);
    api.getDevices().then((r) => setDevices(r.devices || [])).catch(() => { setDevicesError(true); setDevices([]); });
  }, []);
  useEffect(() => { if (ready && isAuthenticated) loadDevices(); }, [ready, isAuthenticated, loadDevices]);

  async function revokeOthers() {
    setRevoking(true);
    try {
      const { token } = await api.revokeOtherSessions();
      if (token && user) login(token, user); // keep this device signed in with a fresh token
      toast.success('Signed out of your other devices');
      setConfirmRevoke(false);
      loadDevices();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setRevoking(false);
    }
  }

  if (!ready || !isAuthenticated) return null;

  const others = (devices || []).filter((d) => !d.current);
  return (
    <SettingsPage title="Security & Permissions">
      <SettingsGroup
        title="Sign-in protection"
        footer="2-Step Verification saves your preference on this device. Verification codes aren't enforced at sign-in yet, so don't rely on it as your only protection."
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

      <SettingsGroup title="Security alerts">
        <SettingsRow href="/settings/help/security" icon="🚨" title="Security alerts" subtitle="New sign-ins, password and biometric changes" />
      </SettingsGroup>

      <SettingsGroup
        title="Your devices"
        footer="Built from your sign-ins in the last 90 days. Signing out of other devices ends every session except this one; they will need to log in again. Resetting a forgotten password does this automatically."
      >
        {devices === null ? (
          <SettingsRow icon="⏳" title="Loading devices…" chevron={false} />
        ) : devicesError ? (
          <SettingsRow onClick={loadDevices} icon="⚠️" title="Couldn't load your devices" subtitle="Tap to try again" />
        ) : (
          <>
            {!devices.some((d) => d.current) && (
              <SettingsRow icon={device?.icon || '💻'} title={device?.label || 'This device'} subtitle="This device · Active now" chevron={false} right={<CurrentPill />} />
            )}
            {devices.map((d) => (
              <SettingsRow
                key={d.device}
                icon={/Android|iOS/.test(d.device) ? '📱' : '💻'}
                title={d.device}
                subtitle={d.current ? `This device · Active now${d.location ? ` · ${d.location}` : ''}` : `Last active ${timeAgo(d.lastSeenAt)}${d.location ? ` · ${d.location}` : ''} · ${d.signIns} sign-in${d.signIns === 1 ? '' : 's'}`}
                chevron={false}
                right={d.current ? <CurrentPill /> : null}
              />
            ))}
            {others.length > 0 && <SettingsRow onClick={() => setConfirmRevoke(true)} icon="🚪" tone="amber" title="Sign out of other devices" subtitle={`${others.length} other device${others.length === 1 ? '' : 's'}`} />}
          </>
        )}
      </SettingsGroup>

      {confirmRevoke && (
        <ConfirmModal
          title="Sign out of other devices?"
          message="Every other browser or phone signed in to your account will be logged out. This device stays signed in."
          confirmLabel={revoking ? 'Signing out…' : 'Sign out'}
          confirmDisabled={revoking}
          onConfirm={revokeOthers}
          onCancel={() => setConfirmRevoke(false)}
        />
      )}
    </SettingsPage>
  );
}

function CurrentPill() {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans font-bold text-[10px] uppercase tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      Current
    </span>
  );
}
