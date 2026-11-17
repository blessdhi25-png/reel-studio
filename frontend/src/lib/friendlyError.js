// Turns whatever a failed request produced into something safe to show a person.
//
// Accepts an Error (from lib/api.js request() — carries .status — or a raw fetch/XHR failure) or a
// plain { status, message } object for responses read by hand. Server messages are only passed
// through when they read like a sentence written for users (our 4xx validation errors do); anything
// that looks technical — stack/JSON fragments, env-var names, provider internals, 5xx bodies — is
// replaced with a generic line.
export const CONNECTION_LOST = 'Connection lost. Please try again.';
export const GENERIC_ERROR = 'Something went wrong. Please try again.';

const TECHNICAL = /(\{|\}|\[object|undefined|null\b|TypeError|ReferenceError|SyntaxError|ECONN|ENOTFOUND|ETIMEDOUT|prisma|replicate|cloudinary|REPLICATE_|AI_WORKER|_TOKEN|\.js\b|stack|at \S+ \(|<\/?\w+>|JWT|socket hang up|fetch failed|failed to fetch|networkerror)/i;

export function friendlyError(input, fallback = GENERIC_ERROR) {
  const status = input?.status;
  const message = typeof input === 'string' ? input : input?.message || input?.error || '';

  // No HTTP status means the request never completed: offline, DNS, CORS, aborted by timeout…
  if (!status) {
    if (input?.name === 'AbortError') return fallback;
    if (!message || /unable to connect|failed to fetch|network|load failed|took too long|timed out|waking up/i.test(message)) {
      return CONNECTION_LOST;
    }
    return TECHNICAL.test(message) ? fallback : message;
  }

  if (status === 401) return 'Your session expired. Please log in again.';
  if (status === 402) return 'You’re out of AI credits.';
  if (status === 403) return 'You don’t have permission to do that.';
  if (status === 404) return 'That item is no longer available.';
  if (status === 413) return 'That file is too large. Please choose a smaller one.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status === 408 || status === 504) return 'This is taking too long. Please try again.';
  if (status >= 500) return fallback;

  // Remaining 4xx: our own validation messages are user-facing; keep them if they look it.
  if (message && message.length <= 160 && !TECHNICAL.test(message)) return message;
  return fallback;
}
