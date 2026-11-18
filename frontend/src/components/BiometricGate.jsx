'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { verifyBiometric } from '@/lib/biometrics';

// Upfront security gate. Wrap a sensitive screen (edit profile, change password, account switching)
// and the OS fingerprint / face prompt is raised as soon as the screen is entered — before any of
// its form renders. Cancel or fail and nothing behind the gate is mounted: only a retry / back screen.
//
// Accounts without the biometric lock turned on pass straight through (the server reports
// `required: false`), so this never traps someone who hasn't enrolled.
//
//   <BiometricGate scope="profile" title="Edit account details">…</BiometricGate>
//   <BiometricGate scope="switch" onDenied={close} variant="inline">…</BiometricGate>
export default function BiometricGate({ scope = 'profile', title = 'Verify it’s you', backHref = '/settings', variant = 'page', onDenied, children }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [state, setState] = useState('checking'); // checking | granted | denied
  const [message, setMessage] = useState(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setState('checking');
    setMessage(null);
    const res = await verifyBiometric(user?.id, scope, { reuse: false });
    if (res.verified) {
      setState('granted');
    } else {
      setMessage(res.cancelled ? 'Fingerprint verification was cancelled.' : res.error || 'Verification failed.');
      setState('denied');
    }
  }, [user?.id, scope]);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; one prompt is enough.
    if (!ready || !user?.id || started.current) return;
    started.current = true;
    run();
  }, [ready, user?.id, run]);

  // Signed-out visitors have nothing to protect; the wrapped page's own auth redirect handles them.
  if (state === 'granted' || (ready && !user?.id)) return children;

  const checking = state === 'checking';
  const leave = () => (onDenied ? onDenied() : router.replace(backHref));

  const body = (
    <div role="alertdialog" aria-live="polite" className="w-full max-w-sm mx-auto text-center px-6 py-10">
      <div className={`mx-auto mb-5 w-16 h-16 rounded-full flex items-center justify-center ${checking ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'}`}>
        {checking ? <Loader2 className="w-7 h-7 animate-spin" /> : <Fingerprint className="w-8 h-8" />}
      </div>
      <h1 className="font-sans font-bold text-xl text-slate-900 dark:text-white">{checking ? 'Verifying…' : title}</h1>
      <p className="mt-2 font-sans text-sm text-slate-500 dark:text-neutral-400">
        {checking ? 'Confirm with your fingerprint or screen lock to continue.' : message}
      </p>
      {!checking && (
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={run} className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition">
            Try again
          </button>
          <button type="button" onClick={leave} className="w-full py-3 rounded-xl text-sm font-bold text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition">
            Go back
          </button>
        </div>
      )}
    </div>
  );

  if (variant === 'inline') return body;
  return <div className="min-h-screen bg-white dark:bg-[#0a090e] flex items-center justify-center">{body}</div>;
}
