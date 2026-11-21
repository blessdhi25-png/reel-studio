'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { safeReturnPath } from '../../../lib/protectedRoutes';
import { useAuth } from '../../../context/AuthContext';

function GoogleCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // Strict Mode / re-renders must not run the handshake twice
    ran.current = true;
    const token = searchParams.get('token');
    if (!token) {
      router.replace('/login?authError=google_failed');
      return;
    }

    // login() persists the token to localStorage immediately (with a
    // placeholder user) — api.getMe() below reads the token synchronously
    // from localStorage for its Authorization header, so the token has to
    // land there before that call, not after it resolves.
    login(token, { id: null });

    api
      .getMe()
      .then((user) => {
        login(token, user);
        // Session is confirmed by the server and mirrored to storage + cookie; now go where they were headed.
        router.replace(safeReturnPath(searchParams.get('from')));
      })
      .catch((err) => {
        // The server explicitly refused this token (not a network blip): don't keep a dead session
        // that every guard would then bounce — go to /login and say why. Suspended/banned accounts
        // are handled by the lockdown screen, so they continue to '/'.
        if (err?.status === 401) {
          try {
            window.localStorage.removeItem('token');
            window.localStorage.removeItem('user');
          } catch {}
          router.replace('/login?authError=session_rejected');
          return;
        }
        // Token was issued but the profile fetch failed (e.g. transient
        // network hiccup) — the token is still valid, so let the person in
        // and let the rest of the app refetch the user as needed.
        setError('Signed in, but we had trouble loading your profile.');
        router.replace('/');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-white px-6">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 mx-auto rounded-full border-2 border-zinc-700 border-t-amber-500 animate-spin" />
        <p className="text-sm text-zinc-400">{error || 'Signing you in…'}</p>
      </div>
    </main>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={null}>
      <GoogleCallbackInner />
    </Suspense>
  );
}
