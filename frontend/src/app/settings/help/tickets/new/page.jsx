'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MapPin, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/friendlyError';
import { describeThisDevice, locationPermission, readLocation } from '@/lib/deviceInfo';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/context/ToastContext';
import { TICKET_CATEGORIES } from '@/lib/supportUi';
import { SettingsPage } from '@/components/settings/SettingsUI';

const FIELD = 'w-full rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 px-3.5 py-3 font-sans text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500';

function NewTicketForm() {
  const ok = useRequireAuth();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const startType = TICKET_CATEGORIES.some((c) => c.value === params.get('type')) ? params.get('type') : 'account';
  const [issueType, setIssueType] = useState(startType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(params.get('draft') || '');
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState('');
  const [location, setLocation] = useState(''); // '' = not shared
  const [locState, setLocState] = useState('idle'); // idle | loading | denied | unavailable
  const [attachDevice, setAttachDevice] = useState(true);

  async function shareLocation() {
    setLocState('loading');
    try {
      setLocation(await readLocation());
      setLocState('idle');
    } catch (err) {
      setLocation('');
      setLocState(err?.code === 1 ? 'denied' : 'unavailable');
    }
  }

  useEffect(() => {
    setDevice(describeThisDevice());
    // Only read the location automatically if the person has already allowed it for this site.
    locationPermission().then((state) => { if (state === 'granted') shareLocation(); });
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const t = await api.createSupportTicket({
        issueType,
        title: title.trim(),
        description: description.trim(),
        deviceInfo: attachDevice ? device : undefined,
        locationText: location || undefined,
      });
      toast.success('Ticket sent. We’ll reply here.');
      router.replace(`/settings/help/tickets/${t.id}`);
    } catch (err) {
      toast.error(friendlyError(err));
      setBusy(false);
    }
  }

  if (!ok) return null;
  return (
    <SettingsPage title="New ticket" backHref="/settings/help/tickets" backLabel="Tickets">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="font-sans font-bold text-xs text-slate-600 dark:text-neutral-300">Issue type</span>
          <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className={`${FIELD} mt-1`}>
            {TICKET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="font-sans font-bold text-xs text-slate-600 dark:text-neutral-300">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Short summary of the problem" className={`${FIELD} mt-1`} />
        </label>
        <label className="block">
          <span className="font-sans font-bold text-xs text-slate-600 dark:text-neutral-300">What happened?</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7} maxLength={4000} placeholder="Include what you expected, what you saw, and any video titles or usernames involved." className={`${FIELD} mt-1`} />
        </label>

        <div className="rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 divide-y divide-slate-100 dark:divide-neutral-800">
          <div className="flex items-start gap-3 p-4">
            <Smartphone size={18} className="mt-0.5 text-slate-500 dark:text-neutral-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-sans font-bold text-sm text-slate-900 dark:text-white">Your device</p>
              <p className="font-sans text-xs text-slate-500 dark:text-neutral-400 mt-0.5 break-words">{attachDevice ? device || 'Detecting…' : 'Not included'}</p>
            </div>
            <button type="button" onClick={() => setAttachDevice((v) => !v)} className="shrink-0 font-sans font-bold text-xs text-amber-600 dark:text-amber-400">{attachDevice ? 'Remove' : 'Include'}</button>
          </div>
          <div className="flex items-start gap-3 p-4">
            <MapPin size={18} className="mt-0.5 text-slate-500 dark:text-neutral-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-sans font-bold text-sm text-slate-900 dark:text-white">Your location</p>
              <p className="font-sans text-xs text-slate-500 dark:text-neutral-400 mt-0.5 break-words">
                {location ? location
                  : locState === 'loading' ? 'Finding your location…'
                  : locState === 'denied' ? 'Location is blocked. Allow it in your browser’s site settings to include it.'
                  : locState === 'unavailable' ? 'Couldn’t get your location right now.'
                  : 'Not shared. Optional: helps us look into regional or network problems.'}
              </p>
            </div>
            {location ? (
              <button type="button" onClick={() => setLocation('')} className="shrink-0 font-sans font-bold text-xs text-amber-600 dark:text-amber-400">Remove</button>
            ) : (
              <button type="button" onClick={shareLocation} disabled={locState === 'loading'} className="shrink-0 font-sans font-bold text-xs text-amber-600 dark:text-amber-400 disabled:opacity-50">Share</button>
            )}
          </div>
        </div>
        <p className="font-sans text-xs text-slate-500 dark:text-neutral-500 -mt-1">Only admins and moderators who handle support can see this ticket.</p>

        <button type="submit" disabled={busy || title.trim().length < 3 || description.trim().length < 10} className="w-full py-3.5 rounded-full bg-amber-500 text-black font-sans font-bold text-sm disabled:opacity-40">
          {busy ? 'Sending…' : 'Send ticket'}
        </button>
      </form>
    </SettingsPage>
  );
}

// useSearchParams() needs a Suspense boundary for static builds.
export default function NewTicketPage() {
  return (
    <Suspense fallback={null}>
      <NewTicketForm />
    </Suspense>
  );
}
