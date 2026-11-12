'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { SettingsPage } from '@/components/settings/SettingsUI';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login');
  }, [ready, isAuthenticated, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setFormError('New passwords do not match.');
      return;
    }

    setLoading(true);
    setFormError(null);

    try {
      // Previously this hit fetch(`${NEXT_PUBLIC_API_URL}/api/auth/change-password`)
      // directly — missing the /v1 prefix every other endpoint in this app
      // goes through via api.js's API_BASE, and reimplementing its own
      // token attachment instead of using the shared request() helper
      // (which already has the cold-start-aware AUTH_TIMEOUT_MS this
      // endpoint needs just as much as login/register do). That mismatch
      // meant this form was hitting a URL that doesn't exist.
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setFormError(err.message);
      toast.error(err.message || 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  if (!ready || !isAuthenticated) return null;

  return (
    <SettingsPage title="Change Password" backHref="/settings/account" backLabel="Account">
      {/* Success now surfaces as a toast (global system) rather than an
          inline banner — inline stays only for the validation error that
          blocks submission (mismatched passwords), since that needs to
          persist next to the fields it refers to, not disappear after a
          few seconds like a toast does. */}
      {formError && (
        <div className="p-3 rounded-xl mb-4 text-xs font-medium flex items-center gap-2 bg-rose-950/60 border border-rose-800 text-rose-400">
          <AlertCircle size={16} />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-sans font-bold text-[11px] text-slate-500 dark:text-neutral-500 uppercase tracking-widest mb-2 px-1">
            Current Password
          </label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-slate-50 dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3 text-sm font-sans font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block font-sans font-bold text-[11px] text-slate-500 dark:text-neutral-500 uppercase tracking-widest mb-2 px-1">
            New Password
          </label>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-slate-50 dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3 text-sm font-sans font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block font-sans font-bold text-[11px] text-slate-500 dark:text-neutral-500 uppercase tracking-widest mb-2 px-1">
            Confirm New Password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-slate-50 dark:bg-neutral-900/90 border border-slate-200 dark:border-neutral-800 rounded-2xl px-4 py-3 text-sm font-sans font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 py-3.5 rounded-2xl bg-amber-500 text-black text-sm font-sans font-bold hover:bg-amber-400 transition-all disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </SettingsPage>
  );
}
