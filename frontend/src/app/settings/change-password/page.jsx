'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) router.push('/login');
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto pb-24">
      <a href="/settings" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back to settings
      </a>

      <h1 className="font-display text-4xl text-bone tracking-wide mt-8 mb-2">Change password</h1>
      <p className="font-body text-sm text-smoke mb-8">
        You'll stay signed in on this device after changing it.
      </p>

      {done && (
        <p className="font-body text-sm text-reel mb-6 border border-reel/30 rounded-sprocket px-3 py-2">
          Password changed.
        </p>
      )}
      {error && (
        <p className="font-body text-xs text-red-400 mb-4 border border-red-400/30 rounded-sprocket px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="font-mono text-[10px] text-smoke uppercase tracking-widest block mb-1.5">
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full bg-ink2 text-bone font-body text-sm rounded-sprocket p-3 outline-none border border-transparent focus:border-reel/50"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-smoke uppercase tracking-widest block mb-1.5">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full bg-ink2 text-bone font-body text-sm rounded-sprocket p-3 outline-none border border-transparent focus:border-reel/50"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-smoke uppercase tracking-widest block mb-1.5">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="w-full bg-ink2 text-bone font-body text-sm rounded-sprocket p-3 outline-none border border-transparent focus:border-reel/50"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-reel text-ink font-body font-semibold py-3 rounded-sprocket disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </main>
  );
}
