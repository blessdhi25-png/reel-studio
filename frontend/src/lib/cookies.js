'use client';

// Plain document.cookie helpers — deliberately small and dependency-free.
// These exist for exactly one reason: Next.js Edge Middleware (see
// src/middleware.js) runs on the server/edge before any page JS executes,
// so it has no access to localStorage — only to cookies and request
// headers. AuthContext keeps localStorage as the actual source of truth
// (see its own comment for why), and mirrors the token + role into cookies
// purely so middleware has something to read for the /admin/* route guard.
//
// Note on security model: these are plain JS-readable/writable cookies
// (not httpOnly — client-side JS can't set httpOnly cookies at all; only a
// server response's Set-Cookie header can). That means they carry the same
// XSS exposure as localStorage already did — this isn't a regression, but
// it's also not the stronger httpOnly-cookie-from-the-server setup a
// security-critical admin surface would ideally use. The middleware guard
// built on top of these is a UX convenience (don't let a non-admin's
// browser even load the admin shell) — the real, unbypassable enforcement
// is the backend's authorizeRoles/requireRole middleware, which re-checks
// the actual role from the database on every single admin API request
// regardless of what any cookie claims.

function isHttps() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

export function setCookie(name, value, maxAgeSeconds) {
  if (typeof document === 'undefined') return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ];
  // Secure cookies are silently refused by the browser over plain http —
  // only add the flag when we're actually on https (e.g. local dev over
  // http still needs the cookie to be set at all).
  if (isHttps()) parts.push('Secure');
  document.cookie = parts.join('; ');
}

export function deleteCookie(name) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}
