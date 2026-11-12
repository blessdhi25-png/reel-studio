'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Mail, User, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';
import { isNavHidden } from './BottomNav';
import Logo from './Logo';

// Desktop replacement for the mobile BottomNav (which is `lg:hidden`). Same four
// destinations + Create, so hiding the bottom bar never strands anyone.
function useNavItems() {
  const { user } = useAuth();
  const { unreadCount } = useSocketContext();
  const profileHref = user ? `/profile/${user.id}` : '/login';
  return [
    { label: 'Home', href: '/', Icon: Home, match: (p) => p === '/' },
    { label: 'Friends', href: '/friends', Icon: Users, match: (p) => p.startsWith('/friends') },
    { label: 'Inbox', href: user ? '/notifications' : '/login', Icon: Mail, badge: unreadCount, match: (p) => p.startsWith('/notifications') },
    { label: 'Profile', href: profileHref, Icon: User, match: (p) => user && p === `/profile/${user.id}` },
  ];
}

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1.5 -right-2 bg-amber-500 text-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-extrabold">
      {n > 9 ? '9+' : n}
    </span>
  );
}

/** Compact icon-only row for the feed's own header (lg+ only). */
export function DesktopIconNav() {
  const pathname = usePathname();
  const items = useNavItems();
  const { isAuthenticated } = useAuth();
  return (
    <nav aria-label="Primary" className="hidden lg:flex items-center gap-1">
      {items.filter((i) => i.label !== 'Home').map(({ label, href, Icon, badge, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={label}
            href={href}
            aria-label={label}
            title={label}
            aria-current={active ? 'page' : undefined}
            className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              active ? 'bg-white/15 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={2.5} />
            <Badge n={badge} />
          </Link>
        );
        })}
      <Link
        href={isAuthenticated ? '/upload' : '/login'}
        aria-label="Create"
        title="Create"
        className="w-9 h-9 rounded-lg bg-amber-500 text-black flex items-center justify-center hover:bg-amber-400 transition-colors"
      >
        <Plus className="w-5 h-5" strokeWidth={3.5} />
      </Link>
    </nav>
  );
}

/** Full labelled top bar for every other page on lg+ (the feed has its own header). */
export default function DesktopTopNav() {
  const pathname = usePathname();
  const items = useNavItems();
  const { isAuthenticated } = useAuth();
  if (pathname === '/' || isNavHidden(pathname)) return null;
  return (
    <header className="hidden lg:flex sticky top-0 z-40 h-14 items-center justify-between gap-6 px-6 bg-black text-white border-b border-neutral-800">
      <Link href="/" aria-label="ClipPulse home" className="shrink-0">
        <Logo size="sm" showText />
      </Link>
      <nav aria-label="Primary" className="flex items-center gap-1">
        {items.map(({ label, href, Icon, badge, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-extrabold tracking-tight transition-colors ${
                active ? 'bg-white/15 text-white' : 'text-zinc-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" strokeWidth={2.5} />
                <Badge n={badge} />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
      <Link
        href={isAuthenticated ? '/upload' : '/login'}
        className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-extrabold tracking-tight transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={3.5} /> Create
      </Link>
    </header>
  );
}
