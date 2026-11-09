'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Compass } from 'lucide-react';
import { ClipPulseMark } from '@/components/ClipPulseLogo';
import { hasToken, markWelcomeSeen } from '@/lib/onboarding';

// First screen for a fresh install (the feed redirects here when there's no session and the welcome
// hasn't been seen). Routes in this codebase are /signup and /login.
export default function WelcomePage() {
  const router = useRouter();

  // Already signed in? Nothing to introduce — straight to the feed.
  useEffect(() => {
    if (hasToken()) router.replace('/');
  }, [router]);

  function continueAsGuest() {
    markWelcomeSeen({ guest: true });
    router.replace('/');
  }

  return (
    <main className="min-h-dvh bg-white text-black dark:bg-ink dark:text-white flex flex-col items-center justify-between px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm flex-1 flex flex-col items-center justify-center text-center">
        <ClipPulseMark size={88} animated />
        <h1 className="mt-6 text-5xl font-extrabold tracking-tight">ClipPulse</h1>
        <p className="mt-3 text-lg font-bold text-neutral-800 dark:text-neutral-200">
          Create, Share &amp; Discover Short-Form Videos
        </p>
        <p className="mt-8 text-base font-semibold text-neutral-700 dark:text-neutral-300">
          Welcome to your new creative universe
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        <Link
          href="/signup"
          onClick={() => markWelcomeSeen()}
          className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-4 rounded-2xl shadow-xl w-full flex items-center justify-center gap-2"
        >
          Create Account / Sign Up <ArrowRight className="w-5 h-5" aria-hidden="true" strokeWidth={3} />
        </Link>
        <Link
          href="/login"
          onClick={() => markWelcomeSeen()}
          className="w-full py-4 rounded-2xl border-2 border-black dark:border-white text-black dark:text-white font-extrabold flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Log In
        </Link>
        <button
          type="button"
          onClick={continueAsGuest}
          className="w-full py-3 rounded-2xl text-neutral-800 dark:text-neutral-200 font-bold flex items-center justify-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <Compass className="w-4 h-4" aria-hidden="true" /> Continue as Guest
        </button>
        <p className="text-center text-xs font-semibold text-neutral-600 dark:text-neutral-400 mt-1">
          Guests can watch and explore. Sign up to like, comment, follow and post.
        </p>
      </div>
    </main>
  );
}
