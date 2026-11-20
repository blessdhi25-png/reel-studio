'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Camera, MapPin, Mic, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { usePref } from '@/lib/settingsPrefs';
import ConfirmModal from '@/components/ConfirmModal';
import { SettingsGroup, SettingsPage, SettingsRow, ToggleRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;
const LABEL = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not asked yet', unsupported: 'Not supported' };
const BTN = 'shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black font-sans font-bold text-xs disabled:opacity-40';

async function query(name) {
  try {
    if (name === 'notifications' && typeof Notification !== 'undefined') return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    const r = await navigator.permissions.query({ name });
    return r.state;
  } catch {
    return 'unsupported';
  }
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Phone numbers are reduced to digits (keeping a leading +) and emails lower-cased before hashing, so the
// same person hashes the same way whichever device synced them. Nothing readable leaves the browser.
const normalisePhone = (v) => { const t = String(v).trim(); const d = t.replace(/\D/g, ''); return d.length >= 7 ? (t.startsWith('+') ? `+${d}` : d) : null; };
const normaliseEmail = (v) => { const t = String(v).trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null; };

export default function ContactsLocationPage() {
  const ok = useRequireAuth();
  const toast = useToast();
  const [perm, setPerm] = useState({});
  const [contactsEnabled, setContactsEnabled] = usePref('contactsEnabled');
  const [facebookEnabled, setFacebookEnabled] = usePref('facebookEnabled');
  const [counts, setCounts] = useState({ contacts: 0, facebook: 0 });
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null); // 'contacts' | 'facebook'

  const refreshPerms = useCallback(async () => {
    const names = ['geolocation', 'camera', 'microphone', 'notifications'];
    const results = await Promise.all(names.map(query));
    setPerm(Object.fromEntries(names.map((n, i) => [n, results[i]])));
  }, []);
  const refreshCounts = useCallback(() => { api.getSyncedContacts().then(setCounts).catch(() => {}); }, []);
  useEffect(() => { refreshPerms(); refreshCounts(); }, [refreshPerms, refreshCounts]);

  async function requestPermission(name) {
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
    refreshPerms();
  }

  async function syncContacts() {
    if (!('contacts' in navigator) || !navigator.contacts?.select) {
      toast.error('Your browser can’t share contacts with websites. Try the ClipPulse app on Android.');
      return;
    }
    setBusy('sync');
    try {
      const picked = await navigator.contacts.select(['tel', 'email'], { multiple: true });
      const values = picked.flatMap((c) => [...(c.tel || []).map(normalisePhone), ...(c.email || []).map(normaliseEmail)]).filter(Boolean);
      if (!values.length) return toast.error('No phone numbers or emails were selected.');
      const hashes = [...new Set(await Promise.all(values.slice(0, 500).map(sha256)))];
      const r = await api.syncContacts(hashes);
      setCounts((c) => ({ ...c, contacts: r.contacts }));
      toast.success(`Synced ${hashes.length} contact${hashes.length === 1 ? '' : 's'}`);
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.name !== 'InvalidStateError') toast.error(friendlyError(err)); // the person closing the picker isn't an error
    } finally {
      setBusy('');
    }
  }

  async function removeSynced(source) {
    setBusy(`remove-${source}`);
    try {
      await api.removeSyncedContacts(source);
      setCounts((c) => ({ ...c, [source]: 0 }));
      toast.success(source === 'facebook' ? 'Facebook friends removed' : 'Synced contacts removed');
      setConfirm(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy('');
    }
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
      <SettingsGroup
        title="Contacts"
        footer="Only contacts you pick are used, and each phone number or email is scrambled (hashed) on your device before it is sent. Contact picking works in Chrome on Android; other browsers can’t share contacts with websites."
      >
        <ToggleRow icon={ic(Users)} title="Contacts" subtitle="Find people you know on ClipPulse" checked={contactsEnabled} onChange={setContactsEnabled} />
        {contactsEnabled && (
          <>
            <SettingsRow
              icon={ic(Users)}
              title="Sync contacts"
              subtitle={counts.contacts ? `${counts.contacts} synced` : 'Choose contacts to sync'}
              chevron={false}
              right={<button type="button" onClick={syncContacts} disabled={busy === 'sync'} className={BTN}>{busy === 'sync' ? 'Syncing…' : 'Sync'}</button>}
            />
            <SettingsRow
              onClick={counts.contacts ? () => setConfirm('contacts') : undefined}
              icon={ic(Trash2)}
              tone="amber"
              title="Remove previously synced contacts"
              subtitle={counts.contacts ? `Deletes ${counts.contacts} synced` : 'Nothing synced'}
            />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Facebook friends"
        footer="Linking a Facebook account isn’t available in ClipPulse yet, so there are no Facebook friends to sync. This switch is saved for when it launches."
      >
        <ToggleRow icon={ic(Users)} title="Facebook friends" subtitle="Find Facebook friends on ClipPulse" checked={facebookEnabled} onChange={setFacebookEnabled} />
        {facebookEnabled && (
          <>
            <SettingsRow
              icon={ic(Users)}
              title="Connect Facebook"
              subtitle="Not connected"
              chevron={false}
              right={<button type="button" onClick={() => toast.error('Facebook linking isn’t available yet.')} className={BTN}>Connect</button>}
            />
            <SettingsRow icon={ic(Users)} title="Sync Facebook friends" subtitle="Connect Facebook first" chevron={false} right={<button type="button" disabled className={BTN}>Sync</button>} />
            <SettingsRow
              onClick={counts.facebook ? () => setConfirm('facebook') : undefined}
              icon={ic(Trash2)}
              tone="amber"
              title="Remove previously synced Facebook friends"
              subtitle={counts.facebook ? `Deletes ${counts.facebook} synced` : 'Nothing synced'}
            />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="Device permissions" footer="Permissions are controlled by your browser or device; if one is blocked, change it from the site settings (the lock icon in the address bar).">
        {rows.map(([name, Icon, title, sub]) => {
          const s = perm[name];
          return (
            <SettingsRow
              key={name}
              icon={ic(Icon)}
              title={title}
              subtitle={`${s ? LABEL[s] || s : 'Checking…'} · ${sub}`}
              chevron={false}
              right={s === 'prompt' ? <button type="button" onClick={() => requestPermission(name)} className={BTN}>Allow</button> : null}
            />
          );
        })}
      </SettingsGroup>

      {confirm && (
        <ConfirmModal
          title={confirm === 'facebook' ? 'Remove synced Facebook friends?' : 'Remove synced contacts?'}
          message="They’ll be deleted from ClipPulse. You can sync again any time."
          confirmLabel={busy.startsWith('remove') ? 'Removing…' : 'Remove'}
          confirmDisabled={busy.startsWith('remove')}
          onConfirm={() => removeSynced(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </SettingsPage>
  );
}
