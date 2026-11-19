'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Camera, MapPin, Mic } from 'lucide-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;
const LABEL = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not asked yet', unsupported: 'Not supported' };

async function query(name) {
  try {
    if (name === 'notifications' && typeof Notification !== 'undefined') return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    const r = await navigator.permissions.query({ name });
    return r.state;
  } catch {
    return 'unsupported';
  }
}

export default function ContactsLocationPage() {
  const ok = useRequireAuth();
  const toast = useToast();
  const [state, setState] = useState({});

  const refresh = useCallback(async () => {
    const names = ['geolocation', 'camera', 'microphone', 'notifications'];
    const results = await Promise.all(names.map(query));
    setState(Object.fromEntries(names.map((n, i) => [n, results[i]])));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function request(name) {
    try {
      if (name === 'geolocation') await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000 }));
      else if (name === 'notifications') await Notification.requestPermission();
      else {
        const stream = await navigator.mediaDevices.getUserMedia(name === 'camera' ? { video: true } : { audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      toast.error('Permission wasn’t granted. You can change it in your browser’s site settings.');
    }
    refresh();
  }

  const rows = [
    ['geolocation', MapPin, 'Location', 'Used for nearby content and showing where you signed in'],
    ['camera', Camera, 'Camera', 'Needed to record videos, go live and make video calls'],
    ['microphone', Mic, 'Microphone', 'Needed for sound, live streams and calls'],
    ['notifications', Bell, 'Notifications', 'Alerts for messages, calls and activity'],
  ];

  if (!ok) return null;
  return (
    <SettingsPage title="Contacts and location">
      <SettingsGroup footer="ClipPulse doesn’t read your phone contacts. Permissions are controlled by your browser or device; if one is blocked, change it from the site settings (the lock icon in the address bar).">
        {rows.map(([name, Icon, title, sub]) => {
          const s = state[name];
          return (
            <SettingsRow
              key={name}
              icon={ic(Icon)}
              title={title}
              subtitle={`${s ? LABEL[s] || s : 'Checking…'} · ${sub}`}
              chevron={false}
              right={s === 'prompt' ? (
                <button type="button" onClick={() => request(name)} className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black font-sans font-bold text-xs">Allow</button>
              ) : null}
            />
          );
        })}
      </SettingsGroup>
    </SettingsPage>
  );
}
