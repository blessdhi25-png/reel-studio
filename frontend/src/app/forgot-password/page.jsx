'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import AuthHero from '../../components/AuthHero';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      // Deliberately shown regardless of whether the email matched an
      // account — the backend responds identically either way, and
      // showing anything different here would defeat that.
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-zinc-950 text-white overflow-hidden">
      <AuthHero />

      <div className="lg:col-span-5 w-full max-w-md mx-auto p-6 sm:p-8 flex flex-col justify-center min-h-screen lg:min-h-0">
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold">Reset your password</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Enter your account email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div>
            <p className="text-sm text-zinc-300 border border-zinc-800 bg-zinc-900/60 rounded-xl px-4 py-3.5">
              If an account with that email exists, a password reset link has been sent. Check your inbox
              (and spam folder) — the link expires in 1 hour.
            </p>
            <a
              href="/login"
              className="block text-center mt-6 text-sm font-semibold text-amber-400 hover:text-amber-300"
            >
              ← Back to login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3.5 outline-none focus:border-amber-500/60"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <a
              href="/login"
              className="block text-center text-sm font-semibold text-amber-400 hover:text-amber-300"
            >
              ← Back to login
            </a>
          </form>
        )}
      </div>
    </main>
  );
}
