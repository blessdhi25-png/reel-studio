'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

const MESSAGE_OPTIONS = [
  { value: 'everyone', label: 'Everyone', hint: 'Anyone can send you a message.' },
  { value: 'followers', label: 'Followers', hint: 'Only people you follow, or who follow you, can message you.' },
  { value: 'none', label: 'No one', hint: 'Turn off direct messages entirely.' },
];

const COMMENT_OPTIONS = [
  { value: 'everyone', label: 'Everyone', hint: 'Anyone can comment on your videos.' },
  { value: 'followers', label: 'Followers', hint: 'Only your followers can comment.' },
  { value: 'none', label: 'No one', hint: 'Turn off comments on your videos.' },
];

export default function PrivacySettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [isPrivate, setIsPrivate] = useState(false);
  const [messagePrivacy, setMessagePrivacy] = useState('followers');
  const [commentPrivacy, setCommentPrivacy] = useState('everyone');

  const [blocked, setBlocked] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState(null);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    Promise.all([api.getPrivacySettings(), api.getBlockedUsers()])
      .then(([settings, blockedUsers]) => {
        setIsPrivate(!!settings.isPrivate);
        setMessagePrivacy(settings.messagePrivacy || 'followers');
        setCommentPrivacy(settings.commentPrivacy || 'everyone');
        setBlocked(blockedUsers);
      })
      .catch(() => setError('Could not load your privacy settings.'))
      .finally(() => {
        setLoading(false);
        setBlockedLoading(false);
      });
  }, [router]);

  function flashToast(message) {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }

  async function save(partial) {
    setSaving(true);
    setError(null);
    try {
      await api.updatePrivacySettings(partial);
      flashToast('Saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function togglePrivate() {
    const next = !isPrivate;
    setIsPrivate(next);
    save({ isPrivate: next });
  }

  function chooseMessagePrivacy(value) {
    setMessagePrivacy(value);
    save({ messagePrivacy: value });
  }

  function chooseCommentPrivacy(value) {
    setCommentPrivacy(value);
    save({ commentPrivacy: value });
  }

  async function unblock(user) {
    setUnblockingId(user.id);
    setBlocked((prev) => prev.filter((u) => u.id !== user.id));
    try {
      await api.unblockUser(user.id);
      flashToast(`Unblocked @${user.username}`);
    } catch (err) {
      setBlocked((prev) => [...prev, user]);
      setError(err.message);
    } finally {
      setUnblockingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto animate-pulse pb-20">
        <div className="h-4 w-32 rounded bg-ink2 mb-8" />
        <div className="h-10 w-64 rounded bg-ink2 mb-8" />
        <div className="space-y-3">
          <div className="h-16 rounded-sprocket bg-ink2" />
          <div className="h-16 rounded-sprocket bg-ink2" />
          <div className="h-16 rounded-sprocket bg-ink2" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto pb-24">
      <a href="/settings" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back to settings
      </a>

      <h1 className="font-display text-4xl text-bone tracking-wide mt-8 mb-2">Privacy</h1>
      <p className="font-body text-smoke text-sm mb-8">
        Control who can see, contact, and interact with you.
      </p>

      {error && (
        <p className="font-body text-xs text-red-400 mb-4 border border-red-400/30 rounded-sprocket px-3 py-2">
          {error}
        </p>
      )}

      {/* Private account */}
      <section className="mb-10">
        <div className="flex items-center justify-between py-4 border-b border-smoke/10">
          <div className="pr-4">
            <p className="font-body text-bone font-semibold">Private account</p>
            <p className="font-body text-smoke text-xs mt-1">
              Only your followers can see your videos. Your profile stays visible.
            </p>
          </div>
          <ToggleSwitch checked={isPrivate} onChange={togglePrivate} disabled={saving} />
        </div>
      </section>

      {/* Who can message you */}
      <section className="mb-10">
        <h2 className="font-body text-bone font-semibold mb-1">Who can message you</h2>
        <p className="font-body text-smoke text-xs mb-4">Choose who can send you direct messages.</p>
        <OptionList
          options={MESSAGE_OPTIONS}
          selected={messagePrivacy}
          onSelect={chooseMessagePrivacy}
          disabled={saving}
        />
      </section>

      {/* Who can comment on your videos */}
      <section className="mb-10">
        <h2 className="font-body text-bone font-semibold mb-1">Who can comment on your videos</h2>
        <p className="font-body text-smoke text-xs mb-4">Choose who can leave comments on what you post.</p>
        <OptionList
          options={COMMENT_OPTIONS}
          selected={commentPrivacy}
          onSelect={chooseCommentPrivacy}
          disabled={saving}
        />
      </section>

      {/* Blocked accounts */}
      <section>
        <h2 className="font-body text-bone font-semibold mb-1">Blocked accounts</h2>
        <p className="font-body text-smoke text-xs mb-4">
          Blocked accounts can't follow you, message you, comment on your videos, or find your profile.
        </p>

        {blockedLoading ? (
          <div className="space-y-2">
            <div className="h-14 rounded-sprocket bg-ink2 animate-pulse" />
            <div className="h-14 rounded-sprocket bg-ink2 animate-pulse" />
          </div>
        ) : blocked.length === 0 ? (
          <p className="font-body text-smoke text-sm">You haven't blocked anyone.</p>
        ) : (
          <div className="space-y-1">
            {blocked.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 py-3 border-b border-smoke/10"
              >
                <div className="w-10 h-10 rounded-full bg-reel/20 flex items-center justify-center font-display text-lg text-reel overflow-hidden shrink-0">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    user.username?.[0]?.toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-bone text-sm truncate">
                    {user.displayName || user.username}
                  </p>
                  <p className="font-body text-smoke text-xs truncate">@{user.username}</p>
                </div>
                <button
                  onClick={() => unblock(user)}
                  disabled={unblockingId === user.id}
                  className="font-body text-xs font-semibold px-4 py-2 rounded-sprocket border border-smoke/40 text-smoke disabled:opacity-50 shrink-0"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-ink2 text-bone font-body text-xs px-4 py-2 rounded-sprocket border border-smoke/20 z-40">
          {toast}
        </div>
      )}
    </main>
  );
}

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
        checked ? 'bg-reel' : 'bg-smoke/30'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-bone transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function OptionList({ options, selected, onSelect, disabled }) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          disabled={disabled}
          className={`w-full text-left px-4 py-3 rounded-sprocket border disabled:opacity-50 ${
            selected === opt.value ? 'border-reel' : 'border-smoke/20'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`font-body text-sm font-semibold ${selected === opt.value ? 'text-reel' : 'text-bone'}`}>
              {opt.label}
            </span>
            {selected === opt.value && <span className="text-reel text-sm">✓</span>}
          </div>
          <p className="font-body text-smoke text-xs mt-1">{opt.hint}</p>
        </button>
      ))}
    </div>
  );
}
