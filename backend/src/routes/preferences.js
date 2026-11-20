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

// ── Contacts sync (Settings → Contacts and location) ────────────────────────────────────────────
// The browser hands over only what the person picks; the app hashes each phone number / email before it
// leaves the device, so the server never stores a contact in the clear.
const MAX_SYNC = 500;
const HASH = /^[a-f0-9]{64}$/;

router.get('/users/me/contacts', requireAuth, asyncHandler(async (req, res) => {
  const rows = await prisma.syncedContact.groupBy({ by: ['source'], where: { userId: req.userId }, _count: { _all: true } });
  const count = (src) => rows.find((r) => r.source === src)?._count._all || 0;
  res.json({ contacts: count('contacts'), facebook: count('facebook') });
}));

router.post('/users/me/contacts/sync', requireAuth, asyncHandler(async (req, res) => {
  const hashes = Array.isArray(req.body?.hashes) ? [...new Set(req.body.hashes.filter((h) => typeof h === 'string' && HASH.test(h)))] : [];
  if (!hashes.length) return res.status(400).json({ error: 'No contacts to sync.' });
  if (hashes.length > MAX_SYNC) return res.status(400).json({ error: `Sync up to ${MAX_SYNC} contacts at a time.` });
  await prisma.syncedContact.createMany({ data: hashes.map((hash) => ({ userId: req.userId, source: 'contacts', hash })), skipDuplicates: true });
  res.json({ contacts: await prisma.syncedContact.count({ where: { userId: req.userId, source: 'contacts' } }) });
}));

// DELETE /users/me/contacts?source=contacts|facebook  removes previously synced contacts
router.delete('/users/me/contacts', requireAuth, asyncHandler(async (req, res) => {
  const source = req.query.source === 'facebook' ? 'facebook' : 'contacts';
  const { count } = await prisma.syncedContact.deleteMany({ where: { userId: req.userId, source } });
  res.json({ removed: count });
}));

export default router;
