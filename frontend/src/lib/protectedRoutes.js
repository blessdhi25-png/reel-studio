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

export function isProtectedPath(pathname = '') {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
