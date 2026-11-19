// Same-origin entry point for caption/comment translation: POST { text, targetLang? } -> { translated, sourceLang, unchanged }.
// It forwards the caller's bearer token to the Express backend (routes/translate.js), which owns auth, rate
// limiting, the model call and the cache (in-memory + the TranslationCache table). The provider key stays
// server-side on the backend, never in this bundle.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function backendBase() {
  const url = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE;
  return (url || 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

const json = (body, status) => Response.json(body, { status });

export async function POST(request) {
  const auth = request.headers.get('authorization');
  if (!auth) return json({ error: 'Please log in to translate.' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  if (typeof body?.text !== 'string' || !body.text.trim()) return json({ error: 'Nothing to translate.' }, 400);

  try {
    const res = await fetch(`${backendBase()}/translate`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: body.text, ...(body.targetLang ? { targetLang: body.targetLang } : {}) }),
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    if (!data) return json({ error: 'Something went wrong. Please try again.' }, res.ok ? 502 : res.status);
    return json(data, res.status);
  } catch (err) {
    console.error('[api/translate]', err);
    return json({ error: 'Connection lost. Please try again.' }, 502);
  }
}
