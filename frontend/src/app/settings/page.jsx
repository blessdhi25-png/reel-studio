'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  }

  if (!user) return null;

  return (
    <main className="min-h-screen px-6 py-10 max-w-2xl mx-auto pb-20">
      <a href="/menu" className="font-mono text-xs text-smoke uppercase tracking-widest">
        ← Back to menu
      </a>

      <h1 className="font-display text-4xl text-bone tracking-wide mt-8 mb-8">Settings and privacy</h1>

      <div className="space-y-1 mb-8">
        <a
          href="/profile/edit"
          className="w-full flex items-center gap-4 py-4 border-b border-smoke/10 text-left font-body text-bone"
        >
          <span className="text-xl w-6 text-center">👤</span>
          <span className="flex-1">Edit profile</span>
          <span className="text-smoke">›</span>
        </a>
        <div className="w-full flex items-center gap-4 py-4 border-b border-smoke/10 text-left">
          <span className="text-xl w-6 text-center">✉</span>
          <span className="flex-1 flex flex-col">
            <span className="font-body text-bone">Account &amp; Email</span>
            <span className="font-mono text-xs text-smoke mt-0.5">{user.email}</span>
          </span>
        </div>
        <a
          href="/settings/change-password"
          className="w-full flex items-center gap-4 py-4 border-b border-smoke/10 text-left font-body text-bone"
        >
          <span className="text-xl w-6 text-center">🔑</span>
          <span className="flex-1">Change password</span>
          <span className="text-smoke">›</span>
        </a>
        <a
          href="/settings/privacy"
          className="w-full flex items-center gap-4 py-4 border-b border-smoke/10 text-left font-body text-bone"
        >
          <span className="text-xl w-6 text-center">🔒</span>
          <span className="flex-1">Privacy</span>
          <span className="text-smoke">›</span>
        </a>
      </div>

      <button
        onClick={logout}
        className="w-full py-3 font-body text-sm font-semibold rounded-sprocket border border-red-400/50 text-red-400"
      >
        Log out
      </button>
    </main>
  );
}
