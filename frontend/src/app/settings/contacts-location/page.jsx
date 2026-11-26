'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, MapPin, Mic, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { usePref } from '@/lib/settingsPrefs';
import { usePermissions } from '@/lib/usePermissions';
import ConfirmModal from '@/components/ConfirmModal';
import DevicePushRows from '@/components/settings/DevicePushRows';
import FacebookFriends from '@/components/settings/FacebookFriends';
import { SettingsGroup, SettingsPage, SettingsRow, ToggleRow } from '@/components/settings/SettingsUI';

const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;
const LABEL = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not asked yet', unsupported: 'Not supported' };
const FB_RESULT = {
  linked: ['success', 'Facebook linked'],
  linked_no_friends: ['info', 'Facebook linked, but Facebook didn’t share a friends list. Friends only appear if they also use ClipPulse and you granted the friends permission.'],
  denied: ['error', 'Facebook linking was cancelled.'],
  already_linked: ['error', 'That Facebook account is already linked to another ClipPulse account.'],
  state_invalid: ['error', 'The Facebook sign-in expired. Please try again.'],
  not_configured: ['error', 'Facebook linking isn’t set up on this server yet.'],
  schema_outdated: ['error', 'The server database is out of date. The site owner needs to apply the latest migrations.'],
  token_failed: ['error', 'Facebook rejected the sign-in. Please try again.'],
  profile_failed: ['error', 'We couldn’t read your Facebook profile.'],
  failed: ['error', 'Facebook linking failed. Please try again.'],
};
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null);
const BTN = 'shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black font-sans font-bold text-xs disabled:opacity-40';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Phone numbers are reduced to digits (keeping a leading +) and emails lower-cased before hashing, so the
// same person hashes the same way whichever device synced them. Nothing readable leaves the browser.
const normalisePhone = (v) => { const t = String(v).trim(); const d = t.replace(/\D/g, ''); return d.length >= 7 ? (t.startsWith('+') ? `+${d}` : d) : null; };
const normaliseEmail = (v) => { const t = String(v).trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null; };

