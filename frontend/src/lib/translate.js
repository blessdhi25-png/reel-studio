// Client for POST /api/translate. Results are cached per (target language, text) for the session and
// identical in-flight requests are shared, so scrolling back to a caption or re-opening a comment thread
// costs nothing. At most MAX_PARALLEL requests run at once so a long comment list can't stampede the endpoint.
const MAX_PARALLEL = 4;
const cache = new Map(); // `${lang}\n${text}` -> { translated, unchanged }
const inflight = new Map();
let running = 0;
const waiting = [];

function slot() {
  if (running < MAX_PARALLEL) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

function token() {
  try {
    return window.localStorage.getItem('token');
  } catch {
    return null;
  }
}

export function getCachedTranslation(text, targetLang) {
  return cache.get(`${targetLang}\n${text}`) || null;
}

export function translateText(text, targetLang) {
  const key = `${targetLang}\n${text}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    await slot();
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ text, targetLang }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.translated) {
        const err = new Error(data?.error || 'Translation failed');
        err.status = res.status;
        throw err;
      }
      const result = { translated: data.translated, unchanged: !!data.unchanged };
      cache.set(key, result);
      return result;
    } finally {
      release();
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
