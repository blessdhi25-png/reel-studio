'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import StaffDashboard from '@/components/staff/StaffDashboard';

// Moderator portal. Two layers of access control: middleware.js bounces
// visitors without a moderator/admin role cookie before this loads (UX only),
// and every /moderation/* API call re-checks the role from the database on the
// server — that is the real boundary.
export default function ModeratorPage() {
  const router = useRouter();
  const { user, ready, isAuthenticated } = useAuth();
  const [role, setRole] = useState(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace('/login?from=/moderator');
  }, [ready, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // /admin/me is admin-only, so ask the staff API itself: a 403 means "not staff".
    api
      .moderationStats()
      .then(() => setRole(user?.role || 'moderator'))
      .catch(() => setDenied(true));
  }, [isAuthenticated, user?.role]);

  if (!ready || !isAuthenticated) return null;

  if (denied) {
    return (
      <main className="min-h-dvh bg-white text-slate-900 flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-3xl font-black tracking-tight mb-2">Not authorized</p>
          <p className="text-sm font-semibold text-slate-500 mb-6">This area is for ClipPulse moderators and admins.</p>
          <Link href="/" className="text-sm font-extrabold text-amber-600">Back to feed</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center text-amber-500 font-black">C</span>
            <div className="leading-tight">
              <p className="text-sm font-black tracking-tight">Trust &amp; Safety</p>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Moderator portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user?.username && <span className="hidden sm:inline text-xs font-bold text-slate-500">@{user.username}</span>}
            {role === 'admin' && (
              <Link href="/admin" className="text-xs font-extrabold text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-100">
                Admin
              </Link>
            )}
            <Link href="/" className="text-xs font-extrabold text-white bg-black rounded-lg px-3 py-1.5">Exit</Link>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {role ? <StaffDashboard mode="moderator" theme="light" viewerRole={role} /> : <p className="text-sm font-bold text-slate-500">Checking access…</p>}
      </main>
    </div>
  );
}
