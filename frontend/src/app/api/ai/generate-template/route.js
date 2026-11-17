// Same-origin entry point for AI template generation. Accepts multipart
// (image + templateId) from the studio and forwards it, with the caller's
// bearer token, to the Express backend — which owns auth, credit metering and
// the GPU provider call (routes/aiTemplates.js). Provider secrets
// (REPLICATE_API_TOKEN / AI_WORKER_TOKEN) therefore live only on the backend,
// never in this bundle.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // generation can take minutes (Vercel plan limits still apply)

function backendBase() {
  const url = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE;
  return (url || 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

const json = (body, status) => Response.json(body, { status });

export async function POST(request) {
  const auth = request.headers.get('authorization');
  if (!auth) return json({ error: 'Please log in to generate AI videos.' }, 401);

  let incoming;
  try {
    incoming = await request.formData();
  } catch {
    return json({ error: 'Expected multipart form data.' }, 400);
  }
  const image = incoming.get('image');
  const templateId = incoming.get('templateId');
  // Duck-typed on purpose: `File` isn't a global on Node 18 runtimes, so `image instanceof File`
  // threw a ReferenceError (a 500) before the request ever reached the backend.
  const isFileLike = image && typeof image === 'object' && typeof image.arrayBuffer === 'function';
  if (!isFileLike || !templateId) {
    return json({ error: 'Choose a photo and a template to continue.' }, 400);
  }

  const outgoing = new FormData();
  outgoing.append('image', new Blob([await image.arrayBuffer()], { type: image.type || 'image/jpeg' }), image.name || 'selfie');
  outgoing.append('templateId', String(templateId));

  try {
    const res = await fetch(`${backendBase()}/ai/generate-template`, {
      method: 'POST',
      headers: { Authorization: auth },
      body: outgoing,
      signal: AbortSignal.timeout(285_000),
      cache: 'no-store',
    });
    // A non-JSON body (e.g. an HTML 502 page from a sleeping host) must not reach the UI as-is.
    const data = await res.json().catch(() => null);
    if (!data) return json({ error: 'Something went wrong. Please try again.' }, res.ok ? 502 : res.status);
    return json(data, res.status);
  } catch (err) {
    console.error('[api/ai/generate-template]', err);
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return json({ error: timedOut ? 'This is taking too long. Any credit used is refunded automatically.' : 'Connection lost. Please try again.' }, timedOut ? 504 : 502);
  }
}
