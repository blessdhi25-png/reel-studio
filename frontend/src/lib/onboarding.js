// Onboarding / welcome-gate flags (device-local, localStorage).
//
//  token           — the real session token (owned by AuthContext; key is 'token', NOT 'auth_token')
//  has_seen_welcome — set once the person has chosen an option on /welcome
//  guest_mode      — set when they chose "Continue as Guest": browsing the public feed with no
//                    account. There is deliberately NO fake guest token — the backend has no guest
//                    identity, so a made-up token would make the app think someone is signed in
//                    and every authenticated call would 401.
export const SEEN_WELCOME_KEY = 'has_seen_welcome';
export const GUEST_KEY = 'guest_mode';

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback; // storage can throw (private mode, blocked site data)
  }
}

export const hasToken = () => safe(() => !!window.localStorage.getItem('token'), false);
export const hasSeenWelcome = () => safe(() => window.localStorage.getItem(SEEN_WELCOME_KEY) === '1', false);
export const isGuest = () => safe(() => window.localStorage.getItem(GUEST_KEY) === '1', false);

export function markWelcomeSeen({ guest = false } = {}) {
  safe(() => {
    window.localStorage.setItem(SEEN_WELCOME_KEY, '1');
    if (guest) window.localStorage.setItem(GUEST_KEY, '1');
    else window.localStorage.removeItem(GUEST_KEY);
  });
}

export const clearGuest = () => safe(() => window.localStorage.removeItem(GUEST_KEY));
