// Saved sessions for the in-app account switcher (Settings → Account Details).
//
// Each entry keeps that account's session token so switching doesn't need a
// password. That is the same credential the app already keeps in localStorage
// for the active account (and the cookie mirror), now held for up to
// MAX_ACCOUNTS accounts on this device only. Logging out removes the account
// being logged out; "Remove" in the switcher forgets any other one.
const KEY = 'clippulse_accounts';
export const MAX_ACCOUNTS = 5;

function read() {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((a) => a && a.id && a.token && a.user) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch {
    /* storage full/blocked — switcher just won't remember accounts */
  }
}

export function getAccounts() {
  return read();
}

// Upsert by user id; the most recently used account sorts first.
export function saveAccount(token, user) {
  if (!token || !user?.id) return read();
  const rest = read().filter((a) => a.id !== user.id);
  const next = [{ id: user.id, token, user }, ...rest].slice(0, MAX_ACCOUNTS);
  write(next);
  return next;
}

export function removeAccount(id) {
  const next = read().filter((a) => a.id !== id);
  write(next);
  return next;
}

// Keep the stored copy of the active account's profile (avatar, name) fresh.
export function updateAccountUser(id, patch) {
  const next = read().map((a) => (a.id === id ? { ...a, user: { ...a.user, ...patch } } : a));
  write(next);
  return next;
}

// Biometric lock: swap an account's stored full session token for the server's
// restricted "locked" token. It can't call any normal endpoint; the only way
// back to a full session is passing the fingerprint prompt (lib/biometrics.js).
export function lockAccount(id, lockedToken) {
  const next = read().map((a) => (a.id === id ? { ...a, token: lockedToken, locked: true } : a));
  write(next);
  return next;
}
