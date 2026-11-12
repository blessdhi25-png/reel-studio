'use client';

import { usePathname } from 'next/navigation';

// Routes whose markup has dark: variants and therefore follows the light/dark theme.
// Add a route here once its page is converted. Everything else was built dark-only
// (hardcoded text-white / zinc-* on an implicit dark body), so it is wrapped in a
// forced-dark surface and renders exactly as it did before light became the default.
const THEMED_ROUTES = ['/friends', '/menu', '/welcome', '/moderator', '/profile', '/settings'];
// Sub-routes of a themed route that have NOT been converted yet stay forced-dark.
const LEGACY_EXCEPTIONS = ['/profile/edit'];

export function isThemedRoute(pathname) {
  if (LEGACY_EXCEPTIONS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return false;
  return THEMED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export default function ThemeSurface({ children }) {
  const pathname = usePathname() || '/';
  if (isThemedRoute(pathname)) return children;
  // Plain div: no transform/filter/contain, so position:fixed descendants are unaffected.
  // min-h-dvh (not min-h-screen): equals the feed's own h-dvh, so the wrapper adds no extra
  // page scroll on mobile where 100vh is taller than the visible viewport.
  return <div className="dark bg-ink text-bone min-h-dvh">{children}</div>;
}
