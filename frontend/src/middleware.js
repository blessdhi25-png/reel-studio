import { NextResponse } from 'next/server';

// Route guard for the /admin/* section. This is a UX-layer gate, not the
// real security boundary — it exists so a signed-out visitor or an
// ordinary user never even sees the admin shell start to load. The actual,
// unbypassable enforcement lives on the backend: every /api/v1/admin/*
// route re-verifies the JWT and re-reads the user's *current* role from
// the database on every request (see backend/src/middleware/auth.js's
// requireAuth + requireRole/authorizeRoles, applied in
// backend/src/routes/admin.js). Someone could hand-edit these cookies in
// devtools and still load this shell — every API call it makes would
// immediately 403 from the backend regardless, because the backend never
// trusts anything the client claims about its own role.
//
// Why cookies instead of localStorage: middleware runs on the edge, before
// any page JS executes — it has no access to localStorage at all, only to
// the request's cookies and headers. AuthContext.login()/logout() mirror
// the token + role into cookies specifically so this file has something to
// read (see frontend/src/lib/cookies.js for the full explanation).
export const config = {
  matcher: ['/admin/:path*'],
};

const ADMIN_ROLES = ['admin', 'moderator'];

export function middleware(request) {
  const cookieToken = request.cookies.get('token')?.value;

  // Fallback for a bearer token arriving via a request header instead of a
  // cookie (e.g. a non-browser client, or a future server-side caller of
  // this same middleware chain). In practice, ordinary browser navigation
  // to an /admin/* page never carries a custom Authorization header —
  // that's only ever set by this app's own fetch() calls to the *backend*
  // API host in lib/api.js, not by the browser loading a Next.js page — so
  // the cookie is what actually matters here day to day.
  const authHeader = request.headers.get('authorization');
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const token = cookieToken || headerToken;
  const role = request.cookies.get('role')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    // Harmless if the login page doesn't currently read this — it's just
    // there so a "redirect back to where they were headed" flow can be
    // added to the login page later without touching this file again.
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}
