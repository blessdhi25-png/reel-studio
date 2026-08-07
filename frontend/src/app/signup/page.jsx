'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, googleAuthUrl } from '../../lib/api';
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

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const STRENGTH_LABELS = ['Weak', 'Fair', 'Strong', 'Excellent'];
const STRENGTH_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500'];

function calculateAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    email: '',
    dob: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [ageError, setAgeError] = useState(null);
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const passedRules = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(form.password) })),
    [form.password]
  );
  const strengthScore = passedRules.filter((r) => r.passed).length;
  const strengthLabel = form.password ? STRENGTH_LABELS[Math.max(strengthScore - 1, 0)] : '';
  const strengthColor = STRENGTH_COLORS[Math.max(strengthScore - 1, 0)];

  function goToStep2(e) {
    e.preventDefault();
    setError(null);
    if (!form.username.trim() || !form.email.trim()) {
      setError('Username and email are required.');
      return;
    }
    const email = form.email.trim();
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }
    setStep(2);
  }

  function handleGoogleClick() {
    window.location.href = googleAuthUrl();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setAgeError(null);

    const age = calculateAge(form.dob);
    if (!form.dob || age === null) {
      setAgeError('Please enter your date of birth.');
      return;
    }
    if (age < 13) {
      setAgeError('You must be at least 13 years old to create an account.');
      return;
    }
    if (strengthScore < PASSWORD_RULES.length) {
      setError('Your password needs to meet all the criteria below.');
      return;
    }
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      await api.register({
        username: form.username,
        displayName: form.displayName,
        email: form.email,
        password: form.password,
        dob: form.dob,
      });
      router.push(`/verify-email?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      // api.js already turns a raw fetch failure (wrong host, backend down,
      // CORS block, etc.) into this exact message and logs the attempted
      // URL to the console — so on mobile/ngrok testing, opening devtools
      // shows precisely which URL failed instead of just "Failed to fetch".
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-zinc-950 text-white overflow-hidden">
      <AuthHero />

      <div className="lg:col-span-5 w-full max-w-md mx-auto p-6 sm:p-8 flex flex-col justify-center min-h-screen lg:min-h-0">
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold">Create your account</h2>
          <p className="text-zinc-400 text-sm mt-1">Join Reel and start building your audience.</p>
        </div>

        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mb-2">
            <span className={step === 1 ? 'text-amber-400' : 'text-zinc-500'}>
              Step 1: Account Details
            </span>
            <span className="text-zinc-700">→</span>
            <span className={step === 2 ? 'text-amber-400' : 'text-zinc-500'}>
              Step 2: Security &amp; Age
            </span>
          </div>
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>
        </div>

        {step === 1 && (
          <>
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

            <form onSubmit={goToStep2} className="space-y-3">
              <input
                value={form.username}
                onChange={update('username')}
                placeholder="Username"
                required
                className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-amber-500 placeholder-zinc-600"
              />
              <input
                value={form.displayName}
                onChange={update('displayName')}
                placeholder="Display name (optional)"
                className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-amber-500 placeholder-zinc-600"
              />
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                placeholder="Email"
                required
                className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-amber-500 placeholder-zinc-600"
              />

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg"
              >
                Continue
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Date of Birth
              </label>
              <input
                type="date"
                value={form.dob}
                onChange={update('dob')}
                required
                className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-4 py-3 outline-none focus:border-amber-500 [color-scheme:dark]"
              />
            </div>

            {ageError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
                {ageError}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={update('password')}
                  placeholder="Create a password"
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

              {form.password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${
                          i < strengthScore ? strengthColor : 'bg-zinc-800'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{strengthLabel}</p>
                </div>
              )}

              <ul className="mt-3 space-y-1.5">
                {passedRules.map((rule) => (
                  <li key={rule.key} className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                        rule.passed ? 'bg-green-500 text-black' : 'bg-zinc-800 text-zinc-600'
                      }`}
                    >
                      {rule.passed ? '✓' : ''}
                    </span>
                    <span className={rule.passed ? 'text-zinc-300' : 'text-zinc-500'}>{rule.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-zinc-400 pt-1">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span>
                I agree to the{' '}
                <Link href="/terms" className="text-amber-400 hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-amber-400 hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-3.5 rounded-xl border border-zinc-800 text-zinc-300 text-sm font-semibold hover:bg-zinc-900 transition-all"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl transition-all shadow-lg disabled:opacity-50"
              >
                {loading ? 'Creating account…' : 'Complete Registration'}
              </button>
            </div>
          </form>
        )}

        <p className="text-sm text-zinc-400 mt-6 text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-amber-400 font-semibold hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
