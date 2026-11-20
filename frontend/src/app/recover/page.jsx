'use client';

import BackButton from '@/components/BackButton';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import AuthHero from '@/components/AuthHero';

// "Look up your account": find an account by username, email or phone number and start recovery.
// The backend answers identically whether or not anything matched, and the recovery link only ever goes to the
// email address already on the account, so this screen can't be used to discover who has an account.
export default function RecoverAccountPage() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api.accountLookup(identifier.trim());
      setMessage(r?.message || 'If we find a matching account, we’ve emailed recovery instructions to the address on file.');
    } catch (err) {
      setError(err?.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : err?.status === 400 ? err.message : 'Connection lost. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-zinc-950 text-white overflow-hidden">
      <AuthHero />
      <div className="lg:col-span-5 w-full max-w-md mx-auto p-6 sm:p-8 flex flex-col justify-center min-h-screen lg:min-h-0">
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold">Look up your account</h2>
          <p className="text-zinc-400 text-sm mt-1">Enter your username, email or phone number and we’ll help you get back in.</p>
        </div>

        {message ? (
          <div>
            <p className="text-sm text-zinc-300 border border-zinc-800 bg-zinc-900/60 rounded-xl px-4 py-3.5">{message}</p>
            <p className="text-xs text-zinc-500 mt-3">The link expires in 1 hour. Nothing arrived? Check spam, or try the email address you signed up with. If you no longer have access to it, open a support ticket after logging in with another account, or contact support.</p>
            <div className="flex justify-center mt-6">
              <BackButton href="/login" label="Back to login" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username, email or phone number"
              autoComplete="username"
              autoCapitalize="none"
              required
              minLength={3}
              maxLength={120}
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3.5 outline-none focus:border-amber-500/60"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={loading || identifier.trim().length < 3} className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg disabled:opacity-50">
              {loading ? 'Looking up…' : 'Look up account'}
            </button>
            <p className="text-center text-xs text-zinc-500">
              Know your email? <Link href="/forgot-password" className="text-amber-400 font-semibold">Reset your password directly</Link>
            </p>
            <div className="flex justify-center">
              <BackButton href="/login" label="Back to login" />
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
