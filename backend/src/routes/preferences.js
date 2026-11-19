import { Router } from 'express';
import prisma from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { MAX_CONTENT_LANGUAGES, isLanguage } from '../utils/languages.js';

// Settings → Language. Each change is saved as it is made (PATCH takes any subset of the fields).
const router = Router();
const SELECT = { displayLanguage: true, translateContent: true, contentLanguages: true };

router.get('/users/me/language', requireAuth, asyncHandler(async (req, res) => {
  res.json(await prisma.user.findUnique({ where: { id: req.userId }, select: SELECT }));
}));

router.patch('/users/me/language', requireAuth, asyncHandler(async (req, res) => {
  const { displayLanguage, translateContent, contentLanguages } = req.body || {};
  const data = {};
  if (displayLanguage !== undefined) {
    if (!isLanguage(displayLanguage)) return res.status(400).json({ error: 'Unsupported language.' });
    data.displayLanguage = displayLanguage;
  }
  if (translateContent !== undefined) {
    if (typeof translateContent !== 'boolean') return res.status(400).json({ error: 'Invalid value for translation.' });
    data.translateContent = translateContent;
  }
  if (contentLanguages !== undefined) {
    if (!Array.isArray(contentLanguages) || !contentLanguages.every(isLanguage)) return res.status(400).json({ error: 'Unsupported content language.' });
    const unique = [...new Set(contentLanguages)];
    if (unique.length > MAX_CONTENT_LANGUAGES) return res.status(400).json({ error: `Choose up to ${MAX_CONTENT_LANGUAGES} content languages.` });
    data.contentLanguages = unique;
  }
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update.' });
  res.json(await prisma.user.update({ where: { id: req.userId }, data, select: SELECT }));
}));

export default router;
