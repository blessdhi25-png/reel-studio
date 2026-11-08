// ClipPulse AI worker — a standalone HTTP service the main backend calls via AI_WORKER_URL.
//
//   POST /generate   multipart: image (file), modelEndpoint, templateId
//   -> 200 { "videoUrl": "https://..." }
//   GET  /health     -> 200 { ok: true }
//
// Auth: if AI_WORKER_TOKEN is set, requests must send `Authorization: Bearer <token>`.
// The worker itself needs no GPU: it runs the template's model on Replicate
// (REPLICATE_API_TOKEN). To use your own GPU/model instead, replace runModel().
// Zero dependencies; needs Node 18+.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.AI_WORKER_TOKEN || '';
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const REPLICATE_BASE = (process.env.REPLICATE_API_BASE || 'https://api.replicate.com/v1').replace(/\/$/, '');
const IMAGE_KEY = process.env.REPLICATE_IMAGE_INPUT_KEY || 'image';
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = Number(process.env.GENERATION_TIMEOUT_MS || 4 * 60 * 1000);
const POLL_MS = Number(process.env.POLL_MS || 2500);
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (status, message) => Object.assign(new Error(message), { status });

function authorized(req) {
  if (!TOKEN) return true;
  const given = Buffer.from(req.headers.authorization || '');
  const want = Buffer.from(`Bearer ${TOKEN}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

// modelEndpoint: "owner/model", "owner/model:version", or a bare 64-hex version id.
async function runModel({ buffer, mime, modelEndpoint }) {
  if (!REPLICATE_TOKEN) throw fail(503, 'Worker is missing REPLICATE_API_TOKEN.');
  const headers = { Authorization: `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait=60' };
  const input = { [IMAGE_KEY]: `data:${mime};base64,${buffer.toString('base64')}` };
  const [slug, version] = modelEndpoint.split(':');
  const hashOnly = /^[a-f0-9]{64}$/i.test(modelEndpoint);
  const url = hashOnly || version ? `${REPLICATE_BASE}/predictions` : `${REPLICATE_BASE}/models/${slug}/predictions`;
  const body = hashOnly ? { version: modelEndpoint, input } : version ? { version, input } : { input };

  const started = Date.now();
  let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  let p = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(502, p.detail || 'Replicate rejected the request.');
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    if (Date.now() - started > TIMEOUT_MS) throw fail(504, 'Generation timed out.');
    await sleep(POLL_MS);
    res = await fetch(p.urls.get, { headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` }, signal: AbortSignal.timeout(30_000) });
    p = await res.json().catch(() => ({}));
    if (!res.ok) throw fail(502, 'Lost contact with Replicate.');
  }
  if (p.status !== 'succeeded') throw fail(502, p.error || 'Model run failed.');
  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  if (typeof out !== 'string') throw fail(502, 'Model returned no video.');
  return out;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES + 512 * 1024) throw fail(413, 'Upload too large.');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function handleGenerate(req) {
  const ct = req.headers['content-type'] || '';
  if (!ct.startsWith('multipart/form-data')) throw fail(400, 'Expected multipart/form-data.');
  const form = await new Request('http://x/', { method: 'POST', headers: { 'content-type': ct }, body: await readBody(req) }).formData();
  const image = form.get('image');
  const modelEndpoint = String(form.get('modelEndpoint') || '').trim();
  if (!image || typeof image === 'string') throw fail(400, 'Field "image" is required.');
  if (!modelEndpoint) throw fail(400, 'Field "modelEndpoint" is required.');
  if (!TYPES.has(image.type)) throw fail(400, 'Use a JPEG, PNG or WebP photo.');
  if (image.size > MAX_BYTES) throw fail(413, 'Photo is too large (max 8 MB).');
  const videoUrl = await runModel({ buffer: Buffer.from(await image.arrayBuffer()), mime: image.type, modelEndpoint });
  return { videoUrl };
}

const send = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

export const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && req.url === '/generate') {
      if (!authorized(req)) return send(res, 401, { error: 'Unauthorized.' });
      return send(res, 200, await handleGenerate(req));
    }
    send(res, 404, { error: 'Not found.' });
  } catch (err) {
    if (!err.status) console.error('[ai-worker]', err);
    send(res, err.status || 500, { error: err.status ? err.message : 'Internal worker error.' });
  }
});

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  server.requestTimeout = 0; // generations outlive Node's default 5-minute request timeout
  server.listen(PORT, () => console.log(`AI worker listening on :${PORT}${TOKEN ? '' : ' (WARNING: no AI_WORKER_TOKEN, endpoint is open)'}`));
}
