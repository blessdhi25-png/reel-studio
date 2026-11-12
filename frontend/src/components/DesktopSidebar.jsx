'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Home, Compass, UserCheck, Users, Radio, Bell, PlusSquare, User, MoreHorizontal, Search, List } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';
import { api } from '../lib/api';
import { isNavHidden } from './BottomNav';

// Persistent desktop navigation (lg+ only; the mobile BottomNav is `lg:hidden`).
// Hidden on exactly the same routes as BottomNav. AppShell pads the page by w-64.
export const SIDEBAR_WIDTH_CLASS = 'lg:pl-64';

function BrandMark() {
  return (
    <span className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 7.5v9l7-4.5-7-4.5Z" fill="currentColor" />
        <path d="M2.5 12h3l1.5-3.5L9 15l1.5-3" opacity="0" />
        <path d="M1.5 12H4M20 12h2.5" />
      </svg>
    </span>
  );
}

function SidebarInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const { unreadCount } = useSocketContext();
  const [q, setQ] = useState('');
  const [following, setFollowing] = useState([]);

  useEffect(() => {
    if (!user?.id) {
      setFollowing([]);
      return;
    }
    let cancelled = false;
    api
      .getFollowing(user.id)
      .then((list) => !cancelled && setFollowing(Array.isArray(list) ? list.slice(0, 6) : []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const onFollowingTab = pathname === '/' && searchParams.get('tab') === 'following';
  const authed = (href) => (isAuthenticated ? href : '/login');
  const items = [
    { label: 'For You', href: '/', Icon: Home, active: pathname === '/' && !onFollowingTab },
    { label: 'Explore', href: '/search', Icon: Compass, active: pathname.startsWith('/search') },
    { label: 'Following', href: authed('/?tab=following'), Icon: UserCheck, active: onFollowingTab },
    { label: 'Friends', href: authed('/friends'), Icon: Users, active: pathname.startsWith('/friends') },
    { label: 'LIVE', href: '/live', Icon: Radio, active: pathname.startsWith('/live') },
    { label: 'Activity', href: authed('/notifications'), Icon: Bell, active: pathname.startsWith('/notifications'), badge: unreadCount },
    { label: 'Upload', href: authed('/upload'), Icon: PlusSquare, active: false },
    { label: 'Profile', href: user ? `/profile/${user.id}` : '/login', Icon: User, active: !!user && pathname === `/profile/${user.id}` },
    { label: 'More', href: '/menu', Icon: MoreHorizontal, active: pathname.startsWith('/menu') },
  ];

  function onSearch(e) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  return (
    <aside
      aria-label="Sidebar"
      className="hidden lg:flex flex-col w-64 fixed left-0 top-0 h-screen bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800 p-4 z-40 overflow-y-auto text-black dark:text-white"
    >
      <Link href="/" className="flex items-center gap-2.5 px-1 mb-4" aria-label="ClipPulse home">
        <BrandMark />
        <span className="text-xl font-extrabold tracking-tight">ClipPulse</span>
      </Link>

      <form onSubmit={onSearch} role="search" className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" strokeWidth={2.5} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          placeholder="Search"
          aria-label="Search"
          className="w-full h-10 pl-10 pr-3 rounded-full bg-neutral-100 dark:bg-neutral-900 text-sm font-bold text-black dark:text-white placeholder-neutral-500 outline-none focus:ring-2 focus:ring-amber-500/60"
        />
      </form>

      <nav aria-label="Primary" className="flex flex-col gap-0.5">
        {items.map(({ label, href, Icon, active, badge }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-base font-extrabold tracking-tight transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
              active ? 'text-amber-600 dark:text-amber-400' : 'text-black dark:text-white'
            }`}
          >
            <span className="relative">
              <Icon className="w-6 h-6" strokeWidth={active ? 3 : 2.5} />
              {!!badge && (
                <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-extrabold flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            {label}
          </Link>
        ))}
      </nav>

      {following.length > 0 && (
        <section aria-label="Following accounts" className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <h2 className="px-3 mb-2 text-sm font-extrabold tracking-tight text-neutral-500">Following accounts</h2>
          <ul className="flex flex-col gap-0.5">
            {following.map((f) => (
              <li key={f.id}>
                <Link href={`/profile/${f.id}`} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                  <span className="w-8 h-8 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 shrink-0 flex items-center justify-center text-xs font-extrabold text-amber-600">
                    {f.avatarUrl ? <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" /> : f.username?.[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold tracking-tight truncate">{f.displayName || f.username}</span>
                    <span className="block text-xs font-bold text-neutral-500 truncate">@{f.username}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/friends" className="flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-sm font-extrabold tracking-tight text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <List className="w-4 h-4" strokeWidth={2.5} /> View all
          </Link>
        </section>
      )}
    </aside>
  );
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  if (isNavHidden(pathname)) return null;
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <SidebarInner />
    </Suspense>
  );
}

/** True when the sidebar is visible on this route (AppShell uses it to pad the page). */
export function sidebarShownFor(pathname) {
  return !isNavHidden(pathname);
}
