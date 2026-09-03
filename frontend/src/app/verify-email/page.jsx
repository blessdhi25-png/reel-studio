'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(
    params.get('emailFailed')
      ? "We couldn't send that verification email just now — tap Resend below to try again."
      : null
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const data = await api.verifyEmail(email, code);
      login(data.token, data.user);
      router.push('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      await api.resendVerification(email);
      setNotice('A new code is on its way.');
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <h1 className="font-display text-4xl text-bone tracking-wide mb-1">Check your email</h1>
        <p className="font-body text-smoke text-sm mb-8">
          We sent a 6-digit code to your email. Enter it below to activate your account.
        </p>

        <div className="space-y-3 mb-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full bg-ink2 text-bone font-body text-sm rounded-sprocket p-3 outline-none border border-transparent focus:border-reel/50"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            required
            className="w-full bg-ink2 text-bone font-body text-2xl tracking-[0.5em] text-center rounded-sprocket p-3 outline-none border border-transparent focus:border-reel/50"
          />
        </div>

        {error && <p className="font-body text-sm text-red-400 mb-4">{error}</p>}
        {notice && <p className="font-body text-sm text-reel mb-4">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-reel text-ink font-body font-semibold py-3 rounded-sprocket disabled:opacity-50"
        >
          {loading ? 'Verifying…' : 'Verify email'}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending || !email}
          className="w-full mt-3 font-body text-sm text-smoke py-2 disabled:opacity-50"
        >
          {resending ? 'Sending…' : "Didn't get a code? Resend"}
        </button>
      </form>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
