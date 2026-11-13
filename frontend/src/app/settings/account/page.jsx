'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { MAX_ACCOUNTS } from '@/lib/accounts';
import { verifyBiometric } from '@/lib/biometrics';
import { SettingsGroup, SettingsPage, SettingsRow, VerifiedBadge } from '@/components/settings/SettingsUI';

const BIO_MAX = 150;
const MAX_LINKS = 5;

const INPUT =
  'w-full bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-xl px-3.5 py-3 text-sm font-bold tracking-tight text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 outline-none focus:ring-2 focus:ring-amber-500/50';
const LABEL = 'block text-[11px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-neutral-500 mb-1.5';

function Avatar({ user, size = 'w-10 h-10' }) {
  return (
    <span className={`${size} rounded-full overflow-hidden bg-slate-100 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 flex items-center justify-center shrink-0 font-extrabold text-slate-900 dark:text-white`}>
      {user?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        (user?.username?.[0] || '?').toUpperCase()
      )}
    </span>
  );
}

function AccountSwitcher() {
  const router = useRouter();
  const toast = useToast();
  const { user, accounts, switchAccount, forgetAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function onSwitch(id) {
    if (id === user?.id || busyId) return;
    setBusyId(id);
    const res = await switchAccount(id);
    if (!res.ok) {
      toast.error(res.error);
      setBusyId(null);
    }
    // on success the page reloads into the other account
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-100 dark:hover:bg-neutral-800/60"
      >
        <Avatar user={user} size="w-12 h-12" />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold tracking-tight text-slate-900 dark:text-white truncate">{user.displayName || user.username}</span>
          <span className="block text-xs font-bold text-slate-500 dark:text-neutral-400 truncate">@{user.username} · Active</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-extrabold text-amber-600 dark:text-amber-500 shrink-0">
          Switch <ChevronDown className="w-4 h-4" strokeWidth={3} />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end" role="dialog" aria-modal="true" aria-label="Switch account">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-share-backdrop" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md mx-auto bg-slate-50 dark:bg-neutral-900 text-slate-900 dark:text-white rounded-t-3xl border-t border-slate-200 dark:border-neutral-800 animate-share-sheet pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="font-extrabold tracking-tight text-lg">Switch account</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-8 h-8 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center">
                <X className="w-4 h-4" strokeWidth={3} />
              </button>
            </div>
            <ul className="px-3 max-h-[50dvh] overflow-y-auto">
              {accounts.map((a) => {
                const active = a.id === user.id;
                return (
                  <li key={a.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSwitch(a.id)}
                      disabled={!!busyId}
                      className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-slate-100 dark:hover:bg-neutral-800 text-left disabled:opacity-60"
                    >
                      <Avatar user={a.user} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-extrabold tracking-tight truncate">{a.user.displayName || a.user.username}</span>
                        <span className="block text-xs font-bold text-slate-500 dark:text-neutral-400 truncate">@{a.user.username}</span>
                      </span>
                      {busyId === a.id ? (
                        <span className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                      ) : active ? (
                        <Check className="w-5 h-5 text-amber-600 dark:text-amber-500" strokeWidth={3.5} />
                      ) : null}
                    </button>
                    {!active && (
                      <button
                        type="button"
                        onClick={() => forgetAccount(a.id)}
                        aria-label={`Remove @${a.user.username} from this device`}
                        className="w-9 h-9 rounded-full text-slate-500 dark:text-neutral-500 hover:text-red-400 flex items-center justify-center"
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
                onClick={() => router.push('/login?add=1')}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold disabled:opacity-40"
              >
                <UserPlus className="w-4 h-4" strokeWidth={3} /> Add account
              </button>
              <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-500 text-center mt-2">
                {accounts.length >= MAX_ACCOUNTS
                  ? `You can keep up to ${MAX_ACCOUNTS} accounts on this device.`
                  : 'Accounts stay signed in on this device only. Log out to remove one.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AccountDetailsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, ready, isAuthenticated, updateUser } = useAuth();
  const [saved, setSaved] = useState(null); // last server copy
  const [form, setForm] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api
      .getAccountProfile()
      .then((d) => {
        if (cancelled) return;
        setSaved(d);
        setForm(toForm(d));
      })
      .catch((e) => !cancelled && setLoadError(e.message || "Couldn't load your account details."));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const emailChanging = !!(form && saved && form.email.trim().toLowerCase() !== saved.email);
  const dirty = useMemo(() => !!(form && saved && JSON.stringify(form) !== JSON.stringify(toForm(saved))), [form, saved]);

  if (!ready || !isAuthenticated || !user) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLink = (i, patch) => set({ links: form.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  async function save(e) {
    e.preventDefault();
    if (!dirty || saving) return;
    setError(null);
    // Half-filled link rows would just be rejected by the server — say so here.
    for (const l of form.links) {
      if ((l.label.trim() && !l.url.trim()) || (!l.label.trim() && l.url.trim())) {
        setError('Each link needs both a label and a URL (or remove the row).');
        return;
      }
    }
    const body = {
      email: form.email.trim(),
      phone: form.phone.trim(),
      bio: form.bio.trim(),
      whatsapp: form.whatsapp.trim(),
      externalLinks: form.links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
    };
    if (emailChanging && saved.hasPassword) body.currentPassword = currentPassword;
    setVerifying(true);
    const bioCheck = await verifyBiometric(user.id, 'profile');
    setVerifying(false);
    if (!bioCheck.verified) {
      setError('Fingerprint verification required to save changes');
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateAccountProfile(body, bioCheck.stepUpToken);
      setSaved(res);
      setForm(toForm(res));
      setCurrentPassword('');
      updateUser({ email: res.email, emailVerified: res.emailVerified, bio: res.bio });
      if (res.emailChanged) {
        toast.success(res.verificationSent ? 'Saved — check your new email for a verification code' : 'Saved — verify your new email to finish');
      } else {
        toast.success('Account details saved');
      }
    } catch (err) {
      setError(err.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsPage title="Account Details">
      <SettingsGroup title="Accounts" footer="Switch between accounts you've signed in to on this device.">
        <AccountSwitcher />
      </SettingsGroup>

      {loadError && <p className="text-sm font-bold text-red-400 mb-5">{loadError}</p>}

      {form && saved && (
        <form onSubmit={save}>
          <SettingsGroup title="Contact">
            <div className="px-4 py-4 space-y-4">
              <div>
                <label htmlFor="acc-email" className={LABEL}>Email</label>
                <input id="acc-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={INPUT} />
                <div className="mt-2 flex items-center gap-2">
                  <VerifiedBadge verified={saved.emailVerified} />
                  {!saved.emailVerified && (
                    <Link href={`/verify-email?email=${encodeURIComponent(saved.email)}`} className="text-xs font-extrabold text-amber-600 dark:text-amber-500">
                      Verify now
                    </Link>
                  )}
                </div>
                {emailChanging && (
                  <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-2.5">
                    <p className="text-xs font-bold text-amber-300">
                      We&apos;ll email a verification code to the new address, and it stays unverified until you enter it.
                    </p>
                    {saved.hasPassword && (
                      <>
                        <label htmlFor="acc-pw" className={LABEL}>Current password</label>
                        <input id="acc-pw" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={INPUT} />
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="acc-phone" className={LABEL}>Phone number</label>
                <input id="acc-phone" type="tel" autoComplete="tel" placeholder="+233 24 000 0000" value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={INPUT} />
              </div>
            </div>
          </SettingsGroup>

          <SettingsGroup title="Profile & links" footer="Your bio and links are shown on your public profile. Phone and email stay private.">
            <div className="px-4 py-4 space-y-4">
              <div>
                <label htmlFor="acc-bio" className={LABEL}>Bio / description</label>
                <textarea id="acc-bio" rows={3} maxLength={BIO_MAX} value={form.bio} onChange={(e) => set({ bio: e.target.value })} className={`${INPUT} resize-none`} placeholder="Tell people about yourself" />
                <p className="text-right text-[11px] font-bold text-slate-500 dark:text-neutral-500 mt-1">{BIO_MAX - form.bio.length} left</p>
              </div>
              <div>
                <label htmlFor="acc-wa" className={LABEL}>WhatsApp</label>
                <input id="acc-wa" inputMode="tel" placeholder="Number or wa.me link" value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} className={INPUT} />
              </div>
              <div>
                <span className={LABEL}>External links</span>
                <div className="space-y-2.5">
                  {form.links.map((l, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0 space-y-2">
                        <input aria-label={`Link ${i + 1} label`} placeholder="Label (e.g. Instagram)" maxLength={30} value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} className={INPUT} />
                        <input aria-label={`Link ${i + 1} URL`} type="url" inputMode="url" placeholder="https://…" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} className={INPUT} />
                      </div>
                      <button type="button" aria-label={`Remove link ${i + 1}`} onClick={() => set({ links: form.links.filter((_, j) => j !== i) })} className="w-10 h-10 mt-1 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-red-400 flex items-center justify-center shrink-0">
                        <Trash2 className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
                {form.links.length < MAX_LINKS && (
                  <button type="button" onClick={() => set({ links: [...form.links, { label: '', url: '' }] })} className="mt-3 flex items-center gap-1.5 text-sm font-extrabold text-amber-600 dark:text-amber-500">
                    <Plus className="w-4 h-4" strokeWidth={3} /> Add link
                  </button>
                )}
              </div>
            </div>
          </SettingsGroup>

          {error && <p role="alert" className="text-sm font-bold text-red-400 mb-3 px-1">{error}</p>}
          <button
            type="submit"
            disabled={!dirty || saving || verifying || (emailChanging && saved.hasPassword && !currentPassword)}
            className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold tracking-tight disabled:opacity-40 mb-6"
          >
            {verifying ? 'Verifying Fingerprint…' : saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}

      <SettingsGroup title="Manage">
        <SettingsRow href="/profile/edit" icon="✏️" title="Edit Profile" subtitle="Name, photo & banner" />
        <SettingsRow href="/settings/change-password" icon="🔑" title="Change Password" />
      </SettingsGroup>
    </SettingsPage>
  );
}

function toForm(d) {
  return {
    email: d.email || '',
    phone: d.phone || '',
    bio: d.bio || '',
    whatsapp: d.whatsapp || '',
    links: (d.externalLinks || []).map((l) => ({ label: l.label, url: l.url })),
  };
}
