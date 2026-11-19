'use client';

import {
  Accessibility, Clock, CloudOff, FileText, Fingerprint, HardDrive, KeyRound, Languages, LifeBuoy, Lock, MapPin,
  Megaphone, MessageSquare, Moon, Music, PlayCircle, Shield, ShieldCheck, Timer, User, Users,
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
import { languageByCode } from '@/lib/languages';
import { useLanguage } from '@/context/LanguageContext';
import { formatBytes, getCachedMediaBytes, isCacheSupported } from '@/lib/storageCache';
import { dailyAverageSeconds, formatDuration, readUsage, weekUsage } from '@/lib/screenTime';
import ConfirmModal from '@/components/ConfirmModal';
import {
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsUserCard,
  ToggleRow,
  VerifiedBadge,
} from '@/components/settings/SettingsUI';

// Row icons: one consistent set (lucide) instead of emoji.
const ic = (Icon) => <Icon size={18} strokeWidth={2.25} />;

export default function SettingsDashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const { user, ready, isAuthenticated, logout } = useAuth();
  // Admin visibility is decided by the backend (GET /admin/me re-reads the role
  // from the database), not by the role string cached in localStorage — which
  // is also lowercase ('admin') in this codebase, not 'ADMIN'.
  const { isStaff } = useStaffAccess();

  const [me, setMe] = useState(null);

  // Device-local preferences (see lib/settingsPrefs.js).
  const [twoStep] = usePref('twoStep');
  const [dataSaver] = usePref('dataSaver');
  const [displayLanguage] = usePref('displayLanguage');

  // Storage & cache
  const [cacheBytes, setCacheBytes] = useState(null);

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
  const { theme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    api.getMe().then((d) => !cancelled && setMe(d)).catch(() => {});
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

      {/* ─── Content & display ─── */}
      <SettingsGroup title="Content & display">
        <SettingsRow href="/settings/music" icon={ic(Music)} title="Music" subtitle="Sounds & artist tools" />
        <SettingsRow href="/settings/inbox" icon={ic(MessageSquare)} title="Inbox & Messaging" subtitle="Who can message and call you" />
        <SettingsRow href="/settings/activity" icon={ic(Clock)} title="Activity centre" subtitle="Watch, comment, search & account history" />
        <SettingsRow href="/settings/audience" icon={ic(Lock)} title="Audience control" subtitle="Private profile, comments, blocked accounts" />
        <SettingsRow href="/settings/ads" icon={ic(Megaphone)} title="Ads" subtitle="Promotions & ad activity" />
        <SettingsRow href="/settings/playback" icon={ic(PlayCircle)} title="Playback" subtitle={dataSaver ? 'Data Saver on' : 'Data Saver off'} />
        <SettingsRow href="/settings/display" icon={ic(Moon)} title="Display" subtitle={themeMounted ? (theme === 'dark' ? 'Dark theme' : 'Light theme') : 'Theme'} />
        <SettingsRow href="/settings/language" icon={ic(Languages)} title="Language" subtitle={languageByCode(displayLanguage)?.native || 'English'} />
        <SettingsRow href="/settings/accessibility" icon={ic(Accessibility)} title="Accessibility" subtitle="Reduce motion, larger text" />
        <SettingsRow href="/settings/contacts-location" icon={ic(MapPin)} title="Contacts and location" subtitle="Location, camera, microphone & notifications" />
      </SettingsGroup>

      {/* ─── Cache & mobile ─── */}
      <SettingsGroup title="Cache & mobile">
        <SettingsRow
          href="/settings/offline-videos"
          icon={ic(CloudOff)}
          title="Offline videos"
          subtitle={cacheBytes == null ? 'Calculating…' : `${formatBytes(cacheBytes)} stored on this device`}
        />
        <SettingsRow href="/settings/free-up-space" icon={ic(HardDrive)} title="Free up space" subtitle="Clear cached media and search history" />
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
        <SettingsRow href="/legal/terms" icon={ic(FileText)} title="Terms of Service" subtitle={isStaff ? 'Staff: you can edit this policy' : undefined} />
        <SettingsRow href="/legal/privacy" icon={ic(Shield)} title="Privacy Policy" subtitle={isStaff ? 'Staff: you can edit this policy' : undefined} />
        <SettingsRow href="/legal/guidelines" icon={ic(Users)} title="Community Guidelines" subtitle={isStaff ? 'Staff: you can edit this policy' : undefined} />
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
          title={t('logout.title')}
          message={t('logout.message')}
          confirmLabel={t('common.logOut')}
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </SettingsPage>
  );
}
