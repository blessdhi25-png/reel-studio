'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, googleAuthUrl, pingServer } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import AuthHero from '../../components/AuthHero';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.9c1.7-1.57 2.7-3.88 2.7-6.64z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.27c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.34C2.44 15.98 5.48 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.69A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.27-1.69V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.97l2.99 2.34C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const REMEMBER_KEY = 'reel_remember_email';

const OAUTH_ERROR_MESSAGES = {
  google_denied: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_not_configured: 'Google sign-in isn\'t set up on this server yet.',
  google_email_unverified: 'Your Google email isn\'t verified — verify it with Google first.',
  account_banned: 'This account has been banned.',
  account_suspended: 'This account is suspended.',
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [forgotNotice, setForgotNotice] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(REMEMBER_KEY) : null;
    if (saved) {
      setForm((f) => ({ ...f, email: saved }));
      setRemember(true);
    }
  }, []);

  // Fires a cheap /health request the moment this page loads, so a cold
  // Render instance starts spinning up while the person is still typing
  // their email/password — instead of only starting once they hit submit,
  // which is what was producing "The server took too long to respond" here.
  useEffect(() => {
    pingServer();
  }, []);

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(OAUTH_ERROR_MESSAGES[oauthError] || 'Something went wrong signing in with Google.');
    }
  }, [searchParams]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleGoogleClick() {
    window.location.href = googleAuthUrl();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login({ email: form.email, password: form.password });
      login(data.token, data.user);
      if (remember) {
        window.localStorage.setItem(REMEMBER_KEY, form.email);
      } else {
        window.localStorage.removeItem(REMEMBER_KEY);
      }
      router.push('/');
    } catch (err) {
      if (err.needsVerification) {
        router.push(`/verify-email?email=${encodeURIComponent(err.email || form.email)}`);
        return;
      }
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
          <h2 className="text-2xl font-extrabold">Welcome back</h2>
          <p className="text-zinc-400 text-sm mt-1">Log in to your Reel account.</p>
        </div>

        <button
          type="button"
          onClick={handleGoogleClick}
          className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-3 w-full shadow-sm"
        >
          <GoogleIcon /> Continue with Google
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-xs text-zinc-500 uppercase tracking-wide">or continue with email</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={form.email}
            onChange={update('email')}
            placeholder="Username or email"
            required
            className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-amber-500 placeholder-zinc-600"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={update('password')}
              placeholder="Password"
              required
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3 pr-11 outline-none focus:border-amber-500 placeholder-zinc-600"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-zinc-400">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-amber-500"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => setForgotNotice(true)}
              className="text-amber-400 hover:underline font-semibold"
            >
              Forgot Password?
            </button>
          </div>
          {forgotNotice && (
            <p className="text-xs text-zinc-500">
              Password reset isn't available yet — reach out to support for help.
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg disabled:opacity-50"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="text-sm text-zinc-400 mt-6 text-center">
          Don't have an account?{' '}
          <Link href="/signup" className="text-amber-400 font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
