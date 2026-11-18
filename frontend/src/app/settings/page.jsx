'use client';

import {
  Ban, Clock, Droplets, FileText, Fingerprint, HardDrive, KeyRound, LifeBuoy, Lock, MessageSquare,
  Moon, Shield, ShieldCheck, Timer, User, Users, Wifi,
} from 'lucide-react';
import { disableBiometric, getBiometricStatus, isBiometricSupported, registerBiometricCredential } from '@/lib/biometrics';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useStaffAccess } from '@/hooks/useStaffAccess';
import { usePref } from '@/lib/settingsPrefs';
import { clearCachedMedia, formatBytes, getCachedMediaBytes, isCacheSupported } from '@/lib/storageCache';
import { dailyAverageSeconds, formatDuration, readUsage, weekUsage } from '@/lib/screenTime';
import ConfirmModal from '@/components/ConfirmModal';
import {
  Segmented,
  SettingsBlock,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsUserCard,
  ToggleRow,
  VerifiedBadge,
} from '@/components/settings/SettingsUI';

// Row icons: one consistent set (lucide) instead of emoji.
const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

// Values match the backend enum on User.messagePrivacy / commentPrivacy.
const AUDIENCE_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'none', label: 'Nobody' },
];

export default function SettingsDashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, ready, isAuthenticated, logout } = useAuth();
  // Admin visibility is decided by the backend (GET /admin/me re-reads the role
  // from the database), not by the role string cached in localStorage — which
  // is also lowercase ('admin') in this codebase, not 'ADMIN'.
  const { isStaff } = useStaffAccess();

  const [me, setMe] = useState(null);

  // Privacy (server-backed). `null` until loaded so controls don't flash defaults.
  const [privacy, setPrivacy] = useState(null);
  const [privacyError, setPrivacyError] = useState(false);
  const [saving, setSaving] = useState(false);

  // Device-local preferences (see lib/settingsPrefs.js).
  const [twoStep] = usePref('twoStep');
  const [watermark, setWatermark] = usePref('watermark');
  const [dataSaver, setDataSaver] = usePref('dataSaver');

  // Storage & cache
  const [cacheBytes, setCacheBytes] = useState(null);
  const [clearing, setClearing] = useState(false);

  // Screen-time summary for the Wellbeing row
  const [avgSeconds, setAvgSeconds] = useState(null);

  const [confirmLogout, setConfirmLogout] = useState(false);

  // Biometric lock (device-local; see lib/biometrics.js)
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    isBiometricSupported().then(setBioSupported);
    getBiometricStatus().then((st) => setBioEnabled(!!st.enabled)).catch(() => {});
  }, [user?.id]);

  async function toggleBiometric(next) {
    if (!user?.id || bioBusy) return;
    setBioBusy(true);
    try {
      if (next) {
        await registerBiometricCredential(user); // server issues the challenge, verifies and stores the public key
        setBioEnabled(true);
        toast.success('Biometric lock on');
      } else {
        await disableBiometric(user); // needs a server-verified fingerprint
        setBioEnabled(false);
        toast.success('Biometric lock off');
      }
    } catch (err) {
      toast.error(err.message || "Couldn't change the biometric lock");
    } finally {
      setBioBusy(false);
    }
  }

  // Appearance (next-themes). Read only after mount to avoid a hydration mismatch.
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api.getMe().then((d) => !cancelled && setMe(d)).catch(() => {});
    api
      .getPrivacySettings()
      .then((d) => !cancelled && setPrivacy({
        isPrivate: !!d.isPrivate,
        messagePrivacy: d.messagePrivacy || 'followers',
        commentPrivacy: d.commentPrivacy || 'everyone',
      }))
      .catch(() => !cancelled && setPrivacyError(true));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const refreshCache = useCallback(() => {
    if (!isCacheSupported()) return setCacheBytes(0);
    getCachedMediaBytes().then(setCacheBytes).catch(() => setCacheBytes(0));
  }, []);

  useEffect(() => {
    refreshCache();
    setAvgSeconds(dailyAverageSeconds(weekUsage(readUsage())));
  }, [refreshCache]);

  // Optimistic save with rollback, so a failed PATCH never leaves the UI lying.
  async function savePrivacy(partial) {
    const previous = privacy;
    setPrivacy({ ...privacy, ...partial });
    setSaving(true);
    try {
      await api.updatePrivacySettings(partial);
    } catch (err) {
      setPrivacy(previous);
      toast.error(err.message || "Couldn't save that setting — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearCache() {
    setClearing(true);
    try {
      await clearCachedMedia();
      toast.success('Cache cleared');
    } catch {
      toast.error("Couldn't clear the cache — try again.");
    } finally {
      setClearing(false);
      refreshCache();
    }
  }

  function handleLogout() {
    setConfirmLogout(false);
    // AuthContext.logout() clears localStorage, the auth cookies and live state
    // in one go (a bare localStorage.removeItem leaves the middleware cookie behind).
    logout();
    // Hard navigation that *replaces* the history entry: drops every in-memory React/Next cache and
    // means Back can't land on a signed-in screen (middleware + AppShell would bounce it anyway).
    window.location.replace('/login');
  }

  if (!ready || !isAuthenticated || !user) return null;

  const email = me?.email ?? user.email;
  const verified = me?.emailVerified ?? user.emailVerified;
  const phone = me?.phone ?? user.phone;
  const privacyLocked = !privacy || saving;

  return (
    <SettingsPage title="Settings and privacy" backHref={user.id ? `/profile/${user.id}` : '/'} backLabel="Profile">
      <SettingsUserCard user={user} email={email} verified={verified} href={user.id ? `/profile/${user.id}` : undefined} />

      {/* ─── 1. Account & Security ─── */}
      <SettingsGroup title="Account & Security">
        <SettingsRow
          href="/settings/account"
          icon={ic(User)}
          title="Account Details"
          subtitle={[email, phone].filter(Boolean).join(' · ') || 'Email, phone & verification'}
          right={verified != null && <VerifiedBadge verified={verified} />}
        />
        <SettingsRow
          href="/settings/security"
          icon={ic(KeyRound)}
          title="Security & Permissions"
          subtitle={`2-Step Verification ${twoStep ? 'on' : 'off'} · Active devices`}
        />
        {isStaff && (
          <SettingsRow
            href="/admin"
            icon={ic(ShieldCheck)}
            title="Admin Console"
            subtitle="Moderation, users & reports"
            tone="amber"
          />
        )}
      </SettingsGroup>

      {/* ─── Content & activity ─── */}
      <SettingsGroup title="Content & activity">
        <SettingsRow
          href="/settings/activity"
          icon={ic(Clock)}
          title="Activity centre"
          subtitle="Watch, comment, search & account history"
        />
      </SettingsGroup>

      {/* ─── 2. Privacy & Interactions ─── */}
      <SettingsGroup
        title="Privacy & Interactions"
        footer={privacyError ? "Couldn't load your privacy settings. Reload the page to try again." : undefined}
      >
        <ToggleRow
          icon={ic(Lock)}
          title="Private Profile"
          subtitle="Only followers can see your videos"
          checked={!!privacy?.isPrivate}
          disabled={privacyLocked}
          onChange={(next) => savePrivacy({ isPrivate: next })}
        />
        <SettingsBlock icon={ic(MessageSquare)} title="Comments & Direct Messages" subtitle="Choose who can interact with you">
          <div className="space-y-3">
            <div>
              <p className="font-sans font-bold text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-500 mb-1.5">
                Who can comment
              </p>
              <Segmented
                label="Who can comment on your videos"
                options={AUDIENCE_OPTIONS}
                value={privacy?.commentPrivacy}
                disabled={privacyLocked}
                onChange={(value) => savePrivacy({ commentPrivacy: value })}
              />
            </div>
            <div>
              <p className="font-sans font-bold text-[11px] uppercase tracking-wide text-slate-500 dark:text-neutral-500 mb-1.5">
                Who can message you
              </p>
              <Segmented
                label="Who can send you direct messages"
                options={AUDIENCE_OPTIONS}
                value={privacy?.messagePrivacy}
                disabled={privacyLocked}
                onChange={(value) => savePrivacy({ messagePrivacy: value })}
              />
            </div>
          </div>
        </SettingsBlock>
        <ToggleRow
          icon={ic(Droplets)}
          title="Video Downloads & Watermarking"
          subtitle={watermark ? 'Exported clips include the ClipPulse watermark' : 'Exported clips are saved without a watermark'}
          checked={watermark}
          onChange={setWatermark}
        />
        <SettingsRow href="/settings/privacy" icon={ic(Ban)} title="Blocked Accounts" subtitle="Manage who you've blocked" />
      </SettingsGroup>

      {/* ─── 3. App Preferences & Performance ─── */}
      <SettingsGroup
        title="App Preferences & Performance"
        footer="Data Saver caps streaming quality on mobile data for adaptive (HLS) videos. These preferences are saved on this device."
      >
        <SettingsBlock icon={ic(Moon)} title="Appearance" subtitle="Light is the default">
          <Segmented
            label="App theme"
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={themeMounted ? (theme === 'dark' ? 'dark' : 'light') : undefined}
            disabled={!themeMounted}
            onChange={setTheme}
          />
        </SettingsBlock>
        <ToggleRow
          icon={ic(Wifi)}
          title="Data Saver Mode"
          subtitle="Lower video resolution on mobile networks"
          checked={dataSaver}
          onChange={setDataSaver}
        />
        {bioSupported && (
          <ToggleRow
            icon={<Fingerprint className="w-5 h-5 text-amber-500" strokeWidth={2.5} />}
            title="Biometric Security Lock"
            subtitle="Require fingerprint to switch accounts or edit profile"
            checked={bioEnabled}
            disabled={bioBusy}
            onChange={toggleBiometric}
          />
        )}
        <SettingsRow
          icon={ic(HardDrive)}
          title="Storage & Cache"
          subtitle={cacheBytes == null ? 'Calculating…' : `${formatBytes(cacheBytes)} of cached media`}
          chevron={false}
          right={
            <button
              type="button"
              onClick={handleClearCache}
              disabled={clearing || !cacheBytes}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white font-sans font-bold text-xs hover:bg-slate-200 dark:hover:bg-neutral-700 active:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {clearing ? 'Clearing…' : 'Clear Cache'}
            </button>
          }
        />
      </SettingsGroup>

      {/* ─── 4. Pulse Wellbeing ─── */}
      <SettingsGroup title="Pulse Wellbeing">
        <SettingsRow
          href="/settings/wellbeing"
          icon={ic(Timer)}
          title="Screen Time & Activity"
          subtitle={avgSeconds == null ? 'Usage this week' : `Daily average ${formatDuration(avgSeconds)}`}
        />
      </SettingsGroup>

      {/* ─── 5. Support & about ─── */}
      <SettingsGroup title="Support & about">
        <SettingsRow href="/settings/help" icon={ic(LifeBuoy)} title="Help Centre" subtitle="FAQs for account, LIVE, monetisation & safety" />
        <SettingsRow href="/legal/terms" icon={ic(FileText)} title="Terms of Service" />
        <SettingsRow href="/legal/privacy" icon={ic(Shield)} title="Privacy Policy" />
        <SettingsRow href="/legal/guidelines" icon={ic(Users)} title="Community Guidelines" />
      </SettingsGroup>

      <button
        type="button"
        onClick={() => setConfirmLogout(true)}
        className="w-full bg-red-500/10 text-red-500 font-sans font-bold text-sm border border-red-500/20 py-3.5 rounded-2xl hover:bg-red-500/15 active:bg-red-500/20 transition-colors"
      >
        Log Out
      </button>

      {confirmLogout && (
        <ConfirmModal
          title="Log out of ClipPulse?"
          message="You'll need to sign in again to access your account."
          confirmLabel="Log Out"
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </SettingsPage>
  );
}
