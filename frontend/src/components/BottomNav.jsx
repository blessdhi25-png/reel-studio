'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useSocketContext } from '../context/SocketContext';

const HIDDEN_ON = ['/welcome', '/login', '/signup', '/verify-email', '/upload'];
// Prefix-matched separately from HIDDEN_ON above: /admin has many
// sub-routes (users, videos, fraud-signals, audit-log, ...) and the admin
// portal has its own dedicated layout/nav (see app/admin/layout.jsx) — the
// user-facing bottom nav has no business appearing underneath it. Root
// layout.jsx always renders <BottomNav /> via AppShell regardless of
// route, so this is the one place that actually can hide it per-path.
//
// '/messages/' (with the trailing slash) matches an open DM thread
// (/messages/abc123) but deliberately not the bare /messages list — the
// redesigned thread view (components/ChatThreadView.jsx) is a full
// h-screen takeover with its own input dock pinned to the true bottom of
// the viewport, which the nav bar would sit on top of / get covered by;
// the conversation list page has room for both and keeps the nav.
const HIDDEN_PREFIXES = ['/admin', '/moderator', '/messages/'];

// Shared with DesktopNav so the two bars are always hidden on exactly the same routes.
export function isNavHidden(pathname) {
  return HIDDEN_ON.includes(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
}

function HomeIcon({ active }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function FriendsIcon({ active }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.5-3 2.5-5 5.5-5s5 2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.5 12c2.4.3 4 2 4.4 4.3" />
    </svg>
  );
}

function InboxIcon({ active }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  );
}

function ProfileIcon({ active }) {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round">
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

  if (isNavHidden(pathname)) return null;

  function go(path, requireAuth = false) {
    if (requireAuth && !isAuthenticated) {
      router.push('/login');
      return;
    }
    router.push(path);
  }

  const isActive = (path) => (path === '/' ? pathname === '/' : pathname.startsWith(path));

  return (
    // Solid black bar with a hard top border — no gradient scrim or shadow. The inline
    // paddingBottom overrides py-2's bottom padding so the bar still grows by the device's
    // home-indicator inset (otherwise the centred + button sits in the iOS swipe-up dead zone).
    <nav
      className="fixed bottom-0 inset-x-0 z-50 lg:hidden bg-black border-t border-neutral-800 py-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-end justify-between px-3 max-w-md mx-auto">
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
          className="relative z-10 flex flex-col items-center justify-center w-14 h-12"
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
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      // w-16 / min-h-[52px] gives a comfortable thumb-sized tap target (the
      // old w-12 was ~48px wide with only the icon+label as the hit area).
      className={`relative flex flex-col items-center justify-center gap-1 w-16 min-h-[52px] py-1 active:scale-95 transition-transform ${
        active ? 'text-white' : 'text-white/80'
      }`}
    >
      <span>{icon}</span>
      <span className="text-[11px] font-extrabold uppercase tracking-wider leading-none">
        {label}
      </span>
      {/* Active marker — colour alone (white vs white/80) is a subtle
          difference, so the selected tab also gets a solid bar. */}
      <span
        aria-hidden="true"
        className={`absolute bottom-0 h-[3px] w-6 rounded-full bg-white ${active ? 'opacity-100' : 'opacity-0'}`}
      />
      {!!badge && (
        <span className="absolute top-0 right-2 bg-reel text-ink rounded-full min-w-[16px] h-[16px] px-[3px] flex items-center justify-center text-[10px] font-bold">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