function ContactsLocationInner() {
  const ok = useRequireAuth();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state: perm, request: requestPermission, issues: permIssues, pending: permPending } = usePermissions();
  const [fb, setFb] = useState(null); // /auth/facebook/status
  const [fbKey, setFbKey] = useState(0); // bumps to reload the friends list
  const [contactsEnabled, setContactsEnabled] = usePref('contactsEnabled');
  const [facebookEnabled, setFacebookEnabled] = usePref('facebookEnabled');
  const [counts, setCounts] = useState({ contacts: 0, facebook: 0 });
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null); // 'contacts' | 'facebook'

  const refreshCounts = useCallback(() => { api.getSyncedContacts().then(setCounts).catch(() => {}); }, []);
  const refreshFb = useCallback(() => api.getFacebookStatus().then((st) => { setFb(st); setFbKey((k) => k + 1); }).catch(() => setFb({ configured: false, linked: false })), []);
  useEffect(() => { refreshCounts(); refreshFb(); }, [refreshCounts, refreshFb]);

  // Back from Facebook's consent screen: /settings/contacts-location?facebook=<result>
  useEffect(() => {
    const result = searchParams.get('facebook');
    if (!result) return;
    const [kind, message] = FB_RESULT[result] || FB_RESULT.failed;
    toast[kind]?.(message);
    if (result.startsWith('linked')) setFacebookEnabled(true);
    router.replace('/settings/contacts-location'); // drop the param so a refresh doesn't repeat the toast
    refreshFb();
    refreshCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function allow(name) {
    const next = await requestPermission(name);
    if (next === 'denied') toast.error('Blocked. Change it in your browser’s site settings (the lock icon in the address bar).');
    else if (next === 'granted') toast.success('Allowed');
  }

  async function startFacebook(resync) {
    setBusy('fb');
    try {
      const { url } = resync ? await api.facebookSync() : await api.startFacebookLink();
      window.location.href = url; // Facebook consent → backend callback → back here
    } catch (err) {
      toast.error(err?.code === 'facebook_not_configured' ? 'Facebook linking isn’t set up on this server yet.' : friendlyError(err));
      setBusy('');
    }
  }

  async function unlinkFacebook() {
    setBusy('fb-unlink');
    try {
      await api.unlinkFacebook();
      setCounts((c) => ({ ...c, facebook: 0 }));
      toast.success('Facebook unlinked and synced friends removed');
      setConfirm(null);
      refreshFb();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy('');
    }
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
        footer={
          fb && !fb.configured
            ? 'Facebook linking isn’t set up on this server yet (the site owner needs to add the Facebook app keys).'
            : 'We store your Facebook name and ID so friends can find you. Facebook only shares friends who also use ClipPulse, and you can unlink and delete everything at any time.'
        }
      >
        <ToggleRow icon={ic(Users)} title="Facebook friends" subtitle="Find Facebook friends on ClipPulse" checked={facebookEnabled} onChange={setFacebookEnabled} />
        {facebookEnabled && !fb && <SettingsRow icon={ic(Users)} title="Facebook" subtitle="Checking…" chevron={false} />}
        {facebookEnabled && fb && !fb.linked && (
          <SettingsRow
            icon={ic(Users)}
            title="Connect Facebook"
            subtitle={fb.configured ? 'Not connected' : 'Not available on this server yet'}
            chevron={false}
            right={<button type="button" onClick={() => startFacebook(false)} disabled={!fb.configured || busy === 'fb'} className={BTN}>{busy === 'fb' ? 'Opening…' : 'Connect'}</button>}
          />
        )}
        {facebookEnabled && fb?.linked && (
          <>
            <SettingsRow
              icon={ic(Users)}
              title="Facebook account"
              subtitle={`Linked${fb.name ? ` as ${fb.name}` : ''}${when(fb.linkedAt) ? ` · since ${when(fb.linkedAt)}` : ''}`}
              chevron={false}
              right={<button type="button" onClick={() => setConfirm('unlink')} disabled={busy === 'fb-unlink'} className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-neutral-800 text-slate-800 dark:text-neutral-200 font-sans font-bold text-xs disabled:opacity-40">Disconnect</button>}
            />
            <SettingsRow
              icon={ic(Users)}
              title="Sync Facebook friends"
              subtitle={fb.syncedAt ? `Synced ${when(fb.syncedAt)} · ${fb.friendsSynced} friend${fb.friendsSynced === 1 ? '' : 's'} found, ${fb.matched} on ClipPulse` : 'Not synced yet'}
              chevron={false}
              right={<button type="button" onClick={() => startFacebook(true)} disabled={busy === 'fb'} className={BTN}>{busy === 'fb' ? 'Opening…' : 'Sync'}</button>}
            />
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

      {facebookEnabled && fb?.linked && <FacebookFriends refreshKey={fbKey} />}

      <SettingsGroup title="Device permissions" footer="Permissions are controlled by your browser or device; if one is blocked, change it from the site settings (the lock icon in the address bar).">
        {rows.map(([name, Icon, title, sub]) => {
          const s = perm[name];
          const asking = !!permPending[name];
          const status = asking
            ? 'Requesting…'
            : s === 'granted'
              ? 'Allowed'
              : s === 'denied'
                ? (name === 'geolocation' ? 'Blocked — enable in browser/site settings' : 'Blocked in browser settings')
                : s === 'unsupported'
                  ? permIssues[name] || 'Not supported here'
                  : permIssues[name] || (s ? 'Not asked yet' : 'Checking…');
          const canAsk = !asking && s && s !== 'granted' && s !== 'unsupported';
          return (
            <SettingsRow
              key={name}
              icon={ic(Icon)}
              title={title}
              subtitle={`${status} · ${sub}`}
              chevron={false}
              right={
                s === 'granted' || s === 'unsupported' ? null : (
                  <button type="button" disabled={!canAsk} onClick={() => allow(name)} className={BTN}>
                    {asking ? 'Asking…' : s === 'denied' ? 'Retry' : 'Allow'}
                  </button>
                )
              }
            />
          );
        })}
        <DevicePushRows />
      </SettingsGroup>

      {confirm && (
        <ConfirmModal
          title={confirm === 'unlink' ? 'Disconnect Facebook?' : confirm === 'facebook' ? 'Remove synced Facebook friends?' : 'Remove synced contacts?'}
          message={confirm === 'unlink' ? 'Your Facebook link and every friend synced from it will be deleted from ClipPulse. You can link again any time.' : 'They’ll be deleted from ClipPulse. You can sync again any time.'}
          confirmLabel={busy.startsWith('remove') || busy === 'fb-unlink' ? 'Working…' : confirm === 'unlink' ? 'Disconnect' : 'Remove'}
          confirmDisabled={busy.startsWith('remove') || busy === 'fb-unlink'}
          onConfirm={() => (confirm === 'unlink' ? unlinkFacebook() : removeSynced(confirm))}
          onCancel={() => setConfirm(null)}
        />
      )}
    </SettingsPage>
  );
}

// useSearchParams() (for the Facebook return trip) needs a Suspense boundary in Next 14.
export default function ContactsLocationPage() {
  return (
    <Suspense fallback={null}>
      <ContactsLocationInner />
    </Suspense>
  );
}
