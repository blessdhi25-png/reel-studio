'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Home, Compass, UserCheck, Users, Radio, Bell, MessageCircle, PlusSquare, User, MoreHorizontal, Search, List } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';
import { api } from '../lib/api';
import { isNavHidden } from './BottomNav';
import DesktopDrawer from './DesktopDrawers';

// Persistent desktop navigation (lg+ only; the mobile BottomNav is `lg:hidden`).
// Hidden on exactly the same routes as BottomNav. AppShell pads the page by w-64.
// /upload is hidden for the mobile bar but gets the sidebar on desktop (its landing page is a normal page there).
export const SIDEBAR_PAD_CLASS = 'lg:pl-20 xl:pl-64';

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
  const [drawer, setDrawer] = useState(null); // null | 'messages' | 'activity' | 'more'
  const [messageUnread, setMessageUnread] = useState(0);

  // A navigation always closes an open drawer.
  useEffect(() => setDrawer(null), [pathname]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    api
      .getConversations()
      .then((c) => !cancelled && setMessageUnread((Array.isArray(c) ? c : []).reduce((n, t) => n + (t.unreadCount || 0), 0)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id, drawer]);

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
  const toggleDrawer = (id) => () => (isAuthenticated || id === 'more' ? setDrawer((d) => (d === id ? null : id)) : router.push('/login'));
  const items = [
    { label: 'For You', href: '/', Icon: Home, active: pathname === '/' && !onFollowingTab },
    { label: 'Explore', href: '/search', Icon: Compass, active: pathname.startsWith('/search') },
    { label: 'Following', href: authed('/?tab=following'), Icon: UserCheck, active: onFollowingTab },
    { label: 'Friends', href: authed('/friends'), Icon: Users, active: pathname.startsWith('/friends') },
    { label: 'LIVE', href: '/live', Icon: Radio, active: pathname.startsWith('/live') },
    { label: 'Messages', onClick: toggleDrawer('messages'), Icon: MessageCircle, active: drawer === 'messages', badge: messageUnread },
    { label: 'Activity', onClick: toggleDrawer('activity'), Icon: Bell, active: drawer === 'activity', badge: unreadCount },
    { label: 'Upload', href: authed('/upload'), Icon: PlusSquare, active: pathname === '/upload' },
    { label: 'Profile', href: user ? `/profile/${user.id}` : '/login', Icon: User, active: !!user && pathname === `/profile/${user.id}` },
    { label: 'More', onClick: toggleDrawer('more'), Icon: MoreHorizontal, active: drawer === 'more' },
  ];

  function onSearch(e) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  const itemClass = (active) =>
    `flex items-center justify-center xl:justify-start gap-3 px-3 py-2.5 rounded-xl text-base font-extrabold tracking-tight transition-colors hover:bg-neutral-900 ${
      active ? 'text-amber-400' : 'text-white'
    }`;

  return (
    <>
      <aside
        aria-label="Sidebar"
        className="hidden lg:flex flex-col w-20 xl:w-64 fixed left-0 top-0 h-screen bg-black border-r border-neutral-800 z-40 p-3 text-white overflow-y-auto"
      >
        <Link href="/" className="flex items-center justify-center xl:justify-start gap-2.5 xl:px-1 mb-4" aria-label="ClipPulse home">
          <BrandMark />
          <span className="hidden xl:inline text-xl font-extrabold tracking-tight">ClipPulse</span>
        </Link>

        <form onSubmit={onSearch} role="search" className="relative mb-3 hidden xl:block">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" strokeWidth={2.5} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Search"
            aria-label="Search"
            className="w-full h-10 pl-10 pr-3 rounded-full bg-neutral-900 text-sm font-bold text-white placeholder-neutral-500 outline-none focus:ring-2 focus:ring-amber-500/60"
          />
        </form>
        <Link href="/search" aria-label="Search" title="Search" className="xl:hidden mb-3 mx-auto w-11 h-11 rounded-full bg-neutral-900 flex items-center justify-center hover:bg-neutral-800">
          <Search className="w-5 h-5" strokeWidth={2.5} />
        </Link>

        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {items.map(({ label, href, onClick, Icon, active, badge }) => {
            const inner = (
              <>
                <span className="relative">
                  <Icon className="w-6 h-6" strokeWidth={active ? 3 : 2.5} />
                  {!!badge && (
                    <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-extrabold flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="hidden xl:inline">{label}</span>
              </>
            );
            return onClick ? (
              <button
                key={label}
                type="button"
                onClick={onClick}
                aria-haspopup="dialog"
                aria-expanded={active}
                aria-label={label}
                title={label}
                className={`${itemClass(active)} w-full text-left`}
              >
                {inner}
              </button>
            ) : (
              <Link key={label} href={href} aria-current={active ? 'page' : undefined} aria-label={label} title={label} className={itemClass(active)}>
                {inner}
              </Link>
            );
          })}
        </nav>

        {following.length > 0 && (
          <section aria-label="Following accounts" className="hidden xl:block mt-4 pt-4 border-t border-neutral-800">
            <h2 className="px-3 mb-2 text-sm font-extrabold tracking-tight text-neutral-500">Following accounts</h2>
            <ul className="flex flex-col gap-0.5">
              {following.map((f) => (
                <li key={f.id}>
                  <Link href={`/profile/${f.id}`} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-neutral-900 transition-colors">
                    <span className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 shrink-0 flex items-center justify-center text-xs font-extrabold text-amber-400">
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
            <Link href="/friends" className="flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-sm font-extrabold tracking-tight text-neutral-300 hover:bg-neutral-900">
              <List className="w-4 h-4" strokeWidth={2.5} /> View all
            </Link>
          </section>
        )}
      </aside>
      <DesktopDrawer which={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

export default function DesktopSidebar() {
  const pathname = usePathname();
  if (!sidebarShownFor(pathname)) return null;
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <SidebarInner />
    </Suspense>
  );
}

/** True when the sidebar is visible on this route (AppShell uses it to pad the page). */
export function sidebarShownFor(pathname) {
  return pathname === '/upload' || !isNavHidden(pathname);
}
