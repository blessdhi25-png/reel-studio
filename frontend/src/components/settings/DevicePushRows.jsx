'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { friendlyError } from '@/lib/friendlyError';
import { disablePush, enablePush, getPushState, sendTestPush } from '@/lib/push';
import { SettingsRow, ToggleRow } from '@/components/settings/SettingsUI';

const BTN = 'shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black font-sans font-bold text-xs disabled:opacity-40';
const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

// "Device / Push notifications": permission + subscription for THIS browser/device, a test action, and a clear
// explanation when the browser or OS has the permission blocked. `onChange` lets the page refresh its status rows.
export default function DevicePushRows({ onChange }) {
  const toast = useToast();
  const [st, setSt] = useState(null); // { supported, reason, permission, subscribed }
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => { setSt(await getPushState()); onChange?.(); }, [onChange]);
  useEffect(() => {
    refresh();
    const on = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', on); // coming back from the browser's site settings
    window.addEventListener('focus', refresh);
    return () => { document.removeEventListener('visibilitychange', on); window.removeEventListener('focus', refresh); };
  }, [refresh]);

  async function toggle(next) {
    setBusy('toggle');
    try {
      if (next) {
        await enablePush();
        toast.success('Device notifications are on');
      } else {
        await disablePush();
        toast.success('Device notifications are off');
      }
    } catch (err) {
      if (err?.code === 'blocked') toast.error('Notifications are blocked. Allow them in your browser or phone settings, then try again.');
      else if (err?.code === 'dismissed') toast.info?.('Permission wasn’t granted.');
      else if (err?.code === 'ios-install') toast.error('On iPhone, add ClipPulse to your Home Screen first, then turn this on.');
      else toast.error(err?.code === 'not-configured' ? err.message : friendlyError(err));
    } finally {
      setBusy('');
      refresh();
    }
  }

  async function test() {
    setBusy('test');
    try {
      await sendTestPush();
      toast.success('Test sent — look for it in your notification tray.');
    } catch (err) {
      toast.error(err?.status === 404 ? 'No device received it. Turn Device notifications off and on again.' : friendlyError(err));
    } finally {
      setBusy('');
    }
  }

  if (!st) return <SettingsRow icon={ic(Bell)} title="Device / Push notifications" subtitle="Checking…" chevron={false} />;

  if (!st.supported) {
    return (
      <SettingsRow
        icon={ic(Bell)}
        title="Device / Push notifications"
        subtitle={st.reason === 'ios-install'
          ? 'On iPhone, add ClipPulse to your Home Screen (Share → Add to Home Screen) to receive push notifications.'
          : 'This browser can’t receive push notifications. Try Chrome, Edge or Firefox, or the ClipPulse app.'}
        chevron={false}
      />
    );
  }

  const blocked = st.permission === 'denied';
  return (
    <>
      <ToggleRow
        icon={ic(Bell)}
        title="Device / Push notifications"
        subtitle={blocked
          ? 'Blocked — allow notifications for this site in your browser or phone settings (tap the lock icon in the address bar), then come back.'
          : st.subscribed
          ? 'On — messages, calls, live invites and security alerts reach this device even when the app is closed'
          : 'Off — turn on to get alerts outside the app'}
        checked={st.subscribed}
        onChange={toggle}
        disabled={blocked || busy === 'toggle'}
      />
      {st.subscribed && (
        <SettingsRow
          icon={ic(BellRing)}
          title="Send Test Notification"
          subtitle="Sends a real notification to this device’s system tray"
          chevron={false}
          right={<button type="button" onClick={test} disabled={busy === 'test'} className={BTN}>{busy === 'test' ? 'Sending…' : 'Send'}</button>}
        />
      )}
    </>
  );
}
