import { NextResponse } from 'next/server';
import { PROTECTED_PREFIXES, isPublicPath } from './lib/protectedRoutes';

// Route guard for signed-in-only screens (see lib/protectedRoutes.js) and the /admin/* + /moderator/* sections.
// This is a UX-layer gate, not the real security boundary — the backend re-verifies the JWT (and re-reads
// the role from the database) on every API call, so editing cookies in devtools only ever shows an empty shell.
//
// Why cookies instead of localStorage: middleware runs on the edge, before any page JS executes — it can
// only see the request's cookies and headers. AuthContext.login()/logout() mirror the token + role into
// cookies specifically so this file has something to read (see frontend/src/lib/cookies.js).
//
// Back-button protection: every response from these routes is `Cache-Control: no-store`, so the browser
// can't serve a signed-in page from its HTTP cache or back/forward cache after logout. Going "back" makes a
// fresh request with the (now deleted) cookie, and this middleware sends it to /login.
export const config = {
  matcher: PROTECTED_PREFIXES.map((p) => `${p}/:path*`),
};

const ADMIN_ROLES = ['admin']; // admin portal is admin-only
const MODERATOR_ROLES = ['moderator', 'admin']; // moderator portal also lets admins in

function noStore(res) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export function middleware(request) {
  const cookieToken = request.cookies.get('token')?.value;

  // Fallback for a bearer token arriving via a request header (non-browser callers).
  const authHeader = request.headers.get('authorization');
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const token = cookieToken || headerToken;
  const role = request.cookies.get('role')?.value;
  const { pathname } = request.nextUrl;

  // Public/auth routes always pass straight through. The matcher already excludes them, but this keeps
  // the guarantee local to the redirect logic: nothing here may ever redirect /login (or any redirect
  // target) back onto itself.
  if (isPublicPath(pathname)) return NextResponse.next();

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname + request.nextUrl.search);
    return noStore(NextResponse.redirect(loginUrl));
  }

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isModerator = pathname === '/moderator' || pathname.startsWith('/moderator/');
  if (isAdmin || isModerator) {
    const allowed = isModerator ? MODERATOR_ROLES : ADMIN_ROLES;
    // '/' is public, so this single hop ends there.
    if (!allowed.includes(role)) return noStore(NextResponse.redirect(new URL('/', request.url)));
  }

  return noStore(NextResponse.next());
}
