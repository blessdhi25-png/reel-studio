'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '../../lib/api';
import Logo from '../../components/Logo';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/moderation', label: 'Moderation Queue', icon: '🎬' },
  { href: '/admin/reports', label: 'Moderation Reports', icon: '🚩' },
  { href: '/admin/users', label: 'User Management', icon: '👥' },
  { href: '/admin/videos', label: 'Video Queue', icon: '🎥' },
  { href: '/admin/fraud-signals', label: 'Fraud & Risk Signals', icon: '🛡️' },
  { href: '/admin/audit-log', label: 'System Audit Logs', icon: '📋' },
];

function isActiveHref(pathname, href) {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState('checking'); // checking | ok | denied
  const [me, setMe] = useState(null);
  const [sysStatus, setSysStatus] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    api
      .adminMe()
      .then((m) => {
        setMe(m);
        setStatus('ok');
      })
      .catch(() => setStatus('denied'));
  }, [router]);

  useEffect(() => {
    if (status !== 'ok') return;
    const load = () => api.adminGetStatus().then(setSysStatus).catch(() => {});
    load();
    const interval = setInterval(load, 30000); // keep the status strip roughly live
    return () => clearInterval(interval);
  }, [status]);

  function handleSearch(e) {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/admin/reports?q=${encodeURIComponent(q)}` : '/admin/reports');
  }

  if (status === 'checking') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a090e]">
        <p className="font-body text-zinc-400">Checking access…</p>
      </main>
    );
  }

  if (status === 'denied') {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center bg-[#0a090e]">
        <div>
          <p className="font-display text-3xl text-white tracking-wide mb-2">Not authorized</p>
          <p className="font-body text-zinc-400 text-sm mb-6">
            This area is restricted to the moderation team.
          </p>
          <a href="/" className="font-body text-sm text-amber-400">
            Back to feed
          </a>
        </div>
      </main>
    );
  }

  const activeItem = NAV_ITEMS.find((item) => isActiveHref(pathname, item.href));

  return (
    <div className="min-h-screen bg-[#0a090e] flex">
      {/* Persistent sidebar — desktop only, collapses to a horizontal scroller below md */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-[#0a090e]">
        <div className="px-5 py-5 border-b border-zinc-800">
          <Logo size="sm" showText={false} className="mb-3" />
          <p className="font-display text-lg text-white tracking-wide">Trust &amp; Safety</p>
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
            Admin Portal
          </p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActiveHref(pathname, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-body text-sm transition-colors ${
                  active
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-zinc-800">
          <a
            href="/"
            className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-zinc-500 hover:text-white uppercase tracking-widest"
          >
            ← Exit to app
          </a>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar — breadcrumb, status indicators, global search, quick exit */}
        <header className="h-16 shrink-0 border-b border-zinc-800 bg-[#0a090e]/80 backdrop-blur-md flex items-center gap-3 md:gap-5 px-4 md:px-6">
          <span className="md:hidden font-display text-base text-white shrink-0">T&amp;S</span>

          {/* Breadcrumb — desktop only; the mobile horizontal nav below
              already communicates "where am I" at that width. */}
          <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-1.5 font-mono text-xs shrink-0">
            <a href="/admin" className="text-zinc-500 hover:text-zinc-300">
              Admin
            </a>
            {activeItem && activeItem.href !== '/admin' && (
              <>
                <span className="text-zinc-700">/</span>
                <span className="text-zinc-300">{activeItem.label}</span>
              </>
            )}
          </nav>

          <form onSubmit={handleSearch} className="flex-1 max-w-sm">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports, users, targets…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500/50"
            />
          </form>

          <div className="hidden lg:flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest shrink-0">
            <span
              className={`flex items-center gap-1.5 ${
                sysStatus?.queueStatus === 'healthy' ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  sysStatus?.queueStatus === 'healthy' ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'
                }`}
              />
              Queue Status: {sysStatus ? (sysStatus.queueStatus === 'healthy' ? 'Healthy' : 'Backlogged') : '—'}
            </span>
            <span className="text-zinc-500">
              Active Moderators: {sysStatus?.moderatorCount ?? '—'}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {me?.role && (
              <span className="hidden sm:inline font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                {me.role}
              </span>
            )}
            <a
              href="/"
              className="font-body text-xs font-semibold text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              Exit
            </a>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 border-b border-zinc-800 bg-[#0a090e]">
          {NAV_ITEMS.map((item) => {
            const active = isActiveHref(pathname, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase tracking-widest whitespace-nowrap border ${
                  active ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'text-zinc-400 border-zinc-800'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Mobile-only status strip, since the top bar hides it below lg */}
        <div className="lg:hidden flex items-center gap-4 px-4 py-2 border-b border-zinc-800 bg-[#0a090e] font-mono text-[10px] uppercase tracking-widest">
          <span className={sysStatus?.queueStatus === 'healthy' ? 'text-emerald-400' : 'text-red-400'}>
            Queue: {sysStatus ? (sysStatus.queueStatus === 'healthy' ? 'Healthy' : 'Backlogged') : '—'}
          </span>
          <span className="text-zinc-500">Mods: {sysStatus?.moderatorCount ?? '—'}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
