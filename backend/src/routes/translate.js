import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isLanguage } from '../utils/languages.js';
import { MAX_TRANSLATE_CHARS, translateText } from '../utils/translate.js';

const router = Router();

// Cache hits are cheap, so this is far looser than aiLimiter, but still bounds one account's spend.
const translateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests, please try again later.' }),
});

// POST /translate { text, targetLang? }  ->  { translated, sourceLang, unchanged, targetLang }
// targetLang defaults to the caller's saved display language.
router.post('/', requireAuth, translateLimiter, asyncHandler(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Nothing to translate.' });
  if (text.length > MAX_TRANSLATE_CHARS) return res.status(400).json({ error: 'That text is too long to translate.' });

  let targetLang = req.body?.targetLang;
  if (targetLang === undefined) {
    targetLang = (await prisma.user.findUnique({ where: { id: req.userId }, select: { displayLanguage: true } }))?.displayLanguage || 'en';
  }
  if (!isLanguage(targetLang)) return res.status(400).json({ error: 'Unsupported language.' });

  try {
    const r = await translateText(text, targetLang);
    res.json({ translated: r.translated, sourceLang: r.sourceLang, unchanged: r.unchanged, targetLang });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Translation is temporarily unavailable.' });
  }
}));

export default router;
