import { Router } from 'express';
import multer from 'multer';
import prisma from '../config/db.js';
import cloudinary from '../config/cloudinary.js';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// AI-generated video templates: GET /ai/templates, GET /ai/credits,
// POST /ai/generate-template (selfie + templateId -> MP4 URL).
//
// Provider selection (first configured wins):
//   AI_WORKER_URL        — your own Python/GPU worker (e.g. on Render). Receives multipart
//                          { image, modelEndpoint, templateId } and must answer JSON { videoUrl }.
//   REPLICATE_API_TOKEN  — Replicate. AiTemplate.modelEndpoint is "owner/model" or
//                          "owner/model:version"; the selfie is sent as a data URI under
//                          REPLICATE_IMAGE_INPUT_KEY (default "image").
// Neither set -> 503 before any credit is touched.

const router = Router();

const AI_WORKER_URL = process.env.AI_WORKER_URL;
const AI_WORKER_TOKEN = process.env.AI_WORKER_TOKEN;
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_IMAGE_KEY = process.env.REPLICATE_IMAGE_INPUT_KEY || 'image';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const GENERATION_TIMEOUT_MS = 4 * 60 * 1000;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(), // selfie goes straight to the GPU provider; never persisted
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const providerConfigured = () => Boolean(AI_WORKER_URL || REPLICATE_TOKEN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runWorker({ file, template }) {
  const form = new FormData();
  form.append('image', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'selfie');
  form.append('modelEndpoint', template.modelEndpoint);
  form.append('templateId', template.id);
  const res = await fetch(AI_WORKER_URL, {
    method: 'POST',
    headers: AI_WORKER_TOKEN ? { Authorization: `Bearer ${AI_WORKER_TOKEN}` } : undefined,
    body: form,
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.videoUrl) throw httpError(502, data.error || 'The AI worker failed to generate a video.');
  return data.videoUrl;
}

async function runReplicate({ file, template }) {
  const headers = { Authorization: `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait=60' };
  const input = { [REPLICATE_IMAGE_KEY]: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` };
  const [slug, version] = template.modelEndpoint.split(':');
  const isHashOnly = /^[a-f0-9]{64}$/i.test(template.modelEndpoint);
  const url = isHashOnly || version ? 'https://api.replicate.com/v1/predictions' : `https://api.replicate.com/v1/models/${slug}/predictions`;
  const body = isHashOnly ? { version: template.modelEndpoint, input } : version ? { version, input } : { input };

  const started = Date.now();
  let res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  let prediction = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(502, prediction.detail || 'The GPU provider rejected the request.');

  while (!['succeeded', 'failed', 'canceled'].includes(prediction.status)) {
    if (Date.now() - started > GENERATION_TIMEOUT_MS) throw httpError(504, 'Generation timed out. You have not been charged.');
    await sleep(2500);
    res = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` }, signal: AbortSignal.timeout(30_000) });
    prediction = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(502, 'Lost contact with the GPU provider.');
  }
  if (prediction.status !== 'succeeded') throw httpError(502, prediction.error || 'Generation failed. You have not been charged.');
  const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (typeof out !== 'string') throw httpError(502, 'The model returned no video.');
  return out;
}

// Provider URLs are temporary (Replicate deletes outputs after ~1h), and the
// studio needs something that outlives the session — so re-host on Cloudinary.
// If that fails, the provider URL is still returned rather than losing the result.
async function persistVideo(url) {
  try {
    const r = await cloudinary.uploader.upload(url, {
      resource_type: 'video',
      folder: 'clippulse/ai-generated',
    });
    return r.secure_url;
  } catch (err) {
    console.warn('[ai-templates] Cloudinary re-host failed, returning provider URL:', err.message);
    return url;
  }
}

router.get(
  '/templates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const where = { isActive: true };
    if (req.query.category) where.category = String(req.query.category);
    const templates = await prisma.aiTemplate.findMany({
      where,
      orderBy: [{ uses: 'desc' }, { createdAt: 'desc' }],
      // modelEndpoint is internal pipeline wiring — not sent to clients.
      select: { id: true, title: true, category: true, previewUrl: true, creditsCost: true, createdAt: true, uses: true, soundTitle: true },
    });
    res.json({ templates });
  })
);

router.get(
  '/credits',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { aiCredits: true } });
    res.json({ credits: user?.aiCredits ?? 0 });
  })
);

router.post(
  '/generate-template',
  requireAuth,
  aiLimiter,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const { templateId } = req.body || {};
    if (!templateId) throw httpError(400, 'templateId is required.');
    if (!req.file) throw httpError(400, 'Upload a selfie or portrait (field "image").');
    if (!ALLOWED_IMAGE_TYPES.has(req.file.mimetype)) throw httpError(400, 'Use a JPEG, PNG or WebP photo.');

    const template = await prisma.aiTemplate.findFirst({ where: { id: String(templateId), isActive: true } });
    if (!template) throw httpError(404, 'That template is no longer available.');
    if (!providerConfigured()) {
      throw httpError(503, 'AI video generation is not configured on this server (set REPLICATE_API_TOKEN or AI_WORKER_URL).');
    }

    // Charge first, atomically: the WHERE clause makes "enough credits" and
    // "decrement" one statement, so two concurrent taps can't both spend the last credit.
    const charged = await prisma.user.updateMany({
      where: { id: req.userId, aiCredits: { gte: template.creditsCost } },
      data: { aiCredits: { decrement: template.creditsCost } },
    });
    if (charged.count === 0) throw httpError(402, 'Not enough AI credits.');

    try {
      const providerUrl = await (AI_WORKER_URL ? runWorker : runReplicate)({ file: req.file, template });
      const videoUrl = await persistVideo(providerUrl);
      prisma.aiTemplate.update({ where: { id: template.id }, data: { uses: { increment: 1 } } }).catch(() => {});
      const { aiCredits } = await prisma.user.findUnique({ where: { id: req.userId }, select: { aiCredits: true } });
      res.json({ videoUrl, creditsRemaining: aiCredits, templateId: template.id });
    } catch (err) {
      // Any failure after charging gives the credit back.
      await prisma.user.update({ where: { id: req.userId }, data: { aiCredits: { increment: template.creditsCost } } }).catch((e) =>
        console.error('[ai-templates] REFUND FAILED for user', req.userId, e)
      );
      throw err;
    }
  })
);

// multer errors (file too large etc.) arrive here as plain errors; map to 400/413.
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (max 8 MB).' : err.message });
  }
  next(err);
});

export default router;
