// Screens that only make sense for a signed-in person. Used in three places so they can't drift:
//   - middleware.js        redirects cookie-less requests to /login and marks the response no-store
//   - next.config.js       adds Cache-Control: no-store to these routes
//   - components/AppShell  client-side guard (covers bfcache restores and cross-tab sign-outs)
// The public feed, profiles, search, live viewing and legal pages are deliberately not listed:
// guests can browse those.
export const PROTECTED_PREFIXES = [
  '/settings',
  '/messages',
  '/upload',
  '/studio',
  '/notifications',
  '/earnings',
  '/analytics',
  '/promote',
  '/collections',
  '/friends',
  '/profile/edit',
  '/admin',
  '/moderator',
];

// Routes that must ALWAYS render without a session and must never be a redirect target's source:
// sign-in / recovery screens, the welcome intro, policy pages, invite-style public pages and Next/static internals.
// A redirect to /login from any of these would send the browser straight back to itself.
export const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/register',
  '/welcome',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/recover',
  '/legal',
  '/offline',
  '/api',
  '/_next',
];

export function isPublicPath(pathname = '') {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Same-site path that is safe to send someone back to after sign-in (never an auth screen, never off-site). */
export function safeReturnPath(from) {
  if (typeof from !== 'string' || !/^\/(?!\/|\\)/.test(from)) return '/';
  const path = from.split(/[?#]/)[0];
  return isPublicPath(path) && path !== '/' ? '/' : from;
}

export function isProtectedPath(pathname = '') {
  if (isPublicPath(pathname)) return false;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
