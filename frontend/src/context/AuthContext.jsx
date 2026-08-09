'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function readStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // corrupted JSON in localStorage shouldn't crash the app
  }
}

function readStoredToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

// localStorage stays the actual source of truth on disk — this Context is a
// live, reactive mirror of it, not a replacement. That's deliberate: ~28
// files across the app read localStorage.getItem('user'/'token') directly
// today, mostly with a one-shot `useEffect(() => setUser(...), [])` that
// only ever reflects whatever was in storage at mount time. That pattern is
// exactly what causes stale-avatar/stale-auth-state bugs (BottomNav used to
// have to re-read on every pathname change just to work around it — see
// below). Writing to localStorage here keeps every one of those 28 files
// working completely unchanged; consumers that want to *react* to auth
// changes (login/logout happening elsewhere, another tab logging out, a
// profile edit) should migrate to useAuth() instead, but nothing is broken
// for the ones that haven't yet.
export function AuthProvider({ children }) {
  // Both start null on the server and on the very first client render (SSR
  // has no localStorage, and reading it before that first render would
  // mismatch what the server sent and trigger a hydration warning) — the
  // effect below hydrates the real values immediately after mount.
  // `ready` distinguishes "haven't checked yet" from "checked, and there
  // really is no one signed in", so consumers that care (e.g. a route
  // guard) can avoid a flash of logged-out UI during that first tick.
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStoredUser());
    setToken(readStoredToken());
    setReady(true);

    // Keeps multiple tabs in sync — logging out in one tab, or the token
    // being cleared by another part of the app, reflects here without a
    // manual refresh. Note: the 'storage' event only ever fires in *other*
    // tabs/windows, never the one that made the write — that's why
    // login()/logout()/updateUser() below also update this tab's state
    // directly rather than relying on this listener for themselves.
    function onStorage(e) {
      if (e.key === USER_KEY) setUser(readStoredUser());
      if (e.key === TOKEN_KEY) setToken(readStoredToken());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = useCallback((newToken, newUser) => {
    window.localStorage.setItem(TOKEN_KEY, newToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  // For partial updates (e.g. after editing display name/avatar in
  // Settings) without needing a full re-login — merges onto whatever's
  // currently stored rather than requiring the caller to pass the whole
  // user object back.
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      window.localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, isAuthenticated: !!token, ready, login, logout, updateUser }),
    [user, token, ready, login, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Throws instead of silently returning undefined if used outside the
// provider — a component that assumes it has auth state but doesn't is a
// bug worth surfacing immediately, not one to silently no-op through.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be called within <AuthProvider>');
  }
  return ctx;
}
