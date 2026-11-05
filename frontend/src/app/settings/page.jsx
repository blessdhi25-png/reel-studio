'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, ChevronRight, KeyRound, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { useStaffAccess } from '../../hooks/useStaffAccess';

const ROW =
  'flex items-center justify-between p-4 bg-neutral-900 hover:bg-neutral-800/80 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

function IconBadge({ children, gold = false }) {
  return (
    <span
      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        gold ? 'bg-amber-500/15 text-amber-400' : 'bg-neutral-800 text-neutral-200'
      }`}
    >
      {children}
    </span>
  );
}

// A tappable settings row. `subtitle` is optional secondary text.
function SettingsLink({ href, icon, label, subtitle, gold = false }) {
  return (
    <a href={href} className={ROW}>
      <span className="flex items-center gap-3 min-w-0">
        <IconBadge gold={gold}>{icon}</IconBadge>
        <span className="min-w-0">
          <span className={`block text-base font-semibold ${gold ? 'text-amber-400' : 'text-white'}`}>{label}</span>
          {subtitle && <span className="block text-xs text-neutral-400 mt-0.5 truncate">{subtitle}</span>}
        </span>
      </span>
      <ChevronRight className="w-5 h-5 ml-3 text-neutral-500 shrink-0" strokeWidth={2.5} aria-hidden="true" />
    </a>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-7" aria-label={title}>
      <h2 className="px-1 mb-2 text-xs font-bold uppercase tracking-wider text-neutral-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const { isStaff } = useStaffAccess();

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
    <main className="min-h-screen font-sans px-4 pt-6 pb-24 max-w-2xl mx-auto">
      <a href="/menu" className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
        Back to menu
      </a>

      <h1 className="mt-6 mb-8 text-2xl font-extrabold tracking-tight text-white">Settings and privacy</h1>

      <Section title="Account">
        <SettingsLink href="/profile/edit" icon={<User className="w-5 h-5" strokeWidth={2.25} />} label="Edit profile" />
        {/* There's no separate email page yet, so this row shows the address
            without pretending to navigate anywhere. */}
        <div className="flex items-center gap-3 p-4 bg-neutral-900 rounded-xl">
          <IconBadge>
            <Mail className="w-5 h-5" strokeWidth={2.25} />
          </IconBadge>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-white">Account &amp; Email</span>
            <span className="block text-xs text-neutral-400 mt-0.5 truncate">{user.email}</span>
          </span>
        </div>
        <SettingsLink
          href="/settings/change-password"
          icon={<KeyRound className="w-5 h-5" strokeWidth={2.25} />}
          label="Change password"
        />
      </Section>

      <Section title="Preferences">
        <SettingsLink href="/settings/privacy" icon={<Lock className="w-5 h-5" strokeWidth={2.25} />} label="Privacy" />
        <SettingsLink href="/notifications" icon={<Bell className="w-5 h-5" strokeWidth={2.25} />} label="Notifications" />
      </Section>

      {isStaff && (
        <Section title="Management">
          <SettingsLink
            href="/admin"
            gold
            icon={<ShieldCheck className="w-5 h-5" strokeWidth={2.25} />}
            label="Admin Dashboard"
            subtitle="Moderation, users & reports"
          />
        </Section>
      )}

      <button
        type="button"
        onClick={logout}
        className="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 font-bold py-3.5 rounded-xl border border-red-500/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        Log out
      </button>
    </main>
  );
}
