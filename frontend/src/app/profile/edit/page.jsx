'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function CameraIcon(props) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ImageIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function CheckCircleIcon(props) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
      <path d="M0 0h24v24H0z" fill="none" stroke="none" />
    </svg>
  );
}

function SpinnerIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin" {...props}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ArrowLeftIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const BIO_MAX = 150;
const TABS = [
  { id: 'profile', label: 'Public Profile', icon: '👤' },
  { id: 'privacy', label: 'Account & Privacy', icon: '🔒' },
];
const DM_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers Only' },
  { value: 'none', label: 'Nobody' },
];

// Fields with no corresponding column/endpoint on the backend yet
// (see backend/src/routes/users.js + prisma schema — displayName,
// avatarUrl, bannerUrl, and bio are persisted server-side for PATCH
// /users/me; avatar/banner also each have their own upload endpoint).
// We keep the rest fully interactive and persist them locally per-account
// so the hub still "feels" complete, and swap this for real API calls
// the moment the backend grows the columns/endpoints for them.
const LOCAL_EXTRAS_PREFIX = 'profileExtras:';

function loadLocalExtras(userId) {
  try {
    const raw = localStorage.getItem(`${LOCAL_EXTRAS_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalExtras(userId, extras) {
  try {
    localStorage.setItem(`${LOCAL_EXTRAS_PREFIX}${userId}`, JSON.stringify(extras));
  } catch {
    /* best-effort — ignore quota/serialization errors */
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function EditProfilePage() {
  const router = useRouter();
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('profile');
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  // Public profile
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [bannerUploading, setBannerUploading] = useState(false);

  // Username availability (client-side check — no backend endpoint exists
  // for this yet, so it validates format/length locally rather than
  // calling a real API).
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle | checking | available | taken | invalid
  const originalUsername = useRef('');
  const usernameCheckTimer = useRef(null);

  // Personal info & privacy
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [dob, setDob] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [messagePrivacy, setMessagePrivacy] = useState('followers');
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (!token || !stored) {
      router.push('/login');
      return;
    }
    const user = JSON.parse(stored);
    setUserId(user.id);

    Promise.all([api.getUser(user.id), api.getPrivacySettings()])
      .then(([u, privacy]) => {
        setAvatarUrl(u.avatarUrl || '');
        setBannerUrl(u.bannerUrl || '');
        setDisplayName(u.displayName || '');
        setUsername(u.username || '');
        originalUsername.current = u.username || '';
        setBio(u.bio || '');
        setIsPrivate(!!privacy.isPrivate);
        setMessagePrivacy(privacy.messagePrivacy || 'followers');
        // user.email isn't returned by GET /users/:id today (only the
        // account owner should ever see it) — fall back to whatever the
        // login/register response cached locally, if anything.
        setEmail(user.email || '');
        setEmailVerified(!!user.emailVerified);

        const extras = loadLocalExtras(user.id);
        setWebsite(extras.website || '');
        setDob(extras.dob || '');
        setAllowDownloads(extras.allowDownloads ?? true);
        setShowOnlineStatus(extras.showOnlineStatus ?? true);
      })
      .catch(() => setError('Could not load your account settings.'))
      .finally(() => setLoading(false));
  }, [router]);

  function flashToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  }

  /* ---------------- Avatar upload (real API) ---------------- */

  async function handleAvatarSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAvatarError(null);
    setAvatarUploading(true);
    const localPreview = URL.createObjectURL(file);
    setAvatarUrl(localPreview);

    try {
      const body = new FormData();
      body.append('avatar', file);
      const { avatarUrl: uploaded } = await api.uploadAvatar(body);
      setAvatarUrl(uploaded);
      URL.revokeObjectURL(localPreview);
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, avatarUrl: uploaded }));
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarUploading(false);
    }
  }

  /* ---------------- Banner upload (real API) ---------------- */

  async function handleBannerSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBannerUploading(true);
    const localPreview = URL.createObjectURL(file);
    setBannerUrl(localPreview);

    try {
      const body = new FormData();
      body.append('banner', file);
      const { bannerUrl: uploaded } = await api.uploadBanner(body);
      setBannerUrl(uploaded);
      URL.revokeObjectURL(localPreview);
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, bannerUrl: uploaded }));
    } catch (err) {
      flashToast(err.message || 'Could not upload banner');
    } finally {
      setBannerUploading(false);
    }
  }

  /* ---------------- Username availability (client-side stub) ---------------- */

  function handleUsernameChange(e) {
    const value = e.target.value.replace(/^@/, '').replace(/\s/g, '');
    setUsername(value);

    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);

    if (value === originalUsername.current) {
      setUsernameStatus('idle');
      return;
    }
    if (value.length < 3 || !/^[a-zA-Z0-9_.]+$/.test(value)) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    usernameCheckTimer.current = setTimeout(() => {
      const RESERVED = ['admin', 'support', 'bledhi', 'help', 'root'];
      setUsernameStatus(RESERVED.includes(value.toLowerCase()) ? 'taken' : 'available');
    }, 500);
  }

  /* ---------------- Save ---------------- */

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Fields the backend actually persists.
      const updated = await api.updateProfile({ displayName, avatarUrl, bannerUrl, bio });
      await api.updatePrivacySettings({ isPrivate, messagePrivacy });

      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem(
        'user',
        JSON.stringify({
          ...stored,
          displayName: updated.displayName,
          avatarUrl: updated.avatarUrl,
          bannerUrl: updated.bannerUrl,
        })
      );

      // Fields not yet backed by the API — persisted locally so the hub
      // stays consistent across reloads.
      saveLocalExtras(userId, { website, dob, allowDownloads, showOnlineStatus });

      flashToast('Changes saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    router.push(userId ? `/profile/${userId}` : '/');
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black px-6">
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <SpinnerIcon />
          Loading account settings…
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-black px-4"
      style={{ paddingBottom: 'calc(11rem + env(safe-area-inset-bottom))' }}
    >
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto p-6 md:p-8 bg-zinc-900/70 border border-zinc-800/80 rounded-3xl backdrop-blur-md shadow-2xl my-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Account Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your public identity, personal information, and privacy privileges.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-zinc-800/60 border border-zinc-800 rounded-2xl mb-8 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-400 mb-6 border border-red-500/30 bg-red-500/10 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {activeTab === 'profile' ? (
          <PublicProfileTab
            avatarUrl={avatarUrl}
            bannerUrl={bannerUrl}
            displayName={displayName}
            setDisplayName={setDisplayName}
            username={username}
            handleUsernameChange={handleUsernameChange}
            usernameStatus={usernameStatus}
            bio={bio}
            setBio={setBio}
            website={website}
            setWebsite={setWebsite}
            avatarInputRef={avatarInputRef}
            bannerInputRef={bannerInputRef}
            handleAvatarSelect={handleAvatarSelect}
            handleBannerSelect={handleBannerSelect}
            avatarUploading={avatarUploading}
            bannerUploading={bannerUploading}
            avatarError={avatarError}
          />
        ) : (
          <PrivacyTab
            email={email}
            setEmail={setEmail}
            emailVerified={emailVerified}
            dob={dob}
            setDob={setDob}
            isPrivate={isPrivate}
            setIsPrivate={setIsPrivate}
            messagePrivacy={messagePrivacy}
            setMessagePrivacy={setMessagePrivacy}
            allowDownloads={allowDownloads}
            setAllowDownloads={setAllowDownloads}
            showOnlineStatus={showOnlineStatus}
            setShowOnlineStatus={setShowOnlineStatus}
          />
        )}
      </form>

      {/* Sticky footer action bar — docked above the global bottom nav
          (also `fixed bottom-0`) instead of on top of it. */}
      <div
        className="fixed left-0 right-0 z-30 border-t border-zinc-800 bg-black/90 backdrop-blur-md"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleCancel}
            className="text-zinc-300 hover:text-white font-medium px-5 py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-600 transition-all text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={undefined}
            onClick={handleSubmit}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {saving && <SpinnerIcon />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Toast — sits above the footer bar above */}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-zinc-900 text-white text-sm font-medium px-4 py-3 rounded-xl border border-amber-500/40 shadow-2xl"
          style={{ bottom: 'calc(9.5rem + env(safe-area-inset-bottom))' }}
        >
          <CheckCircleIcon className="text-amber-400" />
          {toast}
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Tab 1 — Public Profile                                              */
/* ------------------------------------------------------------------ */

function PublicProfileTab({
  avatarUrl,
  bannerUrl,
  displayName,
  setDisplayName,
  username,
  handleUsernameChange,
  usernameStatus,
  bio,
  setBio,
  website,
  setWebsite,
  avatarInputRef,
  bannerInputRef,
  handleAvatarSelect,
  handleBannerSelect,
  avatarUploading,
  bannerUploading,
  avatarError,
}) {
  return (
    <div className="space-y-8">
      {/* Cover banner */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Cover Banner
        </label>
        <button
          type="button"
          onClick={() => bannerInputRef.current?.click()}
          className="relative w-full h-36 md:h-44 rounded-2xl bg-zinc-800/80 border border-zinc-700 overflow-hidden group"
        >
          {bannerUrl ? (
            <img src={bannerUrl} alt="Cover banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-500">
              <ImageIcon />
              <span className="text-xs font-medium">Add a cover banner</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <CameraIcon width={14} height={14} />
              {bannerUploading ? 'Uploading…' : 'Change Banner'}
            </span>
          </div>
        </button>
        <input
          ref={bannerInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleBannerSelect}
          className="hidden"
        />
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-5 -mt-14 md:-mt-16 ml-2 relative z-10">
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          className="relative w-24 h-24 md:w-28 md:h-28 rounded-full bg-zinc-800 border-4 border-zinc-900 overflow-hidden shrink-0 flex items-center justify-center text-3xl font-bold text-amber-400"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            (displayName || username || '?')[0]?.toUpperCase()
          )}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <CameraIcon className="text-white" />
          </div>
          {avatarUploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <SpinnerIcon className="text-white" />
            </div>
          )}
        </button>
        <div className="pt-14 md:pt-16">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 disabled:opacity-50 transition-all"
          >
            {avatarUploading ? 'Uploading…' : 'Change Photo'}
          </button>
          <p className="text-[11px] text-zinc-500 mt-1.5">JPG, PNG, WEBP up to 8MB</p>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarSelect}
          className="hidden"
        />
      </div>
      {avatarError && <p className="text-xs text-red-400 -mt-4">{avatarError}</p>}

      {/* Full name */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Full Name
        </label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your full name"
          maxLength={60}
          className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all placeholder:text-zinc-500"
        />
      </div>

      {/* Username */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Username Handle
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">
            @
          </span>
          <input
            value={username}
            onChange={handleUsernameChange}
            placeholder="username"
            className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl pl-8 pr-24 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all placeholder:text-zinc-500"
          />
          <UsernameStatusBadge status={usernameStatus} />
        </div>
        <UsernameHelperText status={usernameStatus} />
      </div>

      {/* Bio */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Bio / About
          </label>
          <span className={`text-[11px] font-mono ${bio.length >= BIO_MAX ? 'text-amber-400' : 'text-zinc-500'}`}>
            {bio.length} / {BIO_MAX} characters
          </span>
        </div>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          placeholder="Tell people about yourself…"
          rows={4}
          maxLength={BIO_MAX}
          className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all resize-none placeholder:text-zinc-500"
        />
      </div>

      {/* Website */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          External Link / Website
        </label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          type="url"
          placeholder="https://your-site.com"
          className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all placeholder:text-zinc-500"
        />
      </div>
    </div>
  );
}

function UsernameStatusBadge({ status }) {
  if (status === 'checking') {
    return (
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">
        <SpinnerIcon />
      </span>
    );
  }
  if (status === 'available') {
    return (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-emerald-400 text-[11px] font-semibold bg-emerald-500/10 px-2 py-1 rounded-lg">
        <CheckCircleIcon /> Available
      </span>
    );
  }
  if (status === 'taken' || status === 'invalid') {
    return (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-red-400 bg-red-500/10 px-2 py-1 rounded-lg">
        {status === 'taken' ? 'Taken' : 'Invalid'}
      </span>
    );
  }
  return null;
}

function UsernameHelperText({ status }) {
  const map = {
    checking: { text: 'Checking availability…', color: 'text-zinc-500' },
    available: { text: 'This username is available.', color: 'text-emerald-400' },
    taken: { text: 'This username is already taken.', color: 'text-red-400' },
    invalid: { text: 'Use 3+ characters: letters, numbers, “.” or “_” only.', color: 'text-red-400' },
    idle: { text: 'Your unique handle — this is how people find you.', color: 'text-zinc-500' },
  };
  const { text, color } = map[status] || map.idle;
  return <p className={`text-[11px] mt-1.5 ${color}`}>{text}</p>;
}

/* ------------------------------------------------------------------ */
/* Tab 2 — Personal Info & Privacy                                     */
/* ------------------------------------------------------------------ */

function PrivacyTab({
  email,
  setEmail,
  emailVerified,
  dob,
  setDob,
  isPrivate,
  setIsPrivate,
  messagePrivacy,
  setMessagePrivacy,
  allowDownloads,
  setAllowDownloads,
  showOnlineStatus,
  setShowOnlineStatus,
}) {
  return (
    <div className="space-y-10">
      {/* Personal information */}
      <section>
        <h2 className="text-sm font-bold text-white mb-4">Personal Information</h2>
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <div className="flex items-center gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
                className="flex-1 bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all placeholder:text-zinc-500"
              />
              {emailVerified ? (
                <span className="shrink-0 flex items-center gap-1 text-emerald-400 text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 px-3 py-3 rounded-xl">
                  <CheckCircleIcon /> Verified
                </span>
              ) : (
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold text-amber-400 border border-amber-500/40 hover:bg-amber-500/10 px-4 py-3 rounded-xl transition-all"
                >
                  Verify Email
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Date of Birth
            </label>
            <input
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              type="date"
              className="w-full bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all [color-scheme:dark]"
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              Used to verify age eligibility. Not shown publicly.
            </p>
          </div>
        </div>
      </section>

      {/* Privacy controls */}
      <section>
        <h2 className="text-sm font-bold text-white mb-4">Privacy Controls</h2>
        <div className="divide-y divide-zinc-800">
          <ToggleRow
            title="Private Account"
            description="Only approved followers can view your content."
            checked={isPrivate}
            onChange={() => setIsPrivate((v) => !v)}
          />

          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-semibold text-white">Direct Messages</p>
              <p className="text-xs text-zinc-500 mt-0.5">Choose who can send you direct messages.</p>
            </div>
            <select
              value={messagePrivacy}
              onChange={(e) => setMessagePrivacy(e.target.value)}
              className="bg-zinc-800/80 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all shrink-0"
            >
              {DM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <ToggleRow
            title="Video Download Permission"
            description="Allow viewers to download your posted short videos."
            checked={allowDownloads}
            onChange={() => setAllowDownloads((v) => !v)}
          />

          <ToggleRow
            title="Online Activity Status"
            description="Show an online presence indicator to your friends."
            checked={showOnlineStatus}
            onChange={() => setShowOnlineStatus((v) => !v)}
          />
        </div>
      </section>
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
        checked ? 'bg-amber-500' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
