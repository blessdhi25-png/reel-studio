'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

// ── Data ─────────────────────────────────────────────────────────────────
// Every href here is a real route in this app. "Activity" deep-links into
// the existing Liked/Saved tabs on the profile page rather than a
// standalone page, since that's the only place that data actually lives —
// there's no watch-history or comment-history endpoint yet, so those
// aren't listed as things this can do.
const CATEGORIES = [
  {
    key: 'wallet',
    title: 'Monetization & wallet',
    icon: WalletIcon,
    items: [
      {
        key: 'earnings',
        icon: '💳',
        title: 'Balance & earnings',
        description: 'Tip payouts, transaction history, and withdrawals',
        href: '/earnings',
        badge: 'balance',
      },
      {
        key: 'studio',
        icon: '⭐',
        title: 'Creator studio',
        description: 'Analytics, video performance, and monetization',
        href: '/studio',
        badge: 'new',
      },
    ],
  },
  {
    key: 'personal',
    title: 'Personal & account',
    icon: UserIcon,
    items: [
      {
        key: 'activity',
        icon: '🕐',
        title: 'Activity centre',
        description: 'Videos you\u2019ve liked and saved',
        hrefFn: (userId) => `/profile/${userId}?tab=liked`,
      },
      {
        key: 'offline',
        icon: '⬇',
        title: 'Offline videos',
        description: 'Manage videos saved for offline playback',
        href: '/offline',
      },
      {
        key: 'qr',
        icon: '▦',
        title: 'Your QR code',
        description: 'Share your profile with a scannable card',
        href: '/menu/qr',
      },
    ],
  },
  {
    key: 'growth',
    title: 'Creation & growth',
    icon: RocketIcon,
    items: [
      {
        key: 'promote',
        icon: '🔥',
        title: 'Promote a post',
        description: 'Boost a video\u2019s reach with a paid campaign',
        href: '/promote',
      },
      {
        key: 'circles',
        icon: '◎',
        title: 'Topic circles',
        description: 'Browse and jump into micro-communities',
        href: '/circles',
      },
    ],
  },
  {
    key: 'preferences',
    title: 'Preferences & privacy',
    icon: ShieldIcon,
    items: [
      {
        key: 'privacy',
        icon: '⚙',
        title: 'Settings & privacy',
        description: 'Private account, blocking, and who can contact you',
        href: '/settings/privacy',
      },
    ],
  },
];

function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

export default function MenuPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [query, setQuery] = useState('');
  const [balanceCents, setBalanceCents] = useState(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  useEffect(() => {
    api.getEarnings().then((d) => setBalanceCents(d.totalCents)).catch(() => {});
  }, []);

  // Scoped to this page only — flips a class on <html> that only the
  // dark:-prefixed utilities below respond to, so nothing elsewhere in the
  // app (which doesn't use dark: classes) is affected.
  useEffect(() => {
    const stored = localStorage.getItem('menuTheme');
    const isDark = stored ? stored === 'dark' : true;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    return () => document.documentElement.classList.remove('dark');
  }, []);

  function toggleTheme() {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('menuTheme', next ? 'dark' : 'light');
      return next;
    });
  }

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [query]);

  if (!user) return null;

  return (
    <div className="dark:bg-zinc-950 dark:text-zinc-100 bg-white text-zinc-900 min-h-screen w-full transition-colors">
      {/* ── Header ── */}
      <div className="dark:bg-zinc-950/90 dark:border-zinc-800 bg-white/90 border-zinc-200 border-b backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Link
              href={`/profile/${user.id}`}
              aria-label="Back to profile"
              className="dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 bg-zinc-100 border-zinc-200 text-zinc-600 border rounded-xl w-9 h-9 flex items-center justify-center shrink-0 hover:border-amber-500/60 hover:text-amber-500 transition-colors"
            >
              <BackIcon />
            </Link>
            <div className="min-w-0">
              <h1 className="font-display text-2xl md:text-3xl tracking-wide truncate">Menu & Settings</h1>
              <p className="dark:text-zinc-500 text-zinc-500 text-xs font-mono uppercase tracking-widest">
                @{user.username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 md:w-80 shrink-0">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 dark:text-zinc-500 text-zinc-400">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu…"
                className="w-full dark:bg-zinc-900 dark:border-zinc-800 dark:text-white dark:placeholder-zinc-500 bg-zinc-100 border-zinc-200 text-zinc-900 placeholder-zinc-400 border rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <ThemeToggle dark={dark} onToggle={toggleTheme} />
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto p-6 md:p-10">
        {filteredCategories.map((cat) => (
          <div
            key={cat.key}
            className="dark:bg-zinc-900/60 dark:border-zinc-800/80 dark:hover:border-zinc-700 bg-zinc-50 border-zinc-200 hover:border-zinc-300 border rounded-2xl p-5 transition-all shadow-xl"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-500">
                <cat.icon />
              </span>
              <h2 className="font-body font-bold text-sm uppercase tracking-widest dark:text-white text-zinc-900">
                {cat.title}
              </h2>
            </div>

            <div className="space-y-1">
              {cat.items.map((item) => (
                <MenuRow key={item.key} item={item} userId={user.id} balanceCents={balanceCents} />
              ))}
            </div>
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <p className="dark:text-zinc-500 text-zinc-500 text-sm col-span-full text-center py-12">
            Nothing matches "{query}".
          </p>
        )}
      </div>
    </div>
  );
}

function MenuRow({ item, userId, balanceCents }) {
  const href = item.hrefFn ? item.hrefFn(userId) : item.href;

  let badge = null;
  if (item.badge === 'balance') {
    badge = balanceCents != null ? formatCents(balanceCents) : null;
  } else if (item.badge === 'new') {
    badge = 'New';
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 rounded-xl transition-colors dark:hover:bg-zinc-800/50 hover:bg-zinc-100"
    >
      <span className="dark:bg-zinc-800/80 dark:border-zinc-700/50 bg-white border-zinc-200 text-amber-500 border p-2.5 rounded-xl text-lg leading-none shrink-0">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium dark:text-white text-zinc-900 text-sm">{item.title}</span>
        <span className="block dark:text-zinc-400 text-zinc-500 text-xs truncate">{item.description}</span>
      </span>
      {badge ? (
        <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
          {badge}
        </span>
      ) : (
        <span className="shrink-0 dark:text-zinc-600 text-zinc-400">
          <ChevronRightIcon />
        </span>
      )}
    </Link>
  );
}

function ThemeToggle({ dark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={dark}
      aria-label="Toggle dark or light mode"
      className="relative w-12 h-7 rounded-full shrink-0 transition-colors dark:bg-zinc-800 bg-zinc-200 border dark:border-zinc-700 border-zinc-300"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-transform ${
          dark ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
        }`}
      >
        {dark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c3 2 5 6 4 12l-4 4-4-4c-1-6 1-10 4-12Z" />
      <circle cx="12" cy="9" r="1.6" />
      <path d="M8 16c-2 1-3 3-3 5 2 0 4-1 5-3M16 16c2 1 3 3 3 5-2 0-4-1-5-3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4.5 6v6c0 5 3.5 7.5 7.5 9 4-1.5 7.5-4 7.5-9V6L12 3Z" />
    </svg>
  );
}
