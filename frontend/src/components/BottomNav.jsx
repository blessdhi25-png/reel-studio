'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';

const HIDDEN_ON = ['/login', '/signup', '/verify-email', '/upload'];
// Prefix-matched separately from HIDDEN_ON above: /admin has many
// sub-routes (users, videos, fraud-signals, audit-log, ...) and the admin
// portal has its own dedicated layout/nav (see app/admin/layout.jsx) — the
// user-facing bottom nav has no business appearing underneath it. Root
// layout.jsx always renders <BottomNav /> via AppShell regardless of
// route, so this is the one place that actually can hide it per-path.
const HIDDEN_PREFIXES = ['/admin'];

function HomeIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function FriendsIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.5-3 2.5-5 5.5-5s5 2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.5 12c2.4.3 4 2 4.4 4.3" />
    </svg>
  );
}

function InboxIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  );
}

function ProfileIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6" />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  // Previously this component re-read localStorage.getItem('user') on every
  // pathname change as a workaround for having no reactive auth state —
  // that only ever caught auth changes that happened to coincide with a
  // navigation, not ones that happened on the current page (logging in via
  // a modal, a token expiring mid-session, etc.). useAuth() is reactive to
  // all of those.
  const { user, isAuthenticated } = useAuth();
  // Single source of truth for the unread badge — SocketContext owns the
  // fetch-on-login + live notification:new increments centrally now, so
  // this no longer needs its own copy of that logic (it used to duplicate
  // it here, independently from the notifications page).
  const { unreadCount } = useSocketContext();

  if (HIDDEN_ON.includes(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  function go(path, requireAuth = false) {
    if (requireAuth && !isAuthenticated) {
      router.push('/login');
      return;
    }
    router.push(path);
  }

  const isActive = (path) => (path === '/' ? pathname === '/' : pathname.startsWith(path));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      {/* gradient scrim so icons stay legible over video */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/90 to-transparent h-24 -top-4" />
      {/* pb combines a base gap with the device's home-indicator/gesture-bar
          inset, so no button (especially the centered + post button, which
          sits right where iOS's swipe-up-home gesture lives) ends up in that
          dead zone where taps get eaten by the OS instead of us. */}
      <div
        className="relative pointer-events-auto flex items-end justify-between px-3 pt-2 max-w-md mx-auto"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <NavItem
          label="Home"
          active={isActive('/')}
          onClick={() => go('/')}
          icon={<HomeIcon active={isActive('/')} />}
        />
        <NavItem
          label="Friends"
          active={isActive('/friends')}
          onClick={() => go('/friends')}
          icon={<FriendsIcon active={isActive('/friends')} />}
        />
        <button
          onClick={() => go('/upload', true)}
          className="relative z-10 flex flex-col items-center justify-center w-12 h-11"
          aria-label="Upload"
        >
          <span className="w-11 h-8 flex items-center justify-center rounded-sprocket bg-reel text-ink font-display text-2xl border border-reel2 pointer-events-none">
            +
          </span>
        </button>
        <NavItem
          label="Inbox"
          active={isActive('/notifications')}
          onClick={() => go('/notifications', true)}
          icon={<InboxIcon active={isActive('/notifications')} />}
          badge={unreadCount}
        />
        <NavItem
          label="Profile"
          active={pathname.startsWith('/profile') && user ? pathname === `/profile/${user.id}` : false}
          onClick={() => go(user ? `/profile/${user.id}` : '/login')}
          icon={<ProfileIcon active={pathname === `/profile/${user?.id}`} />}
        />
      </div>
    </nav>
  );
}

function NavItem({ label, icon, active, onClick, badge }) {
  return (
    <button onClick={onClick} className="relative flex flex-col items-center gap-1 w-12">
      <span className={active ? 'text-reel' : 'text-smoke'}>{icon}</span>
      <span className={`font-mono text-[9px] uppercase tracking-widest ${active ? 'text-reel' : 'text-smoke'}`}>
        {label}
      </span>
      {!!badge && (
        <span className="absolute -top-1 right-1 bg-reel text-ink rounded-full min-w-[14px] h-[14px] px-[3px] flex items-center justify-center text-[9px] font-mono">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
