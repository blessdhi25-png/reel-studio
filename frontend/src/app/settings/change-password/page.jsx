'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }

    setLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to update password');

      setStatus({ type: 'success', message: 'Password updated successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0b14] text-white p-4 font-sans max-w-md mx-auto">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white uppercase tracking-widest mb-6 pt-2"
      >
        <ArrowLeft size={14} />
        <span>Back to Settings</span>
      </Link>

      <h1 className="text-2xl font-black uppercase tracking-wider text-white mb-6">
        Change Password
      </h1>

      {status.message && (
        <div
          className={`p-3 rounded-xl mb-4 text-xs font-medium flex items-center gap-2 ${
            status.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-400'
              : 'bg-rose-950/60 border border-rose-800 text-rose-400'
          }`}
        >
          {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{status.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Current Password
          </label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            New Password
          </label>
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Confirm New Password
          </label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 py-3 rounded-xl bg-amber-500 text-black text-xs font-extrabold uppercase tracking-wider hover:bg-amber-400 transition-all disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
